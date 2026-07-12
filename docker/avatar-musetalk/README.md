# MuseTalk production avatar worker

This is Gideon's production-oriented MuseTalk 1.5 implementation of the shared avatar worker protocol. Source code is pinned to revision `0a89dec45a0192b824e3cf4daf96c239440c5ed8`; no weights are downloaded into the image or at runtime.

The operator must mount the complete reviewed MuseTalk `models` tree at `/opt/musetalk/models`, including MuseTalk 1.5, SD VAE, Whisper, DWPose, and face-parsing components. MuseTalk's code and trained model permit commercial use according to the official repository, but every component model must receive its own release/legal review.

The worker accepts only Gideon's hashed fictional catalog images or a private source image carrying matching active self/authorized-likeness consent. It captures upstream logs, emits one validated JSON receipt, has no runtime network, and never accepts a portrait URL or reference voice.

Use `docker-compose.avatar-musetalk.yml` on an approved NVIDIA GPU host. Run `pnpm avatar:worker:check` and then `pnpm avatar:worker:canary`; do not build or run this image as part of desktop startup.
