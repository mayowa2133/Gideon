# Avatar presenter implementation audit

**Audit date:** 2026-07-12

## Requirement evidence

| Plan requirement | Status | Current evidence |
|---|---|---|
| Creator-style product explanation | Complete | Evidence-backed scripts, creator templates, quick-cut EDLs, captions, callouts, cursor cues, benefit framing, and deterministic vertical renders are implemented and covered by content/render tests. |
| Presenter policy boundary | Complete | Default logo host, reviewed fictional catalog, mandatory disclosure, no reference-voice cloning, private artifacts, and human script/render approval gates. |
| Avatar contract and lineage | Complete | Versioned presenter EDL, model receipt, script revision, voiceover artifact, source-avatar artifact, consent provenance, and private storage lineage. |
| In-product preview | Complete | Static catalog selection preview plus a paused, user-controlled preview of the generated clip matching the current script/source revision. |
| Narration | Complete | Approved stock/provider TTS behind a private voiceover job and adapter. Reference voice and cloning inputs are rejected. |
| SadTalker prototype worker | Implemented; model canary pending | Pinned isolated worker, dependency constraints, offline checkpoint/facexlib mounts, preflight, consent boundary, host bridge, and receipt validation. |
| MuseTalk production worker | Implemented; model canary pending | Pinned MuseTalk 1.5 GPU image, operator-mounted component tree, shared consent protocol, no runtime network, bounded tmpfs, job-specific cleanup, preflight, and canary support. |
| Custom self avatar | Complete | PNG/JPEG content validation, private import, versioned `self-avatar-v1` attestation, source-artifact consent, revocation, worker mapping, receipt provenance, and stale-output invalidation. |
| Final video composition | Complete | Matching generated presenter MP4 is cropped/looped into the configured side before captions and disclosure; mismatched or stale output falls back to the deterministic presenter. |
| Release verification | Blocked | Syntax, type, unit, storage, worker-protocol, Compose config, real FFmpeg composition, frame-signal, and build checks pass. A real model-backed GPU canary has not completed. |

## Local resource decision

Do not download avatar model trees, create Python model environments, build CUDA images, or run portrait inference on the desktop Mac. The temporary local SadTalker environment and checkpoints used during investigation were removed, and no model process remains.

## GPU release unblock

On an approved NVIDIA GPU worker with reviewed model artifacts mounted:

1. Configure either the SadTalker or MuseTalk environment documented in its worker README.
2. Run `pnpm avatar:worker:check`. This reads file metadata and catalog hashes without loading models.
3. Run `pnpm avatar:worker:canary` with an absolute `GIDEON_AVATAR_CANARY_REPORT_PATH`.
4. Retain the path-free passing report with the release evidence.
5. Run one approved-script end-to-end staging render and visually confirm lip sync, disclosure, caption safe areas, and presenter framing.

The avatar rollout is not production-approved until steps 3-5 pass for the exact image and model artifact set being deployed.
