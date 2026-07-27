#!/usr/bin/env python3
"""Narrow JSON bridge for official local Resemble AI Chatterbox inference."""
from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import sys
import time
import wave
from pathlib import Path

MAX_STDIN_BYTES = 128 * 1024
MODEL_REPOS = {
    "chatterbox-turbo": "ResembleAI/chatterbox-turbo",
    "chatterbox": "ResembleAI/chatterbox",
}


def fail(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}), file=sys.stderr)
    raise SystemExit(2)


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def wav_duration_ms(file_path: Path) -> int:
    with wave.open(str(file_path), "rb") as handle:
        return round(handle.getnframes() / handle.getframerate() * 1000)


def main() -> None:
    signal.signal(signal.SIGTERM, lambda *_: raise_interrupt())
    raw = sys.stdin.buffer.read(MAX_STDIN_BYTES + 1)
    if len(raw) > MAX_STDIN_BYTES:
        fail("Request is too large.")
    try:
        request = json.loads(raw)
    except Exception:
        fail("Request is not valid JSON.")

    model_id = request.get("model")
    device = request.get("device")
    if model_id not in MODEL_REPOS or device not in ("mps", "cpu"):
        fail("Model or device is not allowlisted.")
    output_root = Path(request.get("outputRoot", "")).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    beats = request.get("beats")
    if not isinstance(beats, list) or not beats or len(beats) > 100:
        fail("Beats are invalid.")

    reference_path = request.get("referencePath")
    if reference_path:
        if request.get("referenceConsent") is not True:
            fail("Reference audio requires explicit consent.")
        supplied_reference = Path(reference_path).expanduser()
        if not supplied_reference.is_absolute() or supplied_reference.suffix.lower() not in (".wav", ".flac"):
            fail("Reference audio must be an absolute WAV or FLAC path.")
        reference = supplied_reference.resolve()
        if not reference.is_file() or reference.stat().st_size > 50 * 1024 * 1024:
            fail("Reference audio is missing or too large.")
        expected_hash = request.get("referenceSha256")
        if not expected_hash or sha256_file(reference) != expected_hash:
            fail("Reference audio hash does not match consent.")
        reference_path = str(reference)

    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    from huggingface_hub import snapshot_download
    import torch
    import torchaudio as ta
    if reference_path:
        reference_info = ta.info(reference_path)
        reference_seconds = reference_info.num_frames / reference_info.sample_rate
        if not (3.0 <= reference_seconds <= 60.0):
            fail("Reference audio duration must be between 3 and 60 seconds.")

    repo_id = MODEL_REPOS[model_id]
    if request.get("allowDownload"):
        local_dir = snapshot_download(repo_id=repo_id)
    else:
        local_dir = resolve_cached_snapshot(repo_id)
    revision = Path(local_dir).name
    started = time.monotonic()
    if model_id == "chatterbox-turbo":
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        model = ChatterboxTurboTTS.from_local(local_dir, device)
    else:
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_local(local_dir, device)
    loaded_seconds = time.monotonic() - started

    outputs = []
    for index, beat in enumerate(beats):
        beat_id = beat.get("id", "")
        text = beat.get("text", "")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", beat_id) or not isinstance(text, str) or not (1 <= len(text) <= 2000):
            fail("Beat identifier or text is invalid.")
        seed = int(beat.get("seed", int(request.get("seed", 0)) + index))
        torch.manual_seed(seed)
        generated_at = time.monotonic()
        kwargs = {"audio_prompt_path": reference_path}
        if model_id == "chatterbox-turbo":
            kwargs.update({"temperature": 0.78 if beat.get("energy") == "high" else 0.72})
        else:
            kwargs.update({"exaggeration": 0.45 if beat.get("energy") == "high" else 0.28, "cfg_weight": 0.45})
        wav = model.generate(text, **kwargs)
        output_path = (output_root / f"{beat_id}.wav").resolve()
        if output_path.parent != output_root:
            fail("Output path escaped its approved root.")
        ta.save(str(output_path), wav.cpu(), model.sr, encoding="PCM_S", bits_per_sample=16)
        outputs.append({
            "id": beat_id,
            "outputPath": str(output_path),
            "durationMs": wav_duration_ms(output_path),
            "sha256": sha256_file(output_path),
            "generationSeconds": round(time.monotonic() - generated_at, 3),
        })
    print(json.dumps({
        "ok": True,
        "package": "chatterbox-tts",
        "model": model_id,
        "modelRepo": repo_id,
        "modelRevision": revision,
        "device": device,
        "sampleRate": model.sr,
        "loadSeconds": round(loaded_seconds, 3),
        "watermark": "perth",
        "outputs": outputs,
    }))


def raise_interrupt() -> None:
    raise KeyboardInterrupt()


def resolve_cached_snapshot(repo_id: str) -> str:
    cache_root = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")).resolve() / "hub"
    repo_root = cache_root / f"models--{repo_id.replace('/', '--')}"
    ref = repo_root / "refs" / "main"
    if not ref.is_file():
        fail("The approved Chatterbox model is not present in the private local cache.")
    revision = ref.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"[0-9a-f]{40,64}", revision):
        fail("The cached Chatterbox model revision is invalid.")
    snapshot = (repo_root / "snapshots" / revision).resolve()
    if snapshot.parent != (repo_root / "snapshots").resolve() or not snapshot.is_dir():
        fail("The cached Chatterbox snapshot is invalid.")
    required = ("conds.pt", "s3gen_meanflow.safetensors", "t3_turbo_v1.safetensors", "ve.safetensors", "tokenizer_config.json")
    if repo_id.endswith("chatterbox-turbo") and not all((snapshot / name).is_file() for name in required):
        fail("The cached Chatterbox Turbo snapshot is incomplete.")
    return str(snapshot)


if __name__ == "__main__":
    main()
