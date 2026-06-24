# Gideon open-source tools research

**Research date:** 2026-06-24

**Decision horizon:** MVP first, then a structured-capture v2
**Evidence rule:** maintenance and licensing statements below were checked against the linked project repository, official documentation, or paper. “Open source” is split into application code, model weights, and hosted/generative services; they are not treated as equivalent.

## Executive summary

Gideon should not fork a general-purpose video editor or build a full timeline editor for its MVP. The shortest credible path is a product-specific workflow with a deterministic media pipeline:

1. Next.js and TypeScript for the product UI and API boundary.
2. PostgreSQL with Prisma for durable product state.
3. Redis and BullMQ for idempotent, resumable media jobs.
4. S3-compatible private object storage for source and generated media.
5. FFmpeg/ffprobe in an isolated media worker for inspection, normalization, frame extraction, audio work, and final conformance.
6. faster-whisper in a Python worker for local transcription, with an API fallback behind a provider interface.
7. A provider-neutral LLM adapter for walkthrough analysis, moment detection, angles, hooks, and scripts.
8. A provider-neutral TTS adapter, using a commercial API first for consistent voice quality and moving to local TTS only when economics or privacy justify it.
9. Remotion for React-based composition, captions, overlays, zooms, and previewable templates, subject to its special commercial license.

The key product architecture is not “LLM writes FFmpeg commands.” It is a typed, versioned `EditDecisionList` and `RenderManifest` generated from evidence: source metadata, transcript words, sampled frames, detected scene/UI changes, and user product context. AI proposes creative decisions; deterministic workers validate and execute them. Every generated concept, script, and render remains editable by a human before export.

The best future product-flow foundation is rrweb plus Playwright, not a browser agent. rrweb can capture structured DOM mutations, clicks, scrolls, and interaction timing; Playwright can replay a reviewed flow into clean, repeatable footage. Browser-use is useful research for recovery and semantic browser control but is too nondeterministic and expensive for the primary capture path.

Palmier Pro is chiefly a product and protocol reference. Its Swift editor, agent chat, and MCP server are GPLv3, but its generative processing is explicitly closed and subscription-backed. Gideon should study its shared human/agent timeline, inspectable commands, and local MCP boundary, but should not make a macOS-only editor a runtime dependency.

## Direct answers to the research questions

1. **Palmier: dependency or inspiration?** Inspiration and optional interoperability experiment. Do not make it a core dependency.
2. **Fully open generative pipelines?** Whisper/faster-whisper, OpenVoice, Bark, Open-Sora, and many OpenMontage local-provider paths expose code and usable weights, but model-specific licenses and hardware costs still require review. Palmier’s generative processor is closed. OpenShorts and video-use rely on paid APIs for important default paths.
3. **Closed API dependencies?** video-use defaults to ElevenLabs Scribe; Palmier generation uses its closed service; OpenShorts defaults include Gemini, fal.ai, ElevenLabs, and Upload-Post; many OpenMontage “best quality” paths use cloud providers. These tools are open orchestrators, not necessarily open end-to-end systems.
4. **Production-ready?** FFmpeg, Playwright, PostgreSQL, S3-compatible storage, Redis/BullMQ, and the core Remotion renderer are mature enough with operational controls. rrweb is mature as capture infrastructure. Most agentic editors and AI-short generators are fast-moving references, not drop-in product infrastructure.
5. **Too research-heavy for MVP?** UniVA, Open-Sora, OpenKinoAI, autonomous browser agents, full rrweb capture/replay, local voice cloning, and a general timeline editor.
6. **Best MVP rendering stack?** Remotion for composition plus FFmpeg/ffprobe for media normalization, analysis, muxing, and conformance.
7. **Best future product-flow stack?** rrweb event capture plus a reviewed Playwright replay specification and deterministic browser recording.
8. **Can Remotion handle the need?** Yes: parameterized React compositions can handle 9:16 layouts, source-video placement, animated crop/zoom, captions, overlays, audio, and format variants. Validate render cost, Chromium behavior, and company licensing early.
9. **Node, Python, or both?** Both. Keep product/API/orchestration/render manifests in TypeScript. Use Python only for ML/media workloads with materially better libraries, initially faster-whisper. Workers communicate through versioned schemas and object storage.
10. **FFmpeg/upload risks?** Untrusted decoders, decompression/CPU bombs, protocol-driven SSRF, path/argument injection, disk exhaustion, malicious metadata, and stale codec builds. Run jobs in disposable, non-root containers with no shell interpolation, strict resource/egress/protocol limits, private storage, and current patched FFmpeg.
11. **Build custom?** Walkthrough evidence model, product-flow summarization, marketing-angle taxonomy, prompt/evaluation suite, edit-decision schema, review UI, job state machine, render templates, usage accounting, and security boundaries.
12. **Borrow/adapt?** Borrow video-use’s text-plus-on-demand-visual analysis, OpenMontage’s staged artifacts and quality gates, Palmier’s inspectable agent operations, mcp-video’s typed tool/receipt patterns, OpenScreen/Recordly’s auto-zoom heuristics, and OpenReel’s timeline interaction patterns.

## Comparison table

| # | Tool | Maintenance signal (2026-06-24) | License / openness | Default paid dependency | Gideon disposition |
|---:|---|---|---|---|---|
| 1 | Palmier Pro | Very active; v0.4.0 released 2026-06-23 | GPLv3 editor/MCP/chat; generative processing closed | Subscription for generation | Study; optional interoperability |
| 2 | video-use | Active, young; no formal releases | MIT; Python/FFmpeg helpers open | ElevenLabs Scribe by default | Study and adapt patterns |
| 3 | OpenMontage | Active, young; no formal releases | AGPLv3; Python/TS orchestration | Optional/many premium providers | Study; do not embed directly |
| 4 | mcp-video | Active releases and tests | Apache-2.0; Python, FFmpeg | No for core; optional add-ons | Study/adapt typed operations |
| 5 | video-audio-mcp | Small, six-commit project; no releases | MIT; Python/FastMCP/FFmpeg | No | Study only |
| 6 | ButterCut | Active; v0.7.2 on 2026-06-02 | PolyForm Noncommercial with output exception | No; local WhisperX | Study; cannot embed in SaaS |
| 7 | claude-code-video-toolkit | Active, young | MIT; mixed TS/Python/Remotion | Optional cloud GPU/providers | Study workflow/templates |
| 8 | OpenScreen | Active | MIT; Swift/macOS | No | Study zoom/cursor/export UX |
| 9 | Open ScreenStudio | No distinct canonical project verified | Ambiguous name | Unknown | Avoid until owner/repo clarified |
| 10 | Recordly | Active; v1.3.3 on 2026-05-28 | AGPLv3; Electron/TS/native helpers | No | Study; no code reuse without review |
| 11 | Open Recorder | Active; v0.2.29 on 2026-05-27 | Apache-2.0; Swift + Rust | No | Study architecture/telemetry |
| 12 | Remotion Recorder | Maintained template in Remotion monorepo | Remotion special license | No core API required | Study template only |
| 13 | rrweb | Maintained ecosystem; release cadence uneven | MIT; TypeScript | No | Use in v2 |
| 14 | Playwright | Very active, mature | Apache-2.0; TS/Node + browser binaries | No | Use for tests; v2 replay |
| 15 | browser-use | Very active; v0.13.2 on 2026-06-12 | MIT open agent; hosted cloud optional | LLM and optional Browser Use Cloud | Research only for v2 |
| 16 | Remotion | Very active; v4.0.477 on 2026-06-13 | Source-available special license; free for individuals/teams up to 3 | Company license at 4+ people | Use directly with license gate |
| 17 | FFmpeg | Mature, actively patched | LGPL/GPL depending build | No | Use directly in sandbox |
| 18 | MoviePy | Stable but lower maintenance velocity | MIT; Python wrapper/compositor | No | Prototype/tests only |
| 19 | Whisper | Mature open model baseline | MIT code and weights | No | Use as model family/reference |
| 20 | faster-whisper | Maintained; v1.2.1 current in checked sources | MIT; Python/CTranslate2 | No | Use directly in Python worker |
| 21 | auto-subtitle | Inactive/low activity; last indexed update 2024 | MIT; Python/Whisper/FFmpeg | No | Study; reimplement small pipeline |
| 22 | Piper | Original archived; development moved | MIT original; successor GPLv3 | No | Evaluate later; license-pin voices/runtime |
| 23 | Coqui TTS | Original stalled; Idiap fork active | MPL-2.0 code; model licenses vary | No | Evaluate later, not MVP default |
| 24 | OpenVoice | Research repo; slower maintenance | MIT code/models per repo | No | Future consent-gated option |
| 25 | Bark | Research release, low recent velocity | MIT code/checkpoints | No | Avoid for deterministic narration |
| 26 | OpenReel Video | Very young/active | MIT; React/TS/WebCodecs/WebGPU | No | Study UI; do not depend yet |
| 27 | OpenShorts | Active, early; no releases | MIT orchestrator | Gemini/fal.ai/ElevenLabs defaults | Study pipeline; do not fork now |
| 28 | short-video-maker | Low recent activity in checked metadata | MIT; TypeScript/Remotion/MCP | TTS/asset providers vary | Study minimal service shape |
| 29 | UniVA | 2025 research system | Open research claim; verify each model/tool license | Mix of local and API tools | Research inspiration only |
| 30 | Open-Sora | Latest major model 2.0 in 2025 | Apache-2.0 code; weights published | No, but major GPU cost | Avoid for MVP |
| 31 | OpenKinoAI | Research project from 2020; no current product signal | Open research framework; repo provenance unclear | No | Research inspiration only |

## Deep dives

### 1. Palmier / Palmier Pro

Palmier Pro is a native Swift, Apple-Silicon/macOS 26 nonlinear editor with multi-track media, effects, export, an in-app agent, and a local HTTP MCP server at `127.0.0.1:19789/mcp`. Its important design choice is that the human editor and agent mutate the same inspectable timeline instead of handing work to a black-box generator.

- **Openness and hosting:** The editor, MCP server, and chat are GPLv3 and local. Palmier states that generative processing is the only closed part and requires login/subscription. It is not a self-hostable generative stack.
- **Useful:** MCP resource/tool design, shared timeline state, reversible edits, clear separation between deterministic editing and model-backed generation, export to conventional NLEs.
- **Not useful:** macOS-only runtime, GPL coupling, full NLE scope, closed credit-backed generation.
- **Risk/integration:** High as a dependency (platform and GPL); medium for an optional export/MCP bridge; low to study. The fast-moving API also makes early coupling expensive.
- **Recommendation:** Study and prototype interoperability only after Gideon’s own render manifest is stable. Gideon’s source of truth must remain vendor-neutral.
- **Sources:** [official repository](https://github.com/palmier-io/palmier-pro), [product/FAQ](https://www.palmier.io/).

### 2. video-use

video-use is an MIT Python skill/toolbox for coding agents. It transcribes footage, compresses speech into a small timestamped text representation, generates visual timeline composites only at decision points, emits an edit decision list, renders with FFmpeg, and self-checks cut boundaries.

- **Openness and APIs:** Helpers are open and self-hostable. The documented default transcription path calls ElevenLabs Scribe, so the default end-to-end pipeline is not fully local.
- **Useful:** “text plus on-demand visuals,” word-boundary cuts, `Ask → confirm → execute → self-eval → persist`, small durable project memory, and bounded repair attempts.
- **Not useful:** Audio-first assumptions for screen-only walkthroughs and direct coding-agent orchestration as a production control plane.
- **Risk/integration:** Low to study; medium to adapt individual helpers; high to run an unconstrained coding agent against customer media.
- **Recommendation:** Recreate the analysis strategy behind typed worker interfaces; do not install the agent skill in production.
- **Source:** [official repository](https://github.com/browser-use/video-use).

### 3. OpenMontage

OpenMontage is an AGPLv3 Python-heavy agentic production workspace. It formalizes `research → proposal → script → scene plan → assets → edit → compose`, supports local and cloud providers, Remotion/FFmpeg composition, approval checkpoints, budgets, and post-render checks.

- **Openness and APIs:** The orchestrator is open and self-hostable. Provider quality varies; many showcased generations use paid services, while local alternatives need GPU capacity. No formal releases were published when checked.
- **Useful:** Stage artifacts, provider adapters, cost governance, audit trails, platform output profiles, quality gates, post-render inspection, and human approval at creative decisions.
- **Not useful:** Its broad production-studio scope, AGPL obligations, hundreds of agent instruction files, and topic-to-video asset research.
- **Risk/integration:** High operational and license surface if embedded; medium maintenance risk due to youth.
- **Recommendation:** Study its artifact boundaries and quality gates. Build a narrow Gideon-native pipeline.
- **Source:** [official repository](https://github.com/calesthio/OpenMontage).

### 4. mcp-video

mcp-video is an Apache-2.0 Python package, CLI, and MCP server exposing typed FFmpeg/media operations, discovery, preflight validation, quality checks, receipts, subtitles, audio, and platform repurposing.

- **Openness and APIs:** Core editing is local and open; optional extras add Whisper, image analysis, stems, upscaling, audio, or Hyperframes.
- **Useful:** Typed schemas around FFmpeg, discoverability without loading every tool, preflight checks, machine-readable receipts, and mandatory release checkpoints.
- **Not useful:** A 100+ tool surface in the MVP product runtime and MCP as an internal queue protocol.
- **Risk/integration:** Medium; the project is active but young. Each FFmpeg wrapper still requires security and output validation.
- **Recommendation:** Study/adapt its operation schemas and receipts. Consider a Gideon MCP server only in v2 for internal/enterprise automation, backed by the same authenticated service layer as the UI.
- **Sources:** [official repository](https://github.com/KyaniteLabs/mcp-video), [documentation](https://kyanitelabs.github.io/mcp-video/).

### 5. video-audio-mcp

This MIT Python/FastMCP server wraps FFmpeg operations such as trim, convert, aspect-ratio change, overlays, subtitles, B-roll, concatenation, silence removal, and transitions.

- **Openness:** Fully local for core operations; no generative AI layer.
- **Useful:** Small examples of turning media operations into typed MCP tools and test-generated fixtures.
- **Not useful:** Thin wrappers do not solve scheduling, tenant isolation, render determinism, asset provenance, or creative decisions.
- **Risk/integration:** Small project with six commits and no releases when checked; production readiness is low.
- **Recommendation:** Study only. Gideon should call its own parameterized media library/worker, not this MCP server.
- **Source:** [official repository](https://github.com/misbahsy/video-audio-mcp).

### 6. ButterCut

ButterCut turns footage libraries into single-track selects/rough cuts and exports editor XML. It combines Claude-oriented skills, Ruby timeline generation, FFmpeg, and WhisperX.

- **Openness:** Source is visible under PolyForm Noncommercial 1.0.0 with a commercial-output exception. Commercial videos are allowed, but embedding/hosting/repackaging the software in a commercial SaaS is not.
- **Useful:** Library/cut abstractions, transcript-plus-visual analysis, NLE XML export, and agent-facing workflow docs.
- **Not useful:** Single-track focus, Mac/Apple Silicon emphasis, and incompatible SaaS license.
- **Risk/integration:** Legal blocker for direct product use without a commercial agreement.
- **Recommendation:** Study the data model and export patterns; do not copy or embed code.
- **Source:** [official repository](https://github.com/barefootford/buttercut).

### 7. claude-code-video-toolkit

This MIT workspace packages agent commands, skills, Remotion templates, Playwright capture, scripts, provider setup, and optional open-model/cloud-GPU workflows.

- **Openness:** Workspace is open; advertised models are often open-weight, but running them may depend on Modal/cloud GPUs, R2, or other services.
- **Useful:** Project scaffolding, reviewable script/asset artifacts, template organization, and documented provider substitution.
- **Not useful:** Claude Code as the runtime orchestrator and broad text-to-video generation scope.
- **Risk/integration:** Young, moving rapidly, and operationally assumes agent shell access.
- **Recommendation:** Study its repository conventions and template testing. Keep production orchestration in BullMQ workers.
- **Source:** [official repository](https://github.com/digitalsamba/claude-code-video-toolkit).

### 8. OpenScreen

OpenScreen is an MIT native Swift screen recorder/editor for macOS with click telemetry, clustered auto-zoom, manual zoom blocks, cursor styles, styled framing, captions via on-device WhisperKit, vertical export, and an MCP server.

- **Openness:** Local, self-hostable source; no paid API required for core features.
- **Useful:** Click clustering, spring zooms, focus-area adaptation for 9:16, cursor telemetry, framing presets, and capture-to-edit flow.
- **Not useful:** Native recorder code in an upload-first web MVP.
- **Risk/integration:** Platform-specific and separate from server rendering.
- **Recommendation:** Study algorithms and UX; later consider compatible telemetry import rather than a fork.
- **Sources:** [official repository](https://github.com/siddharthvaddem/openscreen), [product site](https://openscreen.io/).

### 9. Open ScreenStudio

No distinct, authoritative project matching this exact name was verified. Search results consistently resolved to OpenScreen or generic “open Screen Studio alternative” projects.

- **Openness/maintenance/language:** Unverified; do not invent metadata.
- **Useful:** The category reinforces automatic zoom, cursor smoothing, and presentation framing.
- **Risk:** Name collision and supply-chain risk from choosing an unauthenticated repository.
- **Recommendation:** Avoid until a specific owner/repository is supplied. Use OpenScreen, Recordly, and Open Recorder as the verified references.

### 10. Recordly

Recordly is an AGPLv3 cross-platform Electron/TypeScript recorder and editor with native capture helpers, auto-zoom, cursor smoothing, timeline regions, audio, framing, and MP4/GIF export. It began as an OpenScreen fork and reports substantial divergence.

- **Openness:** Self-hostable source; no required paid AI API for core recording/editing.
- **Useful:** Cross-platform capture architecture, telemetry-driven zoom suggestions, project persistence, and dense but approachable editing controls.
- **Not useful:** Desktop runtime and AGPL code in the MVP SaaS.
- **Risk/integration:** Copyleft review required; user reports and project youth indicate export/platform reliability still needs independent testing.
- **Recommendation:** Study UX and file format; do not fork for MVP.
- **Source:** [official repository](https://github.com/webadderallorg/Recordly).

### 11. Open Recorder

Open Recorder is an Apache-2.0 native macOS application: SwiftUI owns capture/editor UX, while a Rust JSON-lines service owns paths, metadata, project registration, and export bookkeeping.

- **Openness:** Fully local and permissive. Core capture/edit needs no paid API.
- **Useful:** Separation between native UI and durable service, `.openrecorder` metadata, click/cursor telemetry, independent camera clips, crop/aspect/framing controls, and test aliases.
- **Not useful:** macOS-native capture in an upload-first browser product.
- **Risk/integration:** Platform-specific but a useful later recorder reference.
- **Recommendation:** Study architecture and telemetry schema. Prefer an interoperable capture manifest if Gideon later ships a recorder.
- **Source:** [official repository](https://github.com/imbhargav5/open-recorder).

### 12. Remotion Recorder

“Remotion Recorder” is best treated as Remotion’s maintained recorder template/docs rather than an independent platform. It demonstrates browser screen/camera capture and registration of recordings as Remotion compositions.

- **Openness:** Covered by Remotion’s special license, not a standard permissive OSS license.
- **Useful:** Browser MediaRecorder/Web APIs, immediate composition preview, and a direct path from captured media to a parameterized render.
- **Not useful:** Full recorder work in MVP and browser-dependent capture consistency.
- **Risk/integration:** Browser permissions, codec differences, large local blobs, crash recovery, and Remotion licensing.
- **Recommendation:** Study for a later web recorder; MVP accepts signed direct uploads.
- **Sources:** [Remotion repository](https://github.com/remotion-dev/remotion), [recorder rendering docs](https://www.remotion.dev/docs/recorder/lambda-rendering).

### 13. rrweb

rrweb records serialized DOM snapshots and incremental mutations with timestamps and replays them through a player. It captures structured interaction evidence more compactly than pixels.

- **Openness:** MIT TypeScript and self-hostable. A hosted rrweb Cloud exists but is optional.
- **Useful:** DOM/click/scroll/input timing, semantic targets, lightweight event streams, and replay. This can materially improve feature/moment understanding beyond frame sampling.
- **Not useful:** Native apps, canvas/WebGL fidelity, cross-origin iframes, secrets entered into fields, and immediate MVP upload flow.
- **Risk/integration:** PII/secret capture, DOM drift, custom components, replay fidelity, event volume, and consent. Aggressive masking and an allowlisted capture scope are mandatory.
- **Recommendation:** Use in v2 as an opt-in browser SDK. Convert raw events into a normalized `ProductFlowTrace`; never send raw sensitive DOM to an LLM.
- **Sources:** [official repository](https://github.com/rrweb-io/rrweb), [official site](https://www.rrweb.io/).

### 14. Playwright

Playwright is Microsoft’s Apache-2.0 browser automation framework for Chromium, Firefox, and WebKit. It can automate flows, take screenshots, record browser-context video, and produce DOM/network/screenshot traces.

- **Openness:** Self-hostable; browser binaries are downloaded. No paid API is required.
- **Useful:** Deterministic replay of approved flows, clean seeded accounts, stable viewport/device presets, screenshots, traces, and end-to-end testing.
- **Not useful:** Inferring an unknown product flow autonomously in MVP.
- **Risk/integration:** Flaky selectors, authentication/secrets, third-party sites, nondeterministic data, browser resource use, and audio limitations in context video.
- **Recommendation:** Use immediately for Gideon E2E tests. Add v2 “clean replay capture” from a reviewed, allowlisted action specification.
- **Sources:** [official repository](https://github.com/microsoft/playwright), [official docs](https://playwright.dev/).

### 15. Browser-use

browser-use is an MIT Python browser-agent framework with an open local agent and optional hosted browsers/cloud agent. It combines an LLM with browser state, actions, persistence, and recovery.

- **Openness and APIs:** The agent is self-hostable, but useful operation requires an LLM; the hosted cloud adds paid browser infrastructure, proxies, stealth, and CAPTCHA handling.
- **Useful:** Semantic action representations, recovery loops, action logs, and agent/browser separation.
- **Not useful:** Reliable, reproducible customer demo recording. Autonomous agents can take unintended actions and create inconsistent footage.
- **Risk/integration:** Prompt injection from pages, credential exposure, destructive actions, CAPTCHAs, variable cost/latency, and nondeterminism.
- **Recommendation:** Research-only until v2. If used, constrain it to disposable test accounts, allowlisted domains/actions, and human-approved plans.
- **Source:** [official repository](https://github.com/browser-use/browser-use).

### 16. Remotion

Remotion renders parameterized React compositions using browser/web media primitives and supports local/server rendering plus optional Lambda tooling.

- **Openness/license:** Source is public under a special license. It is free for individuals and companies up to three people; a company license is required at four or more people under the current official terms.
- **Useful:** React component reuse, deterministic frame-based animation, source video/audio, captions, overlays, responsive composition sizes, template versioning, previews, and multiple output codecs.
- **Not useful:** Low-level ingest/inspection, arbitrary transcoding, or untrusted source normalization; FFmpeg remains necessary.
- **Risk/integration:** Chromium memory/CPU, font and asset determinism, long-render cost, remote-asset availability, and licensing.
- **Recommendation:** Use directly for MVP compositions behind a `Renderer` interface. Pin versions, vendor fonts/assets, render from private signed inputs with short TTLs, and add a license-growth checkpoint.
- **Sources:** [official repository](https://github.com/remotion-dev/remotion), [official licensing](https://www.remotion.pro/license).

### 17. FFmpeg

FFmpeg is the mature command-line/library foundation for probing, decoding, filtering, cropping, scaling, trimming, muxing, subtitles, silence analysis, and MP4 export.

- **Openness:** LGPL by default; builds that include GPL components become GPL. Record the exact build configuration and license notices.
- **Useful:** `ffprobe` metadata, mezzanine normalization, sampled frames, audio extraction, silence/scene signals, crop/scale/pad, loudness normalization, muxing, and output validation.
- **Not useful:** Product logic or free-form LLM-generated command execution.
- **Risk/integration:** Untrusted codecs, resource bombs, network protocols/SSRF, command/path injection, disk exhaustion, and version-specific CVEs.
- **Recommendation:** Use directly in a non-root disposable worker with array-based arguments, a fixed operation allowlist, local paths only, `protocol_whitelist=file,pipe` where possible, CPU/RAM/time/output limits, no cloud metadata access, and a current pinned build.
- **Sources:** [official docs](https://www.ffmpeg.org/documentation.html), [filters](https://ffmpeg.org/ffmpeg-filters.html), [protocols](https://ffmpeg.org/ffmpeg-protocols.html), [security](https://www.ffmpeg.org/security.html).

### 18. MoviePy

MoviePy is an MIT Python video editing/compositing library that provides convenient cuts, concatenation, titles, and effects, usually over FFmpeg.

- **Openness:** Fully self-hostable and permissive.
- **Useful:** Prototypes, fixture generation, simple test media, and quick Python experiments.
- **Not useful:** The primary production renderer; its abstraction and performance are weaker than direct FFmpeg plus Remotion for Gideon’s needs.
- **Risk/integration:** Lower maintenance velocity, version migration churn, memory use, and hidden FFmpeg behavior.
- **Recommendation:** Do not place it on the critical path. Use only in developer utilities if it removes real complexity.
- **Source:** [official repository](https://github.com/Zulko/moviepy).

### 19. Whisper

Whisper is OpenAI’s multilingual encoder-decoder ASR family with transcription, language identification, translation, and timestamp support.

- **Openness:** MIT code and model weights; fully local inference is possible.
- **Useful:** Baseline transcript, segment timestamps, language handling, and an ecosystem of optimized runtimes.
- **Not useful:** Precise UI understanding or guaranteed word alignment. Hallucinations, especially in silence/noise, require validation.
- **Risk/integration:** GPU/CPU cost, long-file chunking, language accuracy variance, hallucinated text, and model age.
- **Recommendation:** Use the model family through faster-whisper, store model/version/config with every transcript, and preserve user correction.
- **Sources:** [official repository](https://github.com/openai/whisper), [model card](https://github.com/openai/whisper/blob/main/model-card.md).

### 20. faster-whisper

faster-whisper is an MIT CTranslate2 implementation of Whisper with quantization, batching, word timestamps, and lower memory/faster inference characteristics.

- **Openness:** Python package and runtime are local; converted Whisper models are available. No paid API required.
- **Useful:** Server-side batch transcription, word-level caption timing, VAD integration, CPU/GPU deployment choices.
- **Not useful:** Speaker-perfect alignment without additional tooling and UI/visual reasoning.
- **Risk/integration:** Native/CUDA compatibility, model warmup/cache, GPU scheduling, model download provenance, and word-timing quality.
- **Recommendation:** Use directly in a small Python worker. Start CPU-capable with a selected model; benchmark real screen recordings before buying GPU infrastructure.
- **Source:** [official repository](https://github.com/SYSTRAN/faster-whisper).

### 21. auto-subtitle

auto-subtitle is an MIT Python CLI that extracts audio, calls Whisper, writes SRT, and burns subtitles with FFmpeg.

- **Openness:** Fully local and simple, but inactive/low-maintenance.
- **Useful:** Minimal reference pipeline and SRT formatting.
- **Not useful:** Modern short-form caption design, word highlighting, editable caption data, worker isolation, and production observability.
- **Risk/integration:** Stale dependencies and one-shot CLI assumptions.
- **Recommendation:** Study, then implement the small necessary pipeline directly with faster-whisper and Remotion captions.
- **Source:** [official repository](https://github.com/m1guelpf/auto-subtitle).

### 22. Piper

Piper is a fast local VITS/ONNX TTS engine. The original MIT `rhasspy/piper` repository was archived in 2025; development moved to `OHF-Voice/piper1-gpl`, which is GPLv3 and released v1.4.2 in 2026.

- **Openness:** Local inference; runtime license changed by successor. Individual voice models can have their own licenses and must be audited separately.
- **Useful:** Cheap, private CPU narration and broad device support.
- **Not useful:** Premium founder-marketing voice quality as an MVP default.
- **Risk/integration:** Voice-license matrix, pronunciation/prosody quality, maintainer capacity, and GPL boundaries.
- **Recommendation:** Evaluate as a later low-cost/privacy provider behind the TTS interface. Never treat all voices as one license.
- **Sources:** [archived original](https://github.com/rhasspy/piper), [maintained successor](https://github.com/OHF-Voice/piper1-gpl).

### 23. Coqui TTS

Coqui TTS is a broad deep-learning speech toolkit. The original company repository slowed after the company closed; the Idiap community fork is active and publishes `coqui-tts`.

- **Openness:** Framework is MPL-2.0, but model licenses vary. XTTS model licensing is not equivalent to the framework license and may restrict commercial use.
- **Useful:** Provider experimentation, multilingual TTS, training/fine-tuning research, and later self-hosting.
- **Not useful:** A simple, legally uniform MVP voice provider.
- **Risk/integration:** Python/CUDA complexity, heavyweight models, fork provenance, and model-by-model commercial terms.
- **Recommendation:** Evaluate later through a provider adapter after legal review of the exact checkpoint.
- **Source:** [maintained Idiap fork](https://github.com/idiap/coqui-ai-TTS).

### 24. OpenVoice

OpenVoice is an MIT research implementation for instant cross-lingual voice cloning and tone-color transfer from short reference audio.

- **Openness:** Self-hostable code and released model assets; no paid API required for local inference.
- **Useful:** Future founder-voice templates and multilingual variants.
- **Not useful:** MVP core; voice cloning changes the product’s abuse, consent, biometric, and support profile.
- **Risk/integration:** Unauthorized impersonation, consent revocation, reference-audio security, watermark/disclosure expectations, GPU quality/latency, and language variance.
- **Recommendation:** Future opt-in only: verified speaker consent, liveness/ownership evidence where appropriate, explicit per-voice scope, audit logs, revocation/deletion, output labeling, and abuse monitoring.
- **Sources:** [official repository](https://github.com/myshell-ai/OpenVoice), [paper](https://arxiv.org/abs/2312.01479).

### 25. Bark

Bark is an MIT text-prompted generative audio model capable of speech, nonverbal sounds, music, and environmental audio.

- **Openness:** Code and checkpoints are available for local commercial use under MIT per the repository.
- **Useful:** Expressive research and sound-effect ideation.
- **Not useful:** Faithful deterministic voiceover. The project explicitly says it can deviate from text, outputs short chunks, and may need ~12 GB VRAM for the full model.
- **Risk/integration:** Script deviations, inconsistent voice, artifacts, long-form stitching, and low recent project velocity.
- **Recommendation:** Avoid for MVP narration; study only for optional expressive audio experiments.
- **Source:** [official repository](https://github.com/suno-ai/bark).

### 26. OpenReel Video

OpenReel Video is a very young MIT browser editor using React, TypeScript, WebCodecs, and WebGPU. It advertises multitrack editing, keyframes, karaoke captions, audio mixing, and client-side export.

- **Openness:** Client-side and self-hostable; no upload/API required for core editing.
- **Useful:** Timeline interaction patterns, keyframe UI, local preview, caption styling, undo/redo, and project serialization.
- **Not useful:** A production dependency before browser compatibility, memory, codec, and export claims are independently validated.
- **Risk/integration:** Project youth, WebCodecs/WebGPU support, large-media memory pressure, mobile/browser variability, and unverified edge cases.
- **Recommendation:** Study UI concepts. Build a constrained Gideon review editor around domain operations, not a generic NLE fork.
- **Source:** [official repository](https://github.com/Augani/openreel-video).

### 27. OpenShorts

OpenShorts is a young MIT self-hosted platform with FastAPI, React/Vite, Python media pipelines, long-video clip generation, faster-whisper, AI actors, captions, voiceovers, and YouTube tooling.

- **Openness and APIs:** Orchestrator is open. Defaults include Gemini, fal.ai, ElevenLabs, AWS S3, and Upload-Post, so high-quality/default operation is not fully open or free.
- **Useful:** Multi-container shape, job concurrency/cleanup, 2 GB upload protection, faster-whisper plus LLM clip selection, and practical vertical-output flow.
- **Not useful:** Transcript-only “viral” selection, avatar/UGC core, direct posting, and broad YouTube suite.
- **Risk/integration:** No formal releases, many credentials/providers, AI actor safety, weak visual product-flow understanding, and early operational maturity.
- **Recommendation:** Study the end-to-end deployment and failure modes; do not fork. Gideon’s differentiator is software-flow evidence plus marketing strategy.
- **Source:** [official repository](https://github.com/mutonby/openshorts).

### 28. short-video-maker

`gyoridavid/short-video-maker` is an MIT TypeScript service exposing MCP/REST generation for TikTok, Reels, and Shorts, using TTS, captions, assets, and Remotion.

- **Openness:** Self-hostable orchestrator; actual provider costs depend on configured TTS/assets. Checked metadata showed low recent activity.
- **Useful:** Small service boundary, platform presets, MCP/REST coexistence, and Remotion composition examples.
- **Not useful:** Faceless topic-to-video generation and a generic generation API as Gideon’s product core.
- **Risk/integration:** Maintenance, provider drift, template quality, and limited product-specific understanding.
- **Recommendation:** Study the minimal API/render boundary; implement Gideon-native schemas and templates.
- **Source:** [official repository](https://github.com/gyoridavid/short-video-maker).

### 29. UniVA

UniVA is a research-oriented universal video agent with Plan/Act agents, hierarchical memory, modular MCP tool servers, and workflows across understanding, segmentation, editing, and generation.

- **Openness:** The paper/project claims open sourcing, but the system composes many external models/tools whose licenses and resource requirements differ.
- **Useful:** Separation of planning and execution, dependency-aware plans, traceability, memory layers, tool substitution, and evaluation of multi-step workflows.
- **Not useful:** Heavy general video generation/segmentation and multi-agent autonomy for a narrow MVP.
- **Risk/integration:** Research maturity, enormous model/tool surface, reproducibility, GPU needs, and license aggregation.
- **Recommendation:** Inspiration for v2 orchestration/evaluation only. Gideon needs a finite state machine and typed jobs before multi-agent planning.
- **Sources:** [official project](https://univa.online/), [paper](https://arxiv.org/abs/2511.08521), [repository](https://github.com/univa-agent/univa).

### 30. Open-Sora

Open-Sora is an Apache-2.0 research project publishing training/inference code and model checkpoints for text/image-to-video. Version 2.0 uses an 11B model and supports 9:16, but official efficiency data reports roughly 52.5 GB peak GPU memory even at 256px on one GPU and far more time at 768px.

- **Openness:** Code and checkpoints are available; optional prompt refinement uses OpenAI if enabled.
- **Useful:** Future generated B-roll or backgrounds and research on vertical generation.
- **Not useful:** Editing uploaded walkthroughs or an economically practical MVP.
- **Risk/integration:** GPU cost, latency, visual consistency, safety/provenance, model/data rights, and rapidly evolving quality.
- **Recommendation:** Avoid in MVP and v2 critical path. Revisit only as an optional provider when customers demand generated footage.
- **Source:** [official repository](https://github.com/hpcaitech/Open-Sora).

### 31. OpenKinoAI

OpenKinoAI is a 2020 research framework for intelligent cinematography of live performances: upload UHD single-camera footage, detect/track performers, synthesize reframed rushes, and edit multiclip-style movies.

- **Openness/maintenance:** The paper describes an open-source framework, but a current canonical repository and active release signal were not verified during this research.
- **Useful:** Automated reframing as a first-class problem, separating subject tracking from edit selection, and creating multiple virtual shots from one source.
- **Not useful:** Live-performance/person tracking does not match software UI capture.
- **Risk/integration:** Old research stack, uncertain repository provenance, and domain mismatch.
- **Recommendation:** Study the paper’s reframing concepts only; implement UI-focused saliency/zoom using screen evidence.
- **Source:** [paper](https://arxiv.org/abs/2011.05203).

## Recommended MVP stack

| Layer | Choice | Why |
|---|---|---|
| Web | Next.js App Router, React, TypeScript | Fast product iteration, server/client boundaries, shared types |
| API | Next.js route handlers for short requests | One deployable product boundary; no premature microservice |
| Database | PostgreSQL + Prisma | Relational workflow state, transactions, migration ergonomics |
| Queue | Redis + BullMQ | Async jobs, retries, progress, concurrency controls |
| Object storage | Cloudflare R2 or AWS S3 | Private, durable, signed direct upload/download |
| Media worker | Node/TypeScript wrapper around pinned FFmpeg/ffprobe | Deterministic ingest, transform, validation |
| ASR worker | Python + faster-whisper | Efficient local transcription and word timestamps |
| AI strategy | Provider-neutral multimodal LLM adapter | Avoid model lock-in; structured JSON and evals |
| TTS | Paid provider first behind adapter | Reliable quality and latency; replaceable later |
| Composition | Remotion + versioned React templates | Editable preview and deterministic branded layouts |
| Validation | ffprobe + sampled-frame/contact-sheet + audio checks | Fail renders before the user sees broken output |
| Observability | Structured logs, traces, job events, cost/latency metrics | Debug long async pipelines and provider failures |

The MVP worker topology is two logical worker types, not a microservice fleet: a TypeScript media/render worker and a Python transcription worker. They exchange only object keys and versioned JSON payloads, never local paths.

## Recommended v2 stack

- rrweb opt-in SDK with aggressive input/text masking and a normalized `ProductFlowTrace`.
- Playwright replay worker against disposable/seeded customer test environments.
- Capture manifest that combines DOM/action telemetry with synchronized video timestamps.
- Optional browser extension only after the web recorder/capture manifest is proven.
- Provider registry for local/commercial TTS and multimodal models.
- Brand kits and versioned template marketplace.
- Gideon MCP server exposing safe project, analysis, script, and render operations—not raw shell/FFmpeg.
- Optional OpenVoice only after consent, revocation, labeling, and abuse controls ship.

## Tools to avoid for now

- **Direct Palmier dependency:** platform, GPL, and closed generation coupling.
- **OpenMontage/ButterCut forks:** scope/license mismatch.
- **General browser editor forks:** distract from a constrained review/edit experience.
- **Browser-use capture:** nondeterministic and unsafe for primary customer flows.
- **Bark/Piper/Coqui as the only MVP TTS:** quality, licensing, or maintenance uncertainty.
- **Open-Sora/UniVA:** GPU/research scope with no core MVP need.
- **OpenKinoAI:** domain and maintenance mismatch.
- **Open ScreenStudio:** ambiguous provenance.
- **MoviePy on the production critical path:** extra abstraction without enough benefit.

## Key architectural lessons

### Palmier

The agent must operate on the same explicit timeline model as the human. Commands should be inspectable, reversible, and attributable. Generative providers belong behind an interface, separate from editor state.

### video-use

Do not feed every frame to a model. Build a compact transcript/evidence representation and request visual composites only around ambiguous or high-value moments. Render, inspect boundaries, and attempt a bounded repair loop.

### OpenMontage

Persist stage artifacts and decisions. Estimate cost before execution. Insert human approval at creative decisions. Make quality gates block delivery, and log provider/fallback choices.

### Remotion

Treat compositions as versioned pure functions of a validated render manifest. Assets and fonts must be pinned; templates need schema validation, golden fixtures, snapshot frames, and full encode tests.

### rrweb

Structured interaction data can become Gideon’s moat, but raw DOM capture is sensitive. Normalize and redact before storage/model use, and separate semantic flow from visual rendering.

### Playwright

Replay should be deterministic and reviewed. Use seeded accounts, fixed viewports, explicit waits, trace artifacts, allowlisted actions/domains, and idempotent cleanup. Browser automation is a renderer of an approved flow, not the authority deciding what to do.

## Security implications of the recommended media pipeline

- Upload directly to a private quarantine prefix through a short-lived, content-length-bound signed URL.
- Accept MVP containers `video/mp4`, `video/quicktime`, and `video/webm`; verify magic bytes and successful bounded `ffprobe`, not browser MIME alone.
- Default maximum: 2 GB and 30 minutes, configurable downward by plan. Reject excessive dimensions, streams, duration, frame rate, or metadata before decode.
- Never pass original filenames, URLs, filter text, captions, or model output through a shell. Use argument arrays and a finite operation schema.
- Disable network egress for decode/render containers. FFmpeg enables many network protocols by default; use local object downloads and a strict protocol whitelist.
- Run non-root with read-only base filesystem, ephemeral scratch space, per-job CPU/RAM/PID/time/output quotas, and no cloud instance credentials.
- Patch FFmpeg quickly. Media decoders are an untrusted-code boundary, not a harmless utility.
- Store source objects and outputs privately; issue scoped signed URLs after server-side workspace authorization.
- Redact scripts, transcripts, signed URLs, provider payloads, cookies, and API keys from logs. Log object IDs, checksums, status, timing, and sanitized error codes.
- Treat transcript/frame text as untrusted prompt content. Delimit it as data, forbid tool/instruction following, validate all model output against schemas, and allowlist all downstream operations.
- Follow OWASP’s file-upload guidance: allowlisted extensions, type/signature checks, generated filenames, size limits, authorization, separate/private storage, and malware/sandbox checks where practical ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)).
- Prevent SSRF for any later URL import: http/https only, host allowlist where possible, DNS/IP revalidation, block loopback/private/link-local/metadata ranges, limit redirects and response size ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)).

## Final recommendation

Build Gideon as a narrow, evidence-driven marketing-video compiler, not an autonomous editor. The product’s defensible layer is the mapping:

`walkthrough evidence + product context → detected moments → specific marketing angles → editable scripts → validated edit decisions → branded platform-native renders`.

Use mature infrastructure directly, borrow workflow ideas from young agentic tools, and keep provider and render boundaries replaceable. Ship uploaded recordings first. Add rrweb/Playwright only after the core workflow produces genuinely useful concepts and reliable vertical drafts.
