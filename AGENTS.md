# AGENTS.md

This file gives future coding agents the operating rules for the Gideon repository.

## Product context

Gideon is a SaaS product that turns a founder or product team screen recording into short-form marketing videos. The core workflow is:

1. User creates a project and product profile.
2. User uploads a product screen recording.
3. System validates and processes the recording.
4. System extracts transcript and visual evidence.
5. System detects product moments.
6. User reviews moments.
7. System generates multiple content angles and scripts.
8. User edits and approves a script.
9. System generates voiceover and renders vertical short-form videos.
10. User downloads export package and manually posts it.

Do not expand the MVP into avatar generation, social posting, autonomous publishing, or broad marketing automation unless explicitly requested.

## Current documentation map

- Product requirements: docs/prd.md
- Technical architecture: docs/technical-spec.md
- UX flows: docs/ux-flows.md
- Database schema: docs/database-schema.md
- API contract: docs/api-contract.md
- Implementation plan: docs/implementation-plan.md
- Testing strategy: docs/testing-strategy.md
- Security rules: docs/security-rules.md
- Design system: docs/design-system.md
- Tooling research: docs/research/open-source-tools-research.md
- Build/buy/fork recommendation: docs/research/build-vs-buy-vs-fork.md

Read the relevant docs before changing architecture, API behavior, database models, media processing, AI prompts, or render behavior.

## Engineering posture

- Optimize for a reliable upload-to-export loop before breadth.
- Keep generated artifacts versioned and traceable.
- Keep humans in control of content approval.
- Treat uploaded media, transcripts, OCR, AI output, provider responses, and webhook payloads as untrusted.
- Prefer clear interfaces around vendors: transcription, LLM, TTS, storage, queue, render.
- Keep expensive operations asynchronous and idempotent.
- Avoid committing large generated binaries unless the repository explicitly introduces fixture storage rules.

## Expected stack

The planning docs recommend:

- Next.js App Router and TypeScript for the web app.
- PostgreSQL and Prisma for primary data.
- Redis and BullMQ or equivalent for queues.
- S3-compatible object storage for media artifacts.
- FFmpeg for media probing, extraction, and post-processing.
- faster-whisper or provider-backed transcription behind an adapter.
- Provider-neutral LLM and TTS adapters.
- Remotion for deterministic short-form video rendering, subject to license review before commercial scale.

If implementation chooses a different stack, update the relevant docs in the same change.

## Repository commands

The exact commands should be verified in package.json once code exists. The intended command contract is:

- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:redis
- pnpm test:e2e
- pnpm build
- pnpm provider:canary
- pnpm staging:check
- pnpm production:check
- pnpm worker:hosted:check
- pnpm release:mac:check
- pnpm db:migrate
- pnpm db:seed
- pnpm dev

When package scripts are added or changed, update this section.

## Code quality rules

- Use strict TypeScript.
- Validate runtime boundaries with schemas, not TypeScript types alone.
- Keep server-only code out of client bundles.
- Keep components small enough to test and reason about.
- Prefer explicit state machines for jobs and generated artifact lifecycles.
- Keep API response envelopes consistent with docs/api-contract.md.
- Keep database changes aligned with docs/database-schema.md.
- Add tests with implementation changes.

## Security rules

Follow docs/security-rules.md. Key constraints:

- Server-side authorization on every project, media, job, artifact, export, and usage access.
- Workspace isolation must be tested.
- Source recordings and derived artifacts are private by default.
- Signed URLs must be short-lived and generated only after authorization.
- FFmpeg must be invoked without shell interpolation.
- Uploaded files must be validated by content, not extension alone.
- Prompt outputs must be runtime-validated and source-grounded.
- No secrets, signed URLs, raw prompts, full transcripts, or private object keys in logs.
- CSRF protection is required for cookie-authenticated state-changing requests.

## Media pipeline rules

- Do not run heavy media work in the web request process.
- Store source media, extracted frames, voiceovers, renders, and exports as artifacts.
- Store enough metadata to reproduce outputs: source asset, prompt version, model, script version, voice settings, render manifest, and export profile.
- Never trust user-provided object keys or filenames.
- Keep FFmpeg stderr out of user-facing responses.
- Add fixture tests for media behavior.

## AI generation rules

- Prompts must separate trusted instructions from untrusted transcript or screen text.
- Outputs must be structured and schema-validated.
- Generated claims must point back to product evidence.
- Store prompt version, provider, model, parameters, and inputs.
- Do not let the model make authorization, billing, deletion, export, or publishing decisions.
- Keep regeneration version chains intact.

## Database rules

- Add migrations for schema changes.
- Include workspace or project scoping in queries.
- Use soft deletion where documented.
- Preserve generated artifact lineage.
- Keep usage records idempotent for retried jobs.
- Add indexes for list pages and queue lookups.

## API rules

- Keep base contract aligned with docs/api-contract.md.
- Use consistent success and error envelopes.
- Validate request bodies and query parameters at runtime.
- Use pagination for collection endpoints.
- Require idempotency keys for expensive operation creation.
- Do not expose provider internals, raw stack traces, private paths, or storage keys in responses.

## Testing expectations

Before handing off implementation work:

- Run lint.
- Run typecheck.
- Run relevant unit and integration tests.
- Run build when UI, server, or bundling behavior changed.
- Run media smoke tests when upload, FFmpeg, transcription, render, or export behavior changed.
- Run E2E tests when critical user flows changed.
- Record any tests that could not be run and why.

## Documentation expectations

Update docs when changing:

- User-visible product behavior.
- UX flows or states.
- API request or response shapes.
- Database schema.
- Worker jobs or state machines.
- Security posture.
- Environment variables.
- External providers.
- Render output profiles.

## Forbidden without explicit user instruction

- Adding direct social posting to MVP.
- Adding avatar generation or voice cloning.
- Making source recordings public.
- Removing human approval gates.
- Introducing unreviewed paid provider behavior that can create runaway cost.
- Committing secrets, customer media, generated private videos, or local environment files.
- Rewriting git history or deleting user work.

## Definition of done

A change is complete when:

- It implements the requested behavior in the smallest coherent slice.
- It passes relevant automated checks.
- It preserves workspace isolation and media privacy.
- It includes tests for new behavior and failure cases.
- It updates docs when contracts or architecture change.
- It leaves the repository in a clean, reviewable state.
