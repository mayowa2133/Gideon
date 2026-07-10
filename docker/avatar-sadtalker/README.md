# SadTalker fictional-avatar worker

This container is the concrete `sadtalker` implementation of Gideon's avatar worker protocol. It is intentionally restricted to `orbit.png` and `nova.png` mounted from a catalog directory. It never accepts a face URL, reference voice, or arbitrary source portrait.

Required mounted directories:

- `/work/input`: private narration WAV input.
- `/work/output`: private request JSON and MP4 output.
- `/catalog`: the approved fictional `orbit.png` and `nova.png` assets from `assets/avatar-catalog`, read-only. Verify their hashes against `assets/avatar-catalog/manifest.json` before deployment.

Build/run with `docker compose -f docker-compose.avatar-worker.yml build`. The image has no network at runtime. Operators must review the model checkpoint/license and set `GIDEON_AVATAR_MODEL_VERSION`, `GIDEON_AVATAR_MODEL_LICENSE`, and `GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED=true` before use.

The worker prints exactly one JSON result to stdout. Gideon validates the result path and model receipt before importing the MP4 as a private `avatar_presenter` artifact.
