#!/usr/bin/env python3
"""Isolated MuseTalk adapter for fictional and consented self-avatar sources."""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

CATALOG = {"orbit": "orbit.png", "nova": "nova.png"}
DISCLOSURE = "AI-generated brand presenter"


def fail(message: str) -> None:
    print(json.dumps({"error": message}), file=sys.stderr)
    raise SystemExit(2)


def require_under(candidate: Path, root: Path, label: str) -> Path:
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError:
        fail(f"{label} must remain inside {root}.")
    return resolved


def verify_catalog_asset(avatar_id: str, asset_path: Path) -> None:
    manifest_path = Path("/catalog/manifest.json")
    if not manifest_path.is_file():
        fail("Fictional avatar catalog manifest is missing.")
    entries = json.loads(manifest_path.read_text(encoding="utf-8")).get("entries", [])
    entry = next((candidate for candidate in entries if candidate.get("id") == avatar_id), None)
    if not entry or entry.get("file") != asset_path.name or not entry.get("commercialApproved"):
        fail("Fictional avatar catalog entry is invalid.")
    if hashlib.sha256(asset_path.read_bytes()).hexdigest() != entry.get("sha256"):
        fail("Fictional avatar catalog asset hash does not match its manifest.")


def authorized_source(request: dict, avatar_id: str) -> tuple[Path, str]:
    consent = request.get("consent", {})
    source_image = request.get("sourceImagePath")
    if not source_image:
        if consent != {"assetType": "fictional_catalog", "status": "not_required"}:
            fail("Likeness consent requires a private custom source image.")
        source_path = Path("/catalog") / CATALOG[avatar_id]
        if not source_path.is_file():
            fail("Approved fictional avatar source is missing.")
        verify_catalog_asset(avatar_id, source_path)
        return source_path, "gideon_fictional_catalog"
    if (consent.get("assetType") != "real_likeness" or consent.get("status") != "granted"
            or not consent.get("sourceArtifactId") or consent.get("consentPolicyVersion") != "self-avatar-v1"
            or consent.get("subjectRelationship") != "self"):
        fail("Custom avatar generation requires verified likeness consent.")
    try:
        verified_at = datetime.fromisoformat(consent["consentVerifiedAt"].replace("Z", "+00:00"))
        expires_at = datetime.fromisoformat(consent["expiresAt"].replace("Z", "+00:00")) if consent.get("expiresAt") else None
    except (KeyError, TypeError, ValueError):
        fail("Custom avatar consent timestamps are invalid.")
    now = datetime.now(timezone.utc)
    if verified_at.tzinfo is None or verified_at > now or (expires_at and (expires_at.tzinfo is None or expires_at <= now)):
        fail("Custom avatar consent is not active.")
    source_path = require_under(Path(source_image), Path("/work/input"), "custom avatar source")
    if not source_path.is_file():
        fail("Authorized custom avatar source is missing.")
    return source_path, "user_authorized_likeness"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    request_path = require_under(Path(args.request), Path("/work/output"), "request")
    request = json.loads(request_path.read_text(encoding="utf-8"))
    if request.get("provider") != "musetalk":
        fail("MuseTalk worker only accepts the musetalk provider.")
    avatar_id = request.get("avatarId")
    if avatar_id not in CATALOG:
        fail("MuseTalk worker requires an approved presenter identity.")
    if request.get("disclosure") != DISCLOSURE:
        fail("Avatar disclosure is required.")
    if not (500 <= int(request.get("durationMs", 0)) <= 60000):
        fail("Avatar duration is outside the supported short-form range.")

    model_version = os.environ.get("GIDEON_AVATAR_MODEL_VERSION", "").strip()
    model_license = os.environ.get("GIDEON_AVATAR_MODEL_LICENSE", "").strip()
    if not model_version or not model_license or os.environ.get("GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED") != "true":
        fail("MuseTalk model version, license, and commercial approval are required.")
    home = Path(os.environ["MUSETALK_HOME"])
    models = home / "models"
    required_models = [
        models / "musetalkV15/unet.pth",
        models / "musetalkV15/musetalk.json",
        models / "sd-vae/config.json",
        models / "sd-vae/diffusion_pytorch_model.bin",
        models / "whisper/config.json",
        models / "whisper/pytorch_model.bin",
        models / "whisper/preprocessor_config.json",
        models / "dwpose/dw-ll_ucoco_384.pth",
        models / "face-parse-bisent/79999_iter.pth",
        models / "face-parse-bisent/resnet18-5c106cde.pth",
    ]
    if not all(candidate.is_file() for candidate in required_models):
        fail("MuseTalk 1.5 and reviewed component models must be mounted read-only.")

    audio_path = require_under(Path(request["audioPath"]), Path("/work/input"), "audio")
    output_path = require_under(Path(request["outputPath"]), Path("/work/output"), "output")
    if not audio_path.is_file():
        fail("Approved narration audio is missing.")
    source_path, provenance = authorized_source(request, avatar_id)
    result_dir = output_path.parent / "musetalk-result"
    config_path = output_path.parent / f"{output_path.stem}-musetalk.json"
    config_path.write_text(json.dumps({
        "gideon": {
            "video_path": str(source_path),
            "audio_path": str(audio_path),
            "result_name": "gideon.mp4",
            "bbox_shift": 0,
        }
    }), encoding="utf-8")
    command = [
        sys.executable, "-m", "scripts.inference",
        "--inference_config", str(config_path),
        "--result_dir", str(result_dir),
        "--unet_model_path", str(models / "musetalkV15/unet.pth"),
        "--unet_config", str(models / "musetalkV15/musetalk.json"),
        "--whisper_dir", str(models / "whisper"),
        "--version", "v15",
        "--use_float16",
        "--ffmpeg_path", "/usr/bin",
    ]
    try:
        subprocess.run(command, check=True, cwd=home, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=900)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        fail("MuseTalk inference failed.")
    generated = result_dir / "v15" / "gideon.mp4"
    if not generated.is_file():
        fail("MuseTalk did not produce the expected MP4.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    generated.replace(output_path)
    config_path.unlink(missing_ok=True)
    print(json.dumps({
        "outputPath": str(output_path),
        "receipt": {
            "provider": "musetalk",
            "modelVersion": model_version,
            "modelLicense": model_license,
            "avatarId": avatar_id,
            "avatarProvenance": provenance,
            "disclosure": DISCLOSURE,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
    }))


if __name__ == "__main__":
    main()
