# Gideon implementation plan

Last updated: 2026-06-25

This plan turns the product requirements, architecture, API contract, schema, and research into an executable delivery sequence. It assumes the MVP will be built as a web application that accepts screen recordings, analyzes them into product moments, generates multiple short-form content angles, creates voiceovers, renders captioned clips, and keeps a human reviewer in control before export.

The plan intentionally separates product scaffolding, media infrastructure, AI orchestration, rendering, and commercialization concerns. The highest-risk parts are video determinism, upload safety, AI quality control, and job reliability. Those are pulled forward instead of left until the end.

## Delivery principles

- Ship the smallest end-to-end loop before expanding breadth: upload one recording, detect moments, generate angles, approve one script, synthesize one voiceover, render one clip, export one file.
- Keep every generated artifact versioned. A user should be able to see what prompt, model, input transcript, script, voice, and render settings produced each output.
- Keep external vendors behind interfaces. LLM, transcription, TTS, storage, and rendering runners must be swappable without database rewrites.
- Treat Codex/Claude Code control through MCP as a first-class no-Gideon-API-key path. Like Palmier’s agent-control model, external coding agents may bring their own model credentials, inspect Gideon project state, make bounded edits, and enqueue jobs through explicit tools while Gideon enforces RBAC, audit logging, and human approval gates.
- Do not depend on social posting APIs for MVP value. Exports and copyable captions are enough for first release.
- Treat video files as untrusted input. All upload, FFmpeg, storage, and download paths must follow the security rules in docs/security-rules.md.
- Keep Remotion licensing visible before commercial rollout. If the team grows beyond the free license threshold, budget and legal review must happen before production usage expands.

## Phase 0: repository and project foundations

### Goal

Create a maintainable codebase layout with reproducible local development, CI, and documentation gates.

### Main work

1. Initialize the application workspace.
   - Recommended shape: Next.js App Router TypeScript app under the repository root.
   - Use pnpm unless a different package manager is deliberately selected.
   - Add strict TypeScript, ESLint, Prettier, and test runner configuration.
   - Add a package script contract: lint, typecheck, test, test:watch, test:e2e, db:migrate, db:seed, dev, build.

2. Add environment handling.
   - Define a typed server-side environment module.
   - Keep public browser variables explicitly prefixed and documented.
   - Add .env.example with safe sample values only.
   - Validate required variables at process startup.

3. Add CI.
   - Run lint, typecheck, unit tests, and build on pull requests.
   - Add a separate media smoke job once FFmpeg tests exist.
   - Add dependency audit and license visibility jobs.

4. Add local infrastructure.
   - PostgreSQL for primary data.
   - Redis for job queues and locks.
   - S3-compatible storage for videos and render artifacts.
   - Optional local object storage through MinIO for deterministic development.

5. Add the local MCP agent control plane.
   - Provide a stdio MCP server for Codex, Claude Code, and other MCP clients.
   - Keep this path independent of Gideon-held LLM provider API keys; the MCP client supplies model reasoning.
   - Route live mutations through the app control socket when the desktop app is running.
   - Restrict direct-store fallback tools to bounded, auditable edits.
   - Record MCP edits with `actorType: "mcp_agent"` and enforce workspace role permissions.

### Acceptance criteria

- A fresh clone can run install, configure environment from .env.example, start local infrastructure, run migrations, and start the app.
- CI fails on lint, type, test, build, or formatting drift.
- AGENTS.md and CLAUDE.md accurately describe the repo commands.
- Codex/Claude Code can connect through MCP, inspect projects, edit approved script/moment fields, and enqueue jobs without Gideon requiring provider API keys for that control path.

### Verification

- Run package install.
- Run lint, typecheck, test, and build.
- Run migrations against a local database.
- Confirm no secrets are committed.

## Phase 1: authentication, workspaces, and project shell

### Goal

Support authenticated users, workspace-scoped data, project creation, and a basic dashboard before media complexity is introduced.

### Main work

1. Implement authentication.
   - Use a mainstream auth library or first-party provider.
   - Store stable user IDs in the users table.
   - Use HttpOnly, Secure-in-production, SameSite cookies.
   - Apply CSRF protection to cookie-authenticated state changes.

2. Implement workspaces.
   - Create a default workspace for new users.
   - Enforce workspace membership on every data read and mutation.
   - Add roles: owner, admin, editor, viewer.

3. Implement project CRUD.
   - Create, list, update, archive, and delete projects.
   - Create a default product profile per project.
   - Support project status transitions from draft to active to archived.

4. Build the dashboard shell.
   - Empty state explaining the upload-to-export flow.
   - Project cards with status, latest generated video, and last updated time.
   - Navigation for product profile, recordings, analysis, scripts, videos, and exports.

### Acceptance criteria

- A signed-in user can create a workspace-backed project and update its product profile.
- Users cannot read or mutate projects outside their workspace.
- Dashboard and project detail pages are responsive and accessible.

### Verification

- Unit tests for authorization helpers.
- API tests for workspace isolation.
- UI smoke tests for sign-in, project creation, and product profile update.

## Phase 2: upload and media asset ingestion

### Goal

Accept screen recordings safely, store them privately, extract metadata, and make them available for analysis jobs.

### Main work

1. Implement resumable direct-to-storage uploads.
   - Create upload sessions from the API.
   - Generate signed part URLs for object storage.
   - Complete or abort uploads explicitly.
   - Store uploads under workspace and project prefixes.

2. Validate uploaded media.
   - Enforce file size, duration, extension, MIME, and container limits.
   - Probe files with FFmpeg or ffprobe using safe subprocess rules.
   - Reject unsupported codecs and unusual dimensions.
   - Store width, height, duration, frame rate, codec, and audio channel metadata.

3. Create the media_assets model integration.
   - Track upload state: pending, uploading, uploaded, validated, rejected, deleted.
   - Store hashes for deduplication and provenance.
   - Keep source objects private.

4. Build the recording library UI.
   - Upload flow with progress and retry messaging.
   - Recording detail page with metadata and validation status.
   - Rejection states with human-readable explanations.

### Acceptance criteria

- Users can upload one supported recording and see it listed as validated.
- Invalid files are rejected without exposing internal FFmpeg errors.
- Source recording objects are not public.

### Verification

- Upload API integration tests.
- Validation fixture tests for supported and rejected files.
- Manual test with a realistic product screen recording.

## Phase 3: transcription and frame extraction

### Goal

Create reliable analysis inputs from the source recording: transcript segments, thumbnail frames, scene-change frames, and optional OCR-ready stills.

### Main work

1. Add media processing queue.
   - Use BullMQ or equivalent with explicit job records.
   - Keep hosted enqueue and worker runtime code behind the broker interface so the current in-memory broker can be replaced by Redis/BullMQ without changing API handlers.
   - Run workers through the hosted worker bootstrap so broker subscription, store-backed lease coordination, executor hooks, stop handling, and worker identity settings are centralized.
   - Reuse the shared `createGideonJobExecutor` analysis/render path from both the desktop queue and hosted worker bootstrap hooks, including jobs enqueued by Codex/Claude Code through MCP.
   - Support retries, cancellation, stale lock recovery, and progress updates.
   - Persist job events for UI and debugging.

2. Implement transcription runner.
   - Use faster-whisper or a cloud transcription provider behind an interface.
   - Store segments with timestamps, confidence, and speaker placeholders.
   - Handle recordings without audio.
   - Normalize transcript text without losing timing.

3. Implement frame extraction.
   - Extract thumbnails and representative frames.
   - Store frame artifacts privately.
   - Capture frame timestamps for downstream evidence references.
   - Optionally add OCR later if frame text is needed for better moment detection.

4. Build recording analysis preparation UI.
   - Show transcript preview.
   - Show extracted frames.
   - Let users start analysis once inputs are ready.

### Acceptance criteria

- A validated recording can produce transcript and frame artifacts.
- The system can handle a silent recording using frame-only analysis inputs.
- Job progress appears in the UI without page refresh.

### Verification

- Worker tests for job state transitions.
- Golden transcript fixture test.
- Media smoke test that runs FFmpeg extraction on a small fixture video.

## Phase 4: moment detection and evidence bundles

### Goal

Identify product moments worth turning into short-form content and explain why each moment matters.

### Main work

1. Implement prompt registry and AI provider interface.
   - Store prompt versions in code and in generated artifact metadata.
   - Require structured JSON output validated at runtime.
   - Use provider-neutral request and response types.
   - Record model, parameters, latency, token usage, and prompt version.

2. Implement moment detection.
   - Input: product profile, transcript segments, frame metadata, user goals.
   - Output: detected moments with timestamps, labels, evidence, confidence, and suggested angle families.
   - Enforce timestamp boundaries and schema validation.
   - Reject or repair hallucinated references that do not map to transcript or frame evidence.

3. Add human review UI.
   - Timeline view with detected moments.
   - Evidence drawer showing transcript and frame references.
   - Controls to accept, reject, merge, split, or edit moments.

4. Persist evidence bundles.
   - Store exact inputs used for generation.
   - Link moments to source transcript segments and frames.
   - Keep rejected moments for model-quality review unless the project is deleted.

### Acceptance criteria

- The system detects at least one defensible moment from a sample recording.
- Every moment shown to the user has timestamped evidence.
- Users can edit or reject detected moments before content generation.

### Verification

- Prompt contract tests with saved fixture inputs.
- Runtime schema tests for malformed model output.
- UI tests for accepting and editing moments.

## Phase 5: content angle and script generation

### Goal

Generate multiple native-feeling short-form content angles and scripts from approved moments, then let the user choose what to render.

### Main work

1. Implement content angle generation.
   - Generate at least three angle types per approved moment: pain point, transformation, proof, feature reveal, myth busting, comparison, or behind-the-scenes.
   - Include platform fit, hook strategy, audience, expected duration, and risk notes.
   - Avoid generic startup language and unverifiable claims.

2. Implement script generation.
   - Generate hook, beat-by-beat narration, on-screen text, captions, CTA, and shot notes.
   - Reference exact product evidence.
   - Support regeneration at angle, script, hook, CTA, and tone levels.
   - Track parent artifact versions.

3. Build review UI.
   - Angle cards grouped by source moment.
   - Script editor with compare-to-previous-version.
   - Approval gate before voiceover and render.

4. Add quality checks.
   - Require source-grounded claims.
   - Flag overly broad claims, medical/financial/legal claims, or unsupported superlatives.
   - Estimate duration from narration length and target platform.

### Acceptance criteria

- A user can generate multiple angles from one moment and approve one script.
- Generated scripts include timing and production notes.
- Script versions are preserved after edits and regenerations.

### Verification

- Prompt regression tests for angle diversity.
- Schema validation tests for script output.
- Manual review against the UX flows and brand voice.

## Phase 6: voiceover generation

### Goal

Create narration audio for approved scripts while respecting consent, provider terms, and artifact traceability.

### Main work

1. Implement TTS provider abstraction.
   - Start with one provider behind a clean interface.
   - Store voice provider, voice ID, parameters, script version, duration, and artifact path.
   - Support retries and cancellation.

2. Add voice library.
   - Start with provider-approved stock voices.
   - Do not implement user voice cloning in MVP unless consent and policy controls are in place.
   - Add future-ready fields for consent if voice cloning is later introduced.

3. Build voiceover review.
   - Play narration audio.
   - Regenerate with different pace, voice, or pronunciation hints.
   - Approve voiceover for render.

### Acceptance criteria

- A script can produce one playable voiceover.
- Voiceover is linked to the exact script version.
- Users can approve or regenerate before rendering.

### Verification

- Provider adapter tests with mocked TTS responses.
- Artifact storage tests.
- Manual listen-through on sample scripts.

## Phase 7: rendering and export

### Goal

Render short-form videos with captions, product footage, optional overlays, and export-ready profiles.

### Main work

1. Implement render manifest.
   - Define deterministic input structure: source asset, clips, crops, captions, overlays, audio, export profile.
   - Store manifest JSON as a generated artifact.
   - Validate all object paths and timestamps before rendering.

2. Implement Remotion composition.
   - Vertical 9:16 composition for TikTok/Reels/Shorts.
   - Safe zones for captions and UI overlays.
   - Brand tokens from docs/design-system.md.
   - Captions with highlighted words and readable contrast.

3. Implement FFmpeg post-processing.
   - Trim and crop source footage.
   - Normalize audio.
   - Encode platform-specific outputs.
   - Generate thumbnails.

4. Build render review.
   - Queue render from approved script and voiceover.
   - Show render progress.
   - Play completed video.
   - Export MP4, thumbnail, caption text, and metadata package.

### Acceptance criteria

- A user can render one approved script into a vertical MP4.
- Exports include video, caption text, thumbnail, and provenance metadata.
- Render inputs are reproducible from stored manifest and artifacts.

### Verification

- Golden render fixture with snapshot metadata.
- Visual QA for caption placement and safe zones.
- Smoke test on a clean worker environment.

## Phase 8: billing-ready usage and operational reliability

### Goal

Prepare the MVP for real users by adding usage tracking, quotas, admin visibility, and operational safeguards.

### Main work

1. Implement usage events.
   - Track upload bytes, transcription minutes, AI token usage, TTS seconds, render minutes, and export count.
   - Link usage to workspace, project, user, provider, and job.

2. Add entitlement checks.
   - Keep plan limits configurable.
   - Enforce limits before expensive operations.
   - Surface clear upgrade or limit messages without hardcoding billing vendor assumptions.

3. Add observability.
   - Structured logs with request IDs and job IDs.
   - Metrics for queue latency, job failure rate, render duration, provider errors, and storage usage.
   - Error tracking with sensitive-data scrubbing.

4. Add admin support views.
   - Job explorer.
   - User/project lookup.
   - Failed provider calls with sanitized details.
   - Manual retry where safe.

### Acceptance criteria

- Expensive operations emit usage records.
- Quota checks prevent runaway cost.
- Failed jobs are visible and diagnosable without exposing private video or prompts unnecessarily.

### Verification

- Unit tests for quota decisions.
- Queue failure integration tests.
- Manual admin workflow test.

## Phase 9: launch hardening

### Goal

Make the MVP stable, safe, and understandable enough for first customers.

### Main work

1. Security hardening.
   - Apply docs/security-rules.md.
   - Add CSP and security headers.
   - Validate file upload and signed URL behavior.
   - Review prompt-injection and output-safety controls.

2. Performance hardening.
   - Test upload and render performance for target file sizes.
   - Set queue concurrency by resource class.
   - Add object lifecycle policies.
   - Cache read-heavy metadata, not private video files.

3. Product polish.
   - Improve empty states and error messages.
   - Add onboarding sample project.
   - Add clear language around generated content review.
   - Add help copy for unsupported recordings.

4. Release checklist.
   - Production environment variables configured.
   - Database backup and restore verified.
   - Object storage lifecycle configured.
   - Provider billing limits configured.
   - Incident runbook created.

### Acceptance criteria

- End-to-end flow succeeds on at least five realistic product recordings.
- Known security and data retention rules are documented and enforced.
- Production deployment has rollback and recovery paths.

### Verification

- Full regression suite.
- Manual launch QA checklist.
- Restore drill from database backup.
- Sample customer dry run.

## Phase 10: post-MVP expansion

### Goal

Expand Gideon only after the core upload-to-export loop proves valuable.

### Candidate work

1. Browser-event capture.
   - Add rrweb session capture for web apps.
   - Use Playwright for deterministic scripted reproduction.
   - Convert event traces into renderable product stories.

2. Social scheduling.
   - Add platform OAuth and publishing once exports are consistently useful.
   - Start with draft scheduling and human confirmation.
   - Add platform API error handling and token refresh.

3. Advanced brand kits.
   - Brand voice profiles.
   - Custom caption styles.
   - Multi-product workspaces.

4. Team workflows.
   - Comments on scripts and videos.
   - Approval roles.
   - Shared libraries of angles, hooks, and CTAs.

5. Avatar and voice cloning.
   - Only after consent, policy, disclosure, and abuse controls are in place.
   - Keep clearly outside MVP.

## First 10 implementation tasks

1. Initialize the Next.js TypeScript app, package manager, linting, formatting, and CI.
2. Add typed environment validation and .env.example.
3. Add PostgreSQL, Prisma, Redis, and object storage local infrastructure.
4. Implement authentication, workspace membership, and project CRUD with server-side authorization checks.
5. Implement product profile storage and dashboard/project shell UI.
6. Implement direct-to-storage upload sessions and media asset records.
7. Implement FFmpeg metadata probing and validation worker.
8. Implement transcription and frame extraction jobs with progress events.
9. Implement AI provider abstraction, prompt registry, and moment detection contract tests.
10. Implement content angle generation and script approval UI before starting voiceover or render work.

## Cross-document dependencies

- Product behavior: docs/prd.md
- UX and user states: docs/ux-flows.md
- Visual language: docs/design-system.md
- Technical architecture: docs/technical-spec.md
- Database tables and migrations: docs/database-schema.md
- API endpoints and response shapes: docs/api-contract.md
- Testing rules: docs/testing-strategy.md
- Security constraints: docs/security-rules.md
- Agent behavior: AGENTS.md and CLAUDE.md

## Release readiness gates

### Gate A: product shell

- Auth, workspaces, projects, and product profile work.
- CI is green.
- Workspace isolation tests pass.

### Gate B: media ingestion

- Upload sessions, private storage, FFmpeg validation, and recording library work.
- Malicious and invalid upload fixtures are rejected.
- Source files cannot be fetched without authorization.

### Gate C: analysis

- Transcript, frames, moment detection, and evidence review work.
- Prompt outputs are schema-valid.
- Users can edit or reject moments.

### Gate D: generation

- Angles, scripts, voiceovers, and approvals work.
- Generated claims are source-grounded.
- Regeneration preserves artifact history.

### Gate E: render and export

- Render manifests, Remotion composition, FFmpeg export, playback, and download work.
- Golden render smoke tests pass.
- Export package includes provenance.

### Gate F: first customer beta

- Usage tracking, quota enforcement, observability, and support views work.
- Security rules are enforced.
- End-to-end dry runs succeed on realistic recordings.

## Implementation risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| AI output looks generic | Users will not trust Gideon as a marketing copilot | Ground every angle and script in evidence bundles; add human review; run prompt regression tests |
| Render pipeline is slow or flaky | Exports feel unreliable | Start media smoke tests early; isolate workers; store deterministic manifests; track render metrics |
| Upload handling is unsafe | Private recordings or infrastructure may be exposed | Use direct private uploads, strict validation, signed URLs, FFmpeg sandboxing, and object lifecycle rules |
| Vendor lock-in | Costs or provider failures could block the product | Keep provider adapters and store normalized artifacts |
| Licensing surprise | Commercial rollout could be delayed | Keep Remotion and ButterCut licensing notes in engineering docs; review before production scale |
| Scope creep into avatars and social posting | MVP delivery slows down | Keep avatars and posting in post-MVP phases with explicit consent and API controls |

## Definition of done for implementation changes

Every implementation pull request should include:

- The smallest coherent product or infrastructure slice.
- Tests covering the changed behavior.
- Runtime validation at external boundaries.
- Updated docs if API, schema, environment variables, or worker behavior changed.
- No committed secrets, generated private videos, or large binary artifacts.
- Clear manual verification notes for media or UI changes.
- A passing lint, typecheck, test, and build suite.
