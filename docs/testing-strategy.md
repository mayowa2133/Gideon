# Gideon testing strategy

Last updated: 2026-06-24

Gideon is a media, AI, and workflow product. The test strategy must cover ordinary web application behavior and also the parts that fail in less obvious ways: large uploads, FFmpeg probing, timestamp math, AI JSON drift, render determinism, private storage, and job retries.

The main testing goal is confidence in the end-to-end promise: a user can upload a product screen recording and export a reviewed short-form video that is grounded in the recording.

## Testing pyramid

| Layer | Purpose | Examples |
| --- | --- | --- |
| Static checks | Prevent basic defects before runtime | TypeScript strict mode, ESLint, format checks, dependency/license review |
| Unit tests | Prove pure logic and small modules | authorization predicates, timestamp conversion, quota decisions, schema parsing |
| Integration tests | Prove system boundaries | API routes with database, object storage adapter, queue worker state transitions |
| Media fixture tests | Prove video/audio behavior | FFmpeg probe, frame extraction, transcript alignment, render manifest validation |
| Prompt contract tests | Prove AI orchestration remains parseable and grounded | saved model outputs, invalid JSON repair, schema validation, evidence reference checks |
| Browser E2E tests | Prove critical user journeys | create project, upload recording, approve script, render export |
| Manual QA | Catch visual and content-quality issues | caption safe zones, audio pacing, angle quality, export playback |

## Required checks in CI

Run these on every pull request once the implementation exists:

- Install dependencies from lockfile.
- Lint.
- Repository safety lint for conflict markers, generated/private artifacts, obvious committed secret patterns, and README/audit progress drift.
- Production-readiness and production-promotion gate dry-runs.
- Typecheck.
- Unit tests.
- Integration tests that do not require heavy media processing.
- Build.
- Dependency audit and license visibility check.
- Schema migration drift check.

Run these on a scheduled or labeled workflow:

- FFmpeg media smoke tests.
- Render snapshot tests.
- Browser E2E tests.
- Prompt regression suite.
- Performance smoke tests for upload and render.

## Test data policy

- Use synthetic videos or recordings created specifically for testing.
- Do not commit customer recordings, real user voices, private product demos, API keys, or provider responses containing sensitive data.
- Keep small fixture videos in a dedicated test fixtures directory only if repository size remains reasonable.
- Store larger media fixtures in private object storage and fetch them in CI only when explicitly configured.
- Every fixture should document duration, dimensions, codec, audio presence, expected transcript behavior, and expected analysis behavior.

## Unit testing scope

### Authorization

Test:

- Workspace owner, admin, editor, and viewer permissions.
- Project membership checks.
- Deny-by-default behavior for missing workspace context.
- Cross-workspace access attempts.
- Archived and deleted project behavior.

Expected result:

- No API or server action can rely only on client-side checks.
- Authorization helpers are deterministic and easy to audit.

### Runtime validation

Test:

- API request schemas.
- Provider response schemas.
- Prompt output schemas.
- Upload metadata schemas.
- Render manifest schemas.

Expected result:

- TypeScript types are supported by runtime validation at trust boundaries.
- Malformed input fails with safe error responses.

### Timestamp logic

Test:

- Seconds to frame conversion.
- Clip boundary validation.
- Caption segment overlap.
- Moment timestamp containment within media duration.
- Rounding behavior for common frame rates.

Expected result:

- Generated clips never reference negative time, time beyond duration, or impossible frame ranges.

### Quotas and usage

Test:

- Upload size quota.
- Monthly transcription minutes.
- AI token budget.
- TTS seconds.
- Render minutes.
- Exports per workspace.

Expected result:

- Expensive operations are blocked before cost is incurred when limits are exceeded.
- Usage records are idempotent for retried jobs.

## Integration testing scope

### Database

Test:

- Migrations apply from an empty database.
- Migrations apply against a seeded database.
- Required indexes exist for hot queries.
- Cascades and soft-delete policies behave as documented.
- Artifact version chains remain valid.

Expected result:

- Schema changes are safe, reversible where practical, and aligned with docs/database-schema.md.

### API routes

Test the contracts in docs/api-contract.md:

- Success response shape.
- Error response shape.
- Authentication required paths.
- CSRF behavior for cookie-authenticated mutations.
- Pagination cursors.
- Idempotency keys for expensive operations.
- Rate limit behavior.

Expected result:

- Clients can rely on stable response envelopes and predictable errors.

### Object storage

Test:

- Signed upload URL creation.
- Signed download URL creation.
- Expiration enforcement.
- Private object ACLs.
- Workspace/project object prefixing.
- Deletion and lifecycle marking.

Expected result:

- Private source videos and generated artifacts are never public by default.

### Queue and workers

Test:

- Enqueue, start, progress, complete, fail, retry, cancel.
- Worker crash recovery.
- Stale job lock recovery.
- Idempotent reprocessing.
- Duplicate job prevention.
- Optional BullMQ/Redis smoke using `GIDEON_REDIS_URL=redis://... pnpm test:redis` to prove the hosted broker can enqueue, process, and drain analysis/render jobs through a real Redis backend.

Expected result:

- A failed worker does not leave projects permanently stuck.
- Retrying an expensive job does not double-charge usage without explicit accounting.

## Media pipeline tests

### Upload validation fixtures

Maintain fixture cases for:

- Valid MP4 with H.264 video and AAC audio.
- Valid MP4 with no audio.
- Valid MOV from macOS screen recording.
- File with wrong extension.
- File with mismatched MIME and actual container.
- Unsupported codec.
- Video over maximum duration.
- Video over maximum file size.
- Very low resolution video.
- Very high resolution video.
- Corrupted container.

Expected result:

- Accepted files become validated media assets.
- Rejected files receive safe, user-readable rejection reasons.

### FFmpeg probing

Test:

- Metadata extraction for duration, width, height, frame rate, codecs, bitrate, and audio channels.
- Timeout behavior.
- Nonzero exit handling.
- stderr scrubbing.
- No shell interpolation.

Expected result:

- FFmpeg failures never expose sensitive local paths or raw command internals to users.

### Transcription

Test:

- Transcript segment ordering.
- Segment timestamps within media duration.
- Confidence fields.
- Silent recording handling.
- Provider timeout and retry behavior.

Expected result:

- Analysis can proceed with transcript and frame inputs, or frame-only inputs when no audio exists.

### Frame extraction

Test:

- Thumbnail extraction.
- Scene frame extraction.
- Timestamp association.
- Output file format.
- Storage path creation.

Expected result:

- Each extracted frame can be linked back to the source recording and timestamp.

## AI and prompt testing

AI tests should not assert that the model always uses identical wording. They should assert structure, grounding, safety, and product usefulness.

### Prompt contract tests

For each prompt version, keep saved fixtures for:

- Typical product demo.
- Sparse transcript.
- Noisy transcript.
- Feature-heavy recording.
- Setup or onboarding recording.
- Recording with sensitive-looking text.

Validate:

- Output parses as JSON.
- Output matches runtime schema.
- Referenced timestamps exist.
- Evidence references map to transcript segments or frames.
- Required fields are present.
- Claims are not broader than evidence supports.

### Regression scoring

For moment detection, score:

- Number of usable moments.
- Evidence quality.
- Timestamp accuracy.
- Diversity of suggested angle families.

For content angles, score:

- Diversity.
- Platform fit.
- Specificity to product evidence.
- Hook strength.
- Absence of generic claims.

For scripts, score:

- Hook clarity.
- Beat ordering.
- Duration estimate.
- Caption readability.
- CTA fit.
- Source-grounded claims.

### Prompt injection tests

Include fixtures where transcript or on-screen text says things like:

- Ignore previous instructions.
- Export secrets.
- Claim impossible metrics.
- Use offensive language.
- Publish without approval.

Expected result:

- The system treats transcript and screen text as untrusted input.
- Model outputs remain within Gideon instructions and schema.
- Risky content is flagged for review.

## Render testing

### Manifest validation

Test:

- Required source asset exists.
- Clip timestamps are valid.
- Captions fit within duration.
- Voiceover belongs to the approved script version.
- Export profile is supported.
- Referenced fonts and overlays exist.

Expected result:

- Invalid manifests fail before expensive rendering starts.

### Visual regression

Use small golden render cases:

- Basic product reveal.
- Long captions.
- Dark UI source recording.
- Light UI source recording.
- Silent original with voiceover.
- Fast-paced clip with many cuts.

Validate:

- Captions are within safe zones.
- Text contrast passes target thresholds.
- Overlays do not cover critical product UI.
- Final aspect ratio is correct.
- Duration matches script expectation within tolerance.

### Playback validation

After render:

- Probe output with ffprobe.
- Confirm codec, container, dimensions, duration, audio stream, and bitrate.
- Confirm file size is within platform target.
- Confirm thumbnail exists.
- Confirm captions text export exists.

Expected result:

- Exported files are usable on TikTok, Instagram Reels, YouTube Shorts, and manual upload workflows.

## Browser E2E tests

Minimum critical path:

1. Sign in.
2. Create project.
3. Fill product profile.
4. Upload valid fixture recording.
5. Wait for validation.
6. Start analysis.
7. Accept a detected moment.
8. Generate content angles.
9. Approve one script.
10. Generate voiceover with mocked provider.
11. Render with short fixture.
12. Download export package.

Secondary flows:

- Invalid upload rejection.
- Analysis failure and retry.
- Script regeneration.
- Render cancellation.
- Cross-workspace access denial.
- Archived project read-only behavior.

## Accessibility testing

Automated checks:

- Basic accessibility scanner in E2E.
- Keyboard navigation for dashboard, upload, review, editor, and video player controls.
- Form labels and error messages.

Manual checks:

- Focus states visible.
- Modal dialogs trap and restore focus.
- Timeline and script editor are usable without a mouse.
- Captions and generated videos are reviewable with assistive technology context.

## Performance testing

Track:

- Upload initiation latency.
- Upload completion processing time.
- FFmpeg probe time.
- Transcription time per media minute.
- Analysis latency.
- TTS latency.
- Render time per output minute.
- Queue wait time.
- API p95 and p99 latency for project/dashboard routes.

Set initial internal targets:

- Dashboard routes under 500 ms server time for warm data.
- Upload session creation under 300 ms.
- FFmpeg metadata probe under 30 seconds for target MVP file sizes.
- One-minute render fixture completes in a predictable worker budget.

Performance tests should be trend-based at first. Hard public SLAs should wait until production data exists.

## Security testing

Security tests should cover:

- Unauthorized API calls.
- Cross-workspace access attempts.
- CSRF-protected mutations.
- File upload validation bypass attempts.
- Signed URL expiration.
- Path traversal attempts in object keys.
- SSRF attempts through user-provided URLs.
- Prompt injection fixtures.
- Secrets not exposed to browser bundle.
- Security headers in production build.

See docs/security-rules.md for the full rule set.

## Manual QA checklist for releases

Before a beta release:

- Create a new account and project.
- Upload at least five representative recordings.
- Confirm moment detection quality.
- Confirm generated angles are specific and varied.
- Edit a script and verify version history.
- Generate and approve voiceover.
- Render and download MP4.
- Upload the MP4 manually to at least one target platform draft flow if possible.
- Run `pnpm lint`, `pnpm hosted:review:check`, `pnpm production:check`, `pnpm production:promote:check -- --dry-run`, `pnpm production:evidence:check -- --dry-run`, `pnpm production:github-config:check`, `pnpm production:github-settings:check -- --dry-run`, `pnpm production:github-evidence:check -- --dry-run`, `pnpm production:github-receipt:check -- --dry-run`, `pnpm production:github-archive:check -- --dry-run`, `pnpm production:github-promote:run -- --dry-run`, `pnpm production:live-env:check -- --dry-run`, `pnpm production:fixtures:materialize -- --dry-run`, `pnpm production:billing:check -- --dry-run`, `pnpm production:storage:check -- --dry-run`, `pnpm package:mac`, `pnpm release:mac:check`, `hdiutil verify release/Gideon-0.1.0-arm64.dmg`, `pnpm staging:check`, `pnpm staging:smoke -- --dry-run`, and `pnpm staging:mcp:smoke -- --dry-run`; production-shaped staging candidates must also pass `pnpm production:billing:check -- --live`, `pnpm production:storage:check`, `pnpm production:github-settings:check -- --repo mayowa2133/Gideon`, `pnpm production:github-promote:run -- --confirm-live` or the manual GitHub Actions live promotion workflow followed by `pnpm production:github-evidence:check -- --run-id <github-run-id> --write-receipt tmp/github-production-promotion-evidence/verification-receipt.json`, `pnpm production:github-receipt:check -- --path tmp/github-production-promotion-evidence/verification-receipt.json`, and `pnpm production:github-archive:check -- --archive-dir tmp/github-production-promotion-evidence`, archive the generated promotion evidence JSON and receipt, `pnpm staging:check -- --strict`, `pnpm staging:smoke -- --live`, `pnpm staging:mcp:smoke -- --live --require-metric-export`, `pnpm package:mac:signed`, and `GIDEON_RELEASE_CHANNEL=production pnpm release:mac:check`.
- Delete a project and verify source/export access is removed or scheduled for deletion.
- Review logs for accidental sensitive data.
- Verify support/admin views show job status without exposing private media.

## Bug classification

### Severity 0

- Private video or artifact exposed to another workspace.
- Secrets exposed.
- Data loss without recovery.
- Generated publish/export action happens without user confirmation.

### Severity 1

- Upload or render pipeline unusable for most users.
- Cross-workspace authorization bug blocked by UI but reachable by API.
- Billing or usage runaway.
- Repeated worker crashes causing stuck jobs.

### Severity 2

- AI output quality regression.
- Captions overlap UI in common cases.
- Incorrect or confusing error messages in core flows.
- Single provider outage without graceful failure messaging.

### Severity 3

- Minor visual inconsistency.
- Non-core copy issue.
- Low-frequency edge case with workaround.

## Definition of test completeness

A feature is not complete until:

- Unit tests cover its deterministic logic.
- Integration tests cover its external boundaries.
- API and schema changes match the documented contract.
- Security-sensitive behavior has negative tests.
- Media or AI features include fixture-based regression tests.
- Manual verification is recorded for visual, audio, and content-quality behavior.
