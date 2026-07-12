#!/usr/bin/env python3
"""Isolated SadTalker adapter for fictional and consented self-avatar sources."""

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


def require_under(path: Path, root: Path, label: str) -> Path:
    resolved = path.resolve()
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
    digest = hashlib.sha256(asset_path.read_bytes()).hexdigest()
    if digest != entry.get("sha256"):
        fail("Fictional avatar catalog asset hash does not match its manifest.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    request_path = require_under(Path(args.request), Path("/work/output"), "request")
    request = json.loads(request_path.read_text(encoding="utf-8"))

    if request.get("provider") != "sadtalker":
        fail("SadTalker worker only accepts the sadtalker provider.")
    avatar_id = request.get("avatarId")
    if avatar_id not in CATALOG:
        fail("SadTalker worker only accepts Gideon fictional catalog avatars.")
    consent = request.get("consent", {})
    source_image = request.get("sourceImagePath")
    if source_image:
        if consent.get("assetType") != "real_likeness" or consent.get("status") != "granted" or not consent.get("sourceArtifactId"):
            fail("Custom avatar generation requires verified likeness consent.")
        try:
            verified_at = datetime.fromisoformat(consent["consentVerifiedAt"].replace("Z", "+00:00"))
            expires_at = datetime.fromisoformat(consent["expiresAt"].replace("Z", "+00:00")) if consent.get("expiresAt") else None
        except (KeyError, TypeError, ValueError):
            fail("Custom avatar consent timestamps are invalid.")
        now = datetime.now(timezone.utc)
        if verified_at.tzinfo is None or verified_at > now or (expires_at and (expires_at.tzinfo is None or expires_at <= now)):
            fail("Custom avatar consent is not active.")
    elif consent != {"assetType": "fictional_catalog", "status": "not_required"}:
        fail("Likeness consent requires a private custom source image.")
    if request.get("disclosure") != DISCLOSURE:
        fail("Avatar disclosure is required.")
    if not (500 <= int(request.get("durationMs", 0)) <= 60000):
        fail("Avatar duration is outside the supported short-form range.")

    model_version = os.environ.get("GIDEON_AVATAR_MODEL_VERSION", "").strip()
    model_license = os.environ.get("GIDEON_AVATAR_MODEL_LICENSE", "").strip()
    if not model_version or not model_license or os.environ.get("GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED") != "true":
        fail("SadTalker model version, license, and commercial approval are required.")
    checkpoints_dir = Path(os.environ["SADTALKER_HOME"]) / "checkpoints"
    if not checkpoints_dir.is_dir() or not any(checkpoints_dir.iterdir()):
        fail("SadTalker checkpoints must be mounted read-only by the operator.")
    face_model_dir = Path(os.environ["SADTALKER_HOME"]) / "gfpgan" / "weights"
    required_face_models = {"alignment_WFLW_4HG.pth", "detection_Resnet50_Final.pth"}
    if not face_model_dir.is_dir() or not required_face_models.issubset({item.name for item in face_model_dir.iterdir()}):
        fail("SadTalker face alignment and detection models must be mounted read-only by the operator.")

    audio_path = require_under(Path(request["audioPath"]), Path("/work/input"), "audio")
    output_path = require_under(Path(request["outputPath"]), Path("/work/output"), "output")
    avatar_path = require_under(Path(source_image), Path("/work/input"), "custom avatar source") if source_image else Path("/catalog") / CATALOG[avatar_id]
    if not audio_path.is_file() or not avatar_path.is_file():
        fail("Approved audio or avatar source asset is missing.")
    if not source_image:
        verify_catalog_asset(avatar_id, avatar_path)

    result_dir = output_path.parent / "sadtalker-result"
    command = [
        sys.executable,
        str(Path(os.environ["SADTALKER_HOME"]) / "inference.py"),
        "--driven_audio", str(audio_path),
        "--source_image", str(avatar_path),
        "--result_dir", str(result_dir),
        "--still",
    ]
    try:
        subprocess.run(
            command,
            check=True,
            cwd=os.environ["SADTALKER_HOME"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=900,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        fail("SadTalker inference failed.")
    candidates = sorted(result_dir.rglob("*.mp4"), key=lambda candidate: candidate.stat().st_mtime)
    if not candidates:
        fail("SadTalker did not produce an MP4.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    candidates[-1].replace(output_path)
    print(json.dumps({
        "outputPath": str(output_path),
        "receipt": {
            "provider": "sadtalker",
            "modelVersion": model_version,
            "modelLicense": model_license,
            "avatarId": avatar_id,
            "avatarProvenance": "user_authorized_likeness" if source_image else "gideon_fictional_catalog",
            "disclosure": DISCLOSURE,
            "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        },
    }))


if __name__ == "__main__":
    main()
