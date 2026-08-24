# CLAUDE.md

@AGENTS.md

This file provides concise guidance for Claude Code or any Claude-backed coding
assistant working in this repository.

AGENTS.md is imported above rather than summarised here, because it is also what
Codex loads unprompted -- so the two agents read one description of the repo
instead of drifting copies. When it was wrong, Codex was confidently wrong in the
same way: asked what this repo used, it answered "Next.js App Router, pnpm,
Prisma", all three lifted from that file and none of them true.

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

## Working with Codex

`codex exec` is available and authenticated. It is a second frontier model with
its own reading of the code, which makes it useful for a narrow set of things and
a waste of time for the rest. What follows is from measured results in this
repository, not from the general idea that two models beat one.

**Always `-s read-only`.** Codex defaults to `sandbox: danger-full-access,
approval: never`. Implementation stays here; a second agent editing the tree
while this one reasons about it is how two correct changes become one broken one.
Pass `--skip-git-repo-check` when running outside a repo root.

**Run it in the background.** `run_in_background: true`, then keep working. The
saving is parallelism, not delegation -- a codex call that blocks is usually
slower than doing it yourself.

### What it is good at

Precise questions about code you can verify cheaply afterwards. Every win in this
repo had that shape:

- "Which fields does this filter compare against? Quote the expression with
  file:line." It found `or_(Job.salary_max >= salary_min, Job.salary_min >=
  salary_min)`, which changed a film's script from "these pay over 100k" to
  "these *can* pay over 100k" -- the difference between an honest claim and a
  false one, and it explained a 42-vs-49 count discrepancy that would otherwise
  have gone into the voiceover.
- "Is this filter deterministic, or does it call a geocoder at request time?"
  Tracing state across a stack is something it does well and quickly.
- "Which element renders X?" It found the location span in a 1900-line component
  while the obvious selector kept matching the wrong node.

### What it is bad at

- **Anything needing the running system.** Rendered pixel boxes, a frame that
  looks wrong, database state, whether a caption argues with its picture. Those
  need the browser or the DB, and no amount of reading substitutes.
- **Vague review.** "Review this" produces agreement. Reviews earn their place
  only when the prompt enumerates specific failure modes -- and then they earn it
  well: a review told to check trap ordering, `set -e` interactions, log growth
  and overlapping runs found a real leak (an EXIT trap installed after the
  servers start, so a failed readiness check left a backend running) and
  corrected two things this file's author had stated wrongly.
- **Confirming what you already tested.** It will agree, at the cost of a
  round trip.

### Verify what it says

It is confidently wrong in the same ways any model is. It answered a question
about this repo's stack straight from a stale AGENTS.md without opening
package.json. Treat findings as leads: check the line it cites before acting, and
say "codex found X, I verified it by Y" rather than passing its output through.

### Reviews: tell it to disagree

The useful review prompt names what to look for and forbids politeness:

    You are reviewing another engineer's work. Do not defer to it.
    Look specifically for: <the five things you are actually worried about>.
    Report only concrete problems with file:line and a one-line consequence.
    If a section is fine, say so briefly. Do not manufacture criticism.

The last sentence matters as much as the rest: a review that invents problems
costs more to triage than one that finds none.

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
