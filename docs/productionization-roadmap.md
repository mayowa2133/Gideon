# Gideon productionization roadmap

Last updated: 2026-07-02

This roadmap turns the current downloadable macOS MVP into the fuller Gideon product described by the PRD. The current app already packages and downloads on macOS, accepts local walkthrough videos, generates deterministic moments/concepts/scripts, and renders captioned vertical MP4 drafts. The remaining work is to replace deterministic/local-only pieces with real provider-backed analysis, transcription, storage, jobs, auth, workspaces, operational controls, and an MCP control plane that lets tools like Codex or Claude Code inspect and edit Gideon projects without requiring Gideon to hold LLM API keys.

## North-star target

Gideon should support this production loop:

1. User signs in and enters a workspace.
2. User creates a project with product context.
3. User uploads a private product walkthrough.
4. Media jobs validate, transcode/extract audio, sample frames, generate OCR, and transcribe speech.
5. AI jobs build an evidence bundle, detect product moments, generate 10 differentiated concepts, and generate scripts/captions/voiceover plans.
6. User reviews and edits every AI artifact.
7. TTS jobs generate provider-backed voiceover audio.
8. Render jobs produce validated 1080×1920 MP4 drafts.
9. User exports privately or publishes through explicitly configured channels.
10. Usage, cost, quotas, job state, and audit events are tracked.
11. Codex, Claude Code, and other MCP-capable agents can connect to Gideon, inspect project evidence/timelines/scripts, propose edits, update approved editable artifacts, and enqueue renders through explicit tools.

## Delivery strategy

Implement in vertical slices that keep the app usable after each commit:

- Keep the local desktop app as the development harness.
- Add cloud-ready abstractions before forcing a hosted deployment.
- Keep deterministic fallback paths so tests run without paid provider credentials.
- Add provider-backed behavior only behind explicit configuration.
- Treat MCP agent control as a first-class no-provider-key path: external agents may bring their own model credentials, while Gideon exposes local/project tools and keeps user approval gates.
- Add tests and push to `main` after each working slice.
- Do not add social publishing, unauthorized likeness generation, or voice cloning until the core evidence-to-render loop and abuse controls are production-grade. Fictional and consent-gated self-avatar generation follow a separate isolated-worker release gate.

## Milestone 0: MCP agent control plane

### Scope

- Add a local MCP server that Codex, Claude Code, or other MCP clients can launch over stdio.
- Expose tools for project discovery, evidence inspection, script/moment edits, render/analysis job enqueueing, and status checks.
- Keep this path independent from OpenAI/provider API keys; the MCP client supplies its own model reasoning.
- Model the interaction pattern after agent-controlled creative tools such as Palmier: the agent discusses intent with the user, inspects Gideon project state through MCP, proposes edits, applies explicit structured edits, and asks Gideon to render.
- Add authorization and safety boundaries before exposing destructive actions.

### Acceptance criteria

- MCP clients can connect and list Gideon capabilities without any provider API key.
- MCP clients can inspect local projects and editable artifacts.
- MCP clients can make bounded edits to scripts/moments with persisted audit-safe state changes.
- Render/analysis job tools reuse Gideon’s durable job system instead of bypassing it.
- Tool schemas make destructive or publishing actions unavailable until later explicit implementation.

## Milestone 1: provider-backed AI, ASR, and TTS foundation

### Scope

- Add provider-neutral interfaces for:
  - semantic walkthrough analysis;
  - transcription;
  - text-to-speech.
- Add OpenAI-backed adapters behind environment variables.
- Add local deterministic fallbacks for test/dev.
- Persist transcript and provider metadata on projects.
- Use provider TTS audio during rendering when configured.

### Acceptance criteria

- With no API key, the app behaves as it does today.
- With provider config, analysis can call a structured-output LLM adapter.
- With provider config and audio, transcription can call an ASR adapter.
- With provider config, render can use provider TTS instead of macOS `say`.
- Unit tests cover provider payloads, response parsing, fallback behavior, and render handoff.

### Implementation notes

- Store only safe provider metadata in normal app state.
- Do not log prompts, full transcripts, API keys, signed URLs, or raw provider payloads.
- Treat provider output as untrusted until schema-validated.
- Keep `OPENAI_API_KEY`, model names, base URL, and voice configurable.

## Milestone 2: persistent local job queue with retry/cancel

### Scope

- Add a local durable job table inside the desktop store.
- Wrap analysis, transcription, TTS, and render in job records.
- Add job states: `queued`, `running`, `succeeded`, `failed`, `canceling`, `canceled`.
- Add attempt counters, safe user messages, failure codes, timestamps, and retry eligibility.
- Add UI job panels with retry/cancel where safe.

### Acceptance criteria

- Analysis and render no longer block the UI event loop.
- Failed transient jobs can be retried without recreating the project.
- Canceling a queued job prevents execution.
- Job history survives app restart.
- Tests cover valid and invalid state transitions.

## Milestone 3: OCR and stronger visual understanding

### Scope

- Extract representative frames and scene-change frames.
- Add OCR provider interface.
- Add local OCR option if available on macOS or provider OCR fallback.
- Add visual evidence bundle with frame IDs, timestamps, OCR text, and thumbnails.
- Update LLM analysis prompts to cite transcript and frame/OCR evidence.

### Acceptance criteria

- Moment detection can cite frame IDs and transcript segment IDs.
- OCR text is stored as untrusted evidence.
- Prompt-injection-like OCR text cannot change system behavior.
- Tests include noisy OCR, sparse OCR, and prompt-injection examples.

## Milestone 4: cloud data model, auth, workspaces, and private storage

### Scope

- Add a hosted web/API service or local-first sync boundary.
- Implement auth, users, workspaces, roles, and workspace membership.
- Add private object storage abstraction.
- Add direct-to-cloud upload sessions with signed URLs.
- Add server-side authorization for every project/media/artifact operation.

### Acceptance criteria

- Users cannot read or mutate another workspace’s resources.
- Uploads never pass large files through the API server.
- Source recordings and derived artifacts are private by default.
- API tests prove workspace isolation.

## Milestone 5: production async workers and observability

### Scope

- Move heavy media, ASR, AI, TTS, and render work to worker processes.
- Extend the signed hosted HTTP queue handoff, intake HTTP handler, dispatcher, hosted runtime adapter, worker bootstrap, broker interface, shared analysis/render job executor, and store-backed lease/heartbeat coordinator into a durable Redis/BullMQ or equivalent backend.
- Add idempotency keys, concurrency limits, job leases, and stale-lock recovery.
- Add structured logs, metrics, and safe error reporting.

### Acceptance criteria

- No long media/AI request blocks an HTTP request.
- Workers can resume/retry after restart.
- Logs do not expose secrets or private media content.
- Queue metrics expose stuck and failed jobs.

## Milestone 6: usage, billing, quotas, and cost controls

### Scope

- Meter upload bytes, source minutes, transcription minutes, LLM tokens, TTS characters, render seconds, and exports.
- Add workspace quotas and entitlement checks.
- Add billing provider integration after usage records are reliable.
- Add cost alerts and per-workspace concurrency controls.

### Acceptance criteria

- Expensive operations are quota-gated.
- Retried jobs are idempotently metered.
- Usage records survive failed jobs and app restarts.

## Milestone 7: production release hardening

### Scope

- Sign and notarize macOS app releases.
- Add update channel or clear release download flow.
- Add privacy/export/delete controls.
- Add security review for provider payloads, storage, logs, and job workers.
- Add E2E tests for the complete upload-to-export loop.

### Acceptance criteria

- Signed/notarized macOS artifact installs without Gatekeeper workaround.
- Delete removes or schedules deletion of source and derived assets.
- E2E test proves a realistic walkthrough can become rendered MP4 drafts.

## Explicitly later

These remain out of the core productionization path until the evidence-to-render loop is robust:

- Social posting and scheduling.
- Social analytics.
- Avatar generation.
- Voice cloning.
- Template marketplace.
- Agency portals and multi-client approval workflows.

## Current next slice

The next implementation slice is Milestone 5 production operations:

1. Run `pnpm production:check`, then run `pnpm production:promote:check -- --live` against staging credentials, small ASR/OCR fixtures, and Apple signing credentials.
2. Keep the existing provider/store interfaces intact so desktop, hosted worker, and MCP paths continue sharing the same execution boundaries.
3. Run `pnpm production:mcp:check`, `pnpm production:prompt:check`, `pnpm production:billing:check -- --live`, `pnpm production:db:check`, `pnpm production:observability:check`, `pnpm production:github-settings:check -- --repo mayowa2133/Gideon`, then `pnpm production:github-promote:run -- --confirm-live` with staging upload-to-export, hosted MCP smoke, deployed metric export, signed/notarized release credentials, notarization receipt verification, self-verified promotion evidence, archived provider canary report and release receipt verification, byte-size/SHA-256-bound receipt/archive-bundle validation, and archived release evidence before removing snapshot reads entirely.
