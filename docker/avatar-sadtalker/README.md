# SadTalker fictional-avatar worker

This container is the concrete `sadtalker` implementation of Gideon's avatar worker protocol. It accepts the approved `orbit.png` and `nova.png` catalog assets, plus a private project-owned self-likeness source when the request carries matching active consent provenance. It never accepts a face URL or reference voice.

Required mounted directories:

- `/work/input`: private narration WAV input.
- `/work/output`: private request JSON and MP4 output.
- `/catalog`: the approved fictional `orbit.png` and `nova.png` assets from `assets/avatar-catalog`, read-only. Verify their hashes against `assets/avatar-catalog/manifest.json` before deployment.
- `/opt/sadtalker/checkpoints`: an operator-provided, read-only checkpoint mount. Populate this outside the runtime container using the pinned SadTalker release instructions, then record its model version and license in Gideon configuration.
- `/opt/sadtalker/gfpgan/weights`: operator-provided, read-only facexlib alignment and detection weights. At minimum this must contain `alignment_WFLW_4HG.pth` and `detection_Resnet50_Final.pth`; these are required during preprocessing even when face enhancement is disabled.

Build/run with `docker compose -f docker-compose.avatar-worker.yml build`. Set `GIDEON_AVATAR_WORK_DIR`, `GIDEON_AVATAR_CATALOG_DIR`, `GIDEON_SADTALKER_MODEL_DIR`, and `GIDEON_SADTALKER_GFPGAN_MODEL_DIR` before using Compose. The image has no network at runtime. Operators must review the model checkpoint/license and set `GIDEON_AVATAR_MODEL_VERSION`, `GIDEON_AVATAR_MODEL_LICENSE`, and `GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED=true` before use.

Run `pnpm avatar:worker:check` before starting a worker. It verifies configuration, executable permissions, model artifact presence and minimum reviewed sizes, and the fictional catalog hashes without loading models into memory.

The worker prints exactly one JSON result to stdout. Gideon validates the result path and model receipt before importing the MP4 as a private `avatar_presenter` artifact.

Dependency resolution is constrained to PyTorch 2.2.2, torchvision 0.17.2, and a `pkg_resources`-compatible setuptools release. The image also applies BasicSR's one-line import migration from the removed `functional_tensor` module to the equivalent supported `torchvision.transforms.functional` module.
