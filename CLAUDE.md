# CLAUDE.md

This file provides concise guidance for Claude Code or any Claude-backed coding assistant working in this repository.

## What Gideon is

Gideon turns screen recordings of software products into short-form marketing videos. The MVP is not a general video editor. It is a focused pipeline:

Recording upload -> media validation -> transcript and frame extraction -> product moment detection -> content angle generation -> script review -> voiceover -> vertical video render -> export package.

The user remains in control. Gideon suggests and renders; it does not autonomously publish.

## Read first

Before implementing, read the files relevant to the task:

- docs/prd.md for product scope.
- docs/technical-spec.md for architecture.
- docs/database-schema.md for data model.
- docs/api-contract.md for endpoint contracts.
- docs/ux-flows.md for user journeys.
- docs/security-rules.md for security constraints.
- docs/testing-strategy.md for verification expectations.
- AGENTS.md for repository-wide agent rules.

## MVP boundaries

Keep in scope:

- Authenticated project workspace.
- Product profile.
- Screen recording upload.
- Private media storage.
- FFmpeg validation and processing.
- Transcription and frame extraction.
- Moment detection with evidence.
- Multiple content angles.
- Script generation and editing.
- Human approval.
- Voiceover generation.
- Rendered vertical short-form exports.

Keep out of scope unless explicitly requested:

- Direct social posting.
- Avatar generation.
- Voice cloning.
- Full non-linear video editing.
- Browser extension capture.
- Team comments and approval workflows.
- Marketplace templates.

## Implementation style

- Make the smallest coherent change that moves the upload-to-export loop forward.
- Prefer explicit data models and state machines over implicit flags.
- Keep provider integrations behind interfaces.
- Keep runtime validation at every trust boundary.
- Avoid clever abstractions until two real call sites exist.
- Do not rewrite planning docs casually; update them only when implementation intentionally changes the contract.

## Security posture

Assume recordings contain sensitive customer data. Apply these defaults:

- Private object storage.
- Short-lived signed URLs.
- Server-side workspace authorization.
- CSRF protection for cookie-authenticated mutations.
- Strict upload validation.
- FFmpeg without shell interpolation.
- No secrets, signed URLs, full transcripts, raw prompts, or private object keys in logs.
- AI outputs are untrusted until schema-validated and checked against source evidence.

## AI and prompt changes

When changing prompts or AI orchestration:

- Version the prompt.
- Keep trusted instructions separate from untrusted transcript and screen text.
- Require structured output.
- Validate output at runtime.
- Store model, provider, parameters, prompt version, and source artifact IDs.
- Add prompt fixture tests for normal, noisy, sparse, and prompt-injection-like inputs.
- Preserve human review before render or export.

## Media and rendering changes

When changing upload, FFmpeg, transcription, voiceover, rendering, or export:

- Add or update media fixtures.
- Verify timestamps stay within source duration.
- Keep generated artifacts private.
- Store reproducible render manifests.
- Probe rendered outputs after generation.
- Check vertical video safe zones and caption readability.

## Database and API changes

When changing schema:

- Add migrations.
- Preserve workspace isolation.
- Add indexes for list and lookup paths.
- Keep generated artifact lineage intact.
- Update docs/database-schema.md when the implemented schema intentionally differs.

When changing API:

- Match docs/api-contract.md or update it in the same change.
- Use consistent response envelopes.
- Validate request bodies.
- Use idempotency keys for expensive job creation.
- Avoid leaking internal provider errors.

## Testing expectations

Run the relevant commands before handoff. Once package scripts exist, expected checks are:

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build

For browser-flow changes, run E2E tests. For media changes, run media smoke tests. For prompt changes, run prompt contract tests.

If a check cannot run because the repository does not yet implement the command or environment, state that directly in the handoff.

## Git and handoff

- Keep commits focused and reviewable.
- Do not rewrite history unless explicitly instructed.
- Do not delete user work.
- Do not commit secrets, local environment files, customer media, or generated private videos.
- In handoff, include what changed, what was verified, what could not be verified, and the next concrete task.

## Decision defaults

When uncertain:

- Favor privacy over convenience.
- Favor deterministic render artifacts over one-off generated files.
- Favor explicit approval gates over automation.
- Favor a working narrow MVP over broad platform integrations.
- Favor source-grounded scripts over flashy but unsupported marketing claims.
