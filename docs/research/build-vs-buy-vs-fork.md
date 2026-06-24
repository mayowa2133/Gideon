# Gideon: build vs buy vs fork

**Decision date:** 2026-06-24
**Principle:** Buy commodity model quality and infrastructure when it accelerates learning; use mature open-source infrastructure directly; build the differentiated product logic; fork only when upstream code is strategically central, permissively licensed, and cheaper to own than to integrate.

## Decision matrix

| Capability | Decision | Candidate | Rationale | Exit trigger |
|---|---|---|---|---|
| Web application | Build on framework | Next.js/React/TypeScript | Product-specific UX; mature foundation | Split API only when measurable load/team boundaries require it |
| Auth | Buy/use library | Managed auth or Auth.js-compatible provider | Security-sensitive commodity | Migrate only for enterprise identity/control needs |
| Database | Use directly | PostgreSQL + Prisma | Mature, portable relational state | Revisit ORM if measured query/migration limits appear |
| Queue | Use directly | Redis + BullMQ | Mature Node job model and progress events | Move to managed workflow engine for multi-region/very long workflows |
| Object storage | Buy managed | R2 or S3 | Durability, signed URLs, lifecycle policy | Multi-cloud abstraction after real vendor constraint |
| Media primitives | Use directly | FFmpeg/ffprobe | Industry foundation; custom wrapper is smaller than a fork | None; replace build/version, not API contract |
| Composition | Use directly behind adapter | Remotion | Best React composition fit | Replace/add renderer if license, scale, or deterministic limits materialize |
| Transcription | Use directly/self-host | faster-whisper | Open, efficient, controllable | API fallback if latency/ops beats local economics |
| LLM analysis/scripts | Buy first behind adapter | One multimodal LLM provider | Quality/speed of learning matter most | Add provider routing when cost, reliability, or privacy demands it |
| TTS | Buy first behind adapter | Commercial TTS API | MVP narration quality and consistency | Add local provider when usage economics/privacy justify it |
| Upload scanning | Buy or managed integration | Malware scanning service/container | Security commodity with evolving signatures | Self-host only at scale/compliance need |
| Product-flow understanding | Build | Gideon evidence/flow model | Core moat | Never outsource source of truth |
| Marketing-angle engine | Build | Gideon prompts, taxonomy, eval set | Core differentiation and quality | Provider models remain replaceable |
| Edit decision model | Build | Gideon `EditDecisionList` | Stable boundary between AI and deterministic execution | Version, do not replace ad hoc |
| Render templates | Build | Gideon Remotion components | Brand/native output quality | Marketplace in v2 |
| Review editor | Build constrained | Gideon domain editor | Only exposes valuable edits; avoids NLE scope | Expand from observed user needs |
| Structured capture | Use + build adapter in v2 | rrweb | Mature capture core; Gideon normalization is custom | Custom recorder only if fidelity/privacy cannot be met |
| Clean replay | Use + build adapter in v2 | Playwright | Mature deterministic automation | Add browser service only at scale |
| MCP | Build later | Gideon MCP facade | Must enforce Gideon auth/jobs/policies | Ship only when user demand exists |

## Use directly

### FFmpeg/ffprobe

Use the official binaries/libraries through a narrowly typed wrapper. Do not fork. Pin the exact build and record whether it is LGPL or GPL. Keep every operation allowlisted and sandboxed.

### faster-whisper

Use in a Python worker. Pin package, model, compute type, VAD configuration, and output schema. Preserve a transcription-provider interface for API fallback and model upgrades.

### Playwright

Use immediately for end-to-end testing and later for clean replay. Do not expose arbitrary user scripts. Gideon owns the reviewed replay specification, credentials boundary, and environment cleanup.

### rrweb (v2)

Use the recorder/replayer packages rather than rebuilding DOM serialization. Gideon builds redaction, consent, normalization, storage limits, semantic event extraction, and synchronization to video.

### Remotion, conditionally

Use behind an internal `Renderer` interface. The condition is explicit license review: current official terms allow individuals and companies up to three people free use and require a company license at four or more people. Add this trigger to operational/legal checklists.

## Buy first

### LLM inference

Buy a strong multimodal API to validate product value. Store prompts and schemas outside provider-specific code, log model/version/cost, and run a golden evaluation set before upgrades. Do not send raw unredacted rrweb DOM or secrets.

### TTS

Use a paid API for the MVP because narration quality is immediately visible. The provider contract returns audio, word/phoneme timings when available, duration, voice/version, and cost. Keep scripts editable before synthesis. Do not offer voice cloning in MVP.

### Authentication, storage, email, observability

These are commodity risk surfaces. Prefer managed services with export paths and standard protocols. Gideon still owns authorization, tenant scoping, deletion, and log redaction.

## Build custom

### Walkthrough evidence graph

Build a timestamped representation joining:

- media metadata and scene-change signals;
- transcript segments and words;
- sampled frames and OCR/UI descriptions;
- detected cursor/action evidence when available;
- product profile and target audience;
- human corrections and selections.

This is the stable basis for reasoning, not a raw model conversation.

### Moment detection and marketing strategy

Build a taxonomy and scoring system that separates “important product moment” from “good marketing beat.” A login screen may be a flow landmark but a poor hook; a before/after result may be both. Generate at least ten distinct, evidence-backed concepts with platform, format, target pain, proof moment, hook, and required source interval.

### Versioned prompt and evaluation system

Every prompt has an ID/version, JSON schema, input policy, forbidden generic phrases, and a golden regression set. Track specificity, evidence grounding, concept diversity, hook strength, timing feasibility, and prohibited-phrase rate.

### EditDecisionList and RenderManifest

AI may propose only schema-valid operations such as source range, crop mode, focus point, zoom interval, caption style, overlay cue, and audio cue. Deterministic code validates bounds and compiles that into a renderer-specific manifest. Never execute model-generated shell commands or JSX.

### Constrained review editor

Build only the edits users need to trust and improve drafts:

- concept/script approval;
- hook/caption text editing;
- source in/out adjustment;
- focus/crop position;
- caption style and safe-area preview;
- overlay timing/text;
- voice/tone selection;
- regenerate this stage, not whole project;
- export.

Do not build a general multitrack NLE for MVP.

## Study for inspiration only

| Tool | What to study | Why not depend/fork now |
|---|---|---|
| Palmier Pro | Shared agent/human timeline, MCP resources/tools, reversible commands | GPL, macOS-only, closed generation, moving API |
| video-use | Compact transcript representation, on-demand visual composites, EDL, self-eval | Agent shell runtime and ElevenLabs default |
| OpenMontage | Stage artifacts, approvals, budgets, provider adapters, quality gates | AGPL and excessive scope/youth |
| mcp-video | Typed operations, preflight, receipts, quality checkpoints | MCP/tool surface exceeds internal need |
| video-audio-mcp | Simple FastMCP wrappers and fixtures | Tiny/no-release project; thin safety model |
| ButterCut | Library/cut model, transcript reasoning, NLE XML | Noncommercial software license blocks SaaS use |
| claude-code-video-toolkit | Templates, repo conventions, reviewable assets | Coding agent is not a production orchestrator |
| OpenScreen | Click clustering, spring zoom, cursor telemetry, vertical focus | Native recorder is post-MVP |
| Recordly | Cross-platform recorder/editor UX | AGPL and desktop scope |
| Open Recorder | Swift/Rust service split and project telemetry | macOS capture scope |
| Remotion Recorder | Browser capture to composition flow | Capture not MVP; browser/codec complexity |
| browser-use | Recovery loops, semantic actions, action logs | Nondeterminism, prompt injection, credentials risk |
| auto-subtitle | Minimal Whisper→SRT→FFmpeg flow | Stale and too limited |
| OpenReel Video | Timeline/keyframe/caption editor interaction | Very young; WebGPU/WebCodecs compatibility risk |
| OpenShorts | Multi-container pipeline and practical clip generation | Paid defaults, avatars/posting, weak product-flow focus |
| short-video-maker | Minimal MCP/REST render service | Low activity and generic faceless-video focus |
| UniVA | Plan/Act separation, memory, tool routing, evaluation | Research-scale complexity/GPU/license aggregation |
| OpenKinoAI | Virtual reframing and subject-tracking concepts | Old/domain-mismatched research stack |

## Avoid for the current product path

### Open ScreenStudio (ambiguous)

No authoritative distinct repository was verified. Do not add a dependency based on a name collision or search result.

### Bark as production narration

Its generative expressiveness is a liability when the spoken script must be exact. It explicitly allows unexpected deviations and short outputs.

### Open-Sora in MVP

It solves generated footage, not walkthrough editing, and has large GPU/latency demands. Optional generated B-roll can be a later provider feature.

### MoviePy as the main renderer

It adds a Python composition layer without beating Remotion for template UX or direct FFmpeg for media primitives.

### Direct social posting in MVP

Platform tokens, policy compliance, account lockout, scheduling semantics, and deletion/retry behavior expand the risk surface without proving Gideon’s core value. Export first.

## Fork policy

No researched project should be forked for MVP. A fork is approved only when all conditions hold:

1. The exact upstream license permits Gideon’s commercial distribution/hosting model.
2. The code is on the critical path and integration cannot meet the need.
3. A named owner accepts ongoing security patches, upstream merges, releases, and tests.
4. The forked surface is materially smaller than a custom implementation.
5. An architecture decision record documents the exit strategy.

Potential future fork candidates are limited to small permissive UI/algorithm modules after code-level review. Palmier, OpenMontage, Recordly, and ButterCut are not fork candidates under the current product/licensing plan.

## Provider abstraction contracts

### Transcription provider

Input: private object reference, language hint, diarization flag, word-timing requirement.

Output: segments, words, confidence where available, language, duration, provider/model/version, warnings, cost.
Initial: faster-whisper. Fallback: paid API.

### Strategy provider

Input: redacted evidence bundle, product profile, platform targets, prompt version.

Output: schema-valid summary/moments/angles/scripts with evidence references and confidence.
Initial: one multimodal API. Add a second only after golden-set evaluation.

### TTS provider

Input: approved script, voice ID, locale, speaking style/rate.

Output: audio object, duration, timing marks if available, provider/voice/version, cost.
Initial: paid API. Later: Piper/Coqui/OpenVoice only after exact runtime/model/voice license review.

### Renderer

Input: immutable, versioned render manifest and signed/local asset map.

Output: preview/full artifact, ffprobe metadata, sampled QA frames, checksum, render metrics, warnings.
Initial: Remotion + FFmpeg. The manifest must not expose Remotion component internals to other services.

## Re-evaluation gates

- **At three team members:** review Remotion company licensing before hiring/member four.
- **At 1,000 rendered minutes/month:** compare TTS/transcription API cost against managed/self-hosted GPU workers.
- **When 20%+ of users request recorder integration:** prototype rrweb/browser capture manifest.
- **When manual crop corrections exceed 25% of drafts:** invest in cursor/UI saliency and structured flow capture.
- **When render p95 exceeds the product SLO:** profile composition and FFmpeg; then evaluate distributed render infrastructure.
- **Before voice cloning:** complete consent, revocation, audit, labeling, abuse, and legal review.
- **Before social posting:** complete platform policy/security review and token-isolation design.
