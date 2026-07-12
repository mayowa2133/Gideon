# Gideon security rules

Last updated: 2026-06-24

Gideon handles private product recordings, generated marketing assets, transcripts, AI prompts, voiceovers, and export files. These assets may contain customer data, unreleased features, credentials visible on-screen, internal URLs, private analytics, or personal information. Security must be built into the core workflow, not added after the render pipeline exists.

These rules apply to the MVP and should be updated whenever the architecture changes.

## Security objectives

- Keep source recordings and generated artifacts private by default.
- Enforce workspace isolation on every server-side read and mutation.
- Treat uploaded files, transcripts, on-screen text, prompt outputs, provider responses, and webhook payloads as untrusted input.
- Prevent expensive media and AI operations from being abused for cost amplification.
- Preserve user review and consent before generating, exporting, or posting content.
- Keep enough auditability to investigate issues without logging sensitive media or secrets.

## Data classification

| Data | Classification | Rules |
| --- | --- | --- |
| Source recordings | Highly sensitive user content | Private storage, signed access only, strict retention and deletion |
| Extracted frames | Highly sensitive derived content | Same protection as source recordings |
| Transcripts | Sensitive derived content | Encrypt or protect at rest according to platform capability, redact from logs |
| Product profiles | Sensitive business data | Workspace-scoped access, audit updates |
| AI prompts and responses | Sensitive derived content | Store with access controls, scrub from logs, version for provenance |
| Voiceovers | Sensitive generated content | Private until export, linked to script version |
| Rendered videos | Sensitive generated content | Private until user downloads or explicitly publishes |
| Export metadata | Sensitive operational content | Do not expose provider internals or private paths |
| Usage records | Internal billing/operations data | Workspace-scoped, immutable where practical |
| API keys and secrets | Secret | Never expose to browser, logs, generated docs, or error responses |

## Authentication rules

- All project, recording, analysis, generation, render, export, and usage routes require authentication.
- Anonymous access is allowed only for public marketing pages and auth start/callback endpoints.
- Sessions must use HttpOnly cookies.
- Cookies must be Secure in production.
- Cookies must use SameSite Lax or stricter unless a specific integration requires otherwise.
- Session rotation should occur after sign-in and sensitive account changes.
- Sign-out must invalidate or rotate server-side session state where supported.

## Authorization rules

- Every server-side route must derive workspace access from authenticated user membership.
- Client-provided workspace IDs, project IDs, media IDs, job IDs, or artifact IDs are never sufficient authorization.
- Database queries should include workspace or project ownership constraints, not fetch first and filter later when avoidable.
- Workspace roles:
  - Owner: full access, billing, deletion, membership.
  - Admin: project and member management except owner transfer.
  - Editor: create and edit projects, generate assets, render exports.
  - Viewer: read-only review access.
- Expensive operations require editor or higher.
- Billing and entitlement changes require owner or admin according to the billing provider model.
- Cross-workspace access attempts must return a generic not found or forbidden response without revealing resource existence.

## CSRF and browser request rules

- Cookie-authenticated state-changing requests require CSRF protection.
- Mutations should check Origin or Referer when practical.
- CORS must use an explicit allowlist.
- Do not use wildcard CORS with credentials.
- API routes should reject unexpected methods.
- Content-Type must be validated for JSON endpoints.

## File upload rules

Uploaded recordings are untrusted input.

### Allowed formats for MVP

- MP4 with common H.264/H.265 video and AAC audio.
- MOV from common macOS screen recording flows if FFmpeg validation accepts it.
- Optional WebM only if target browser and FFmpeg support are explicitly tested.

### Required validation

- Validate declared MIME type and actual container.
- Validate extension, but never trust extension alone.
- Enforce maximum file size.
- Enforce maximum duration.
- Enforce maximum dimensions and frame rate.
- Enforce supported codecs.
- Enforce audio stream limits.
- Reject encrypted, malformed, or unusual containers.
- Compute hash for deduplication and provenance.
- Run FFmpeg or ffprobe with a timeout.
- Store rejection reason in safe user-readable language.

### Storage

- Upload directly to private object storage using signed URLs.
- Signed upload URLs must be short-lived.
- Object keys must be server-generated.
- Object keys must include workspace and project prefixes.
- Do not allow user-provided path segments.
- Source recordings must not be publicly readable.
- Generated artifacts must remain private until an explicit export/download URL is created.
- Signed download URLs must be short-lived and authorized server-side before creation.

### Malware and content scanning

- If the deployment environment supports malware scanning, scan uploaded objects before validation jobs consume them.
- If scanning is not available in MVP, document the risk and keep validation workers isolated with least privilege.
- Never execute uploaded media as code.

## FFmpeg and subprocess rules

- Never pass user-controlled strings through a shell.
- Use argument arrays with shell execution disabled.
- Set execution timeouts.
- Set CPU and memory limits where the platform supports them.
- Run media processing in isolated workers, not in the web request process.
- Workers should have read access only to required input objects and write access only to expected output prefixes.
- Do not include raw FFmpeg command lines, local paths, object keys, or stderr dumps in user-facing errors.
- Scrub logs before storing FFmpeg output.
- Validate output files after FFmpeg completes.
- Treat FFmpeg as a high-risk dependency and keep it patched.

## AI and prompt security

### Prompt injection

- Treat transcript text, on-screen text, OCR, uploaded filenames, user notes, and imported content as untrusted.
- Prompts must clearly separate system instructions from untrusted source material.
- Model output must be parsed with runtime schemas.
- Model references to timestamps, transcript segments, frames, and artifacts must be checked against known inputs.
- The model cannot authorize publishing, exporting, deleting, billing changes, or access control changes.
- If source material instructs the model to ignore policies, reveal secrets, or fabricate claims, the system must ignore that instruction and optionally flag the content.

### Output safety

- Generated scripts must be source-grounded.
- Unsupported claims should be flagged or blocked before approval.
- Sensitive categories such as medical, financial, legal, employment, or regulated claims require stricter review.
- Generated content must remain editable and reviewable before render.
- Exports and future social posts require explicit user action.

### Provider data

- Use provider settings that minimize training retention when available.
- Do not send secrets, internal credentials, or unnecessary private metadata to AI providers.
- Minimize prompts to required product profile, transcript excerpts, frame summaries, and user-approved goals.
- Record prompt version, model, and provider metadata for provenance.
- Avoid logging full prompts and responses in general application logs.

## Voice and avatar rules

- MVP should use provider-approved stock voices.
- Do not clone a user voice without explicit consent, ownership verification, and revocation path.
- Store consent on the private source artifact before custom avatar generation and retain revocation state after the profile stops using that source.
- Custom likeness consent must record the versioned `self-avatar-v1` statement and `self` subject relationship; generic ownership or third-party authorization flags are insufficient for this workflow.
- Make voice and avatar provenance visible in internal artifact metadata.
- Do not generate a synthetic likeness or voice for a person who has not consented.
- Fictional and explicitly authorized self-avatar generation must retain source, consent, model, script, and disclosure lineage. Voice cloning remains disabled and post-MVP.

## Privacy rules

- Source recordings, extracted frames, transcripts, prompts, scripts, voiceovers, renders, and exports belong to the workspace that created them.
- User deletion requests must remove or schedule removal of source and derived artifacts.
- Retention periods must be documented in product and operations docs.
- Logs must not contain source video content, transcripts, frames, secrets, provider API keys, or signed URLs.
- Analytics events should use IDs and coarse metadata, not content text.
- Support tooling must avoid exposing private video by default.

## Secrets management

- Secrets must come from the deployment secret manager or environment, never from committed files.
- .env.example may contain variable names and safe dummy values only.
- Browser bundles must not include server secrets.
- Variables prefixed for public browser use are public and must be treated as non-secret.
- Rotate provider keys after suspected exposure.
- Use separate keys for development, staging, and production.

## Logging and observability rules

Log:

- Request ID.
- User ID and workspace ID where appropriate.
- Project ID.
- Job ID.
- Provider name.
- Operation type.
- Duration, status, retry count, and safe error code.

Do not log:

- API keys.
- Session tokens.
- Signed URLs.
- Full source transcripts.
- Raw prompts or model responses in general logs.
- Full FFmpeg stderr.
- Private object keys when avoidable.
- User-uploaded filenames if they may contain sensitive data.

Detailed prompt and provider payloads may be stored only in protected artifact or audit tables with workspace-scoped access and retention controls.

## Rate limiting and abuse prevention

- Rate limit unauthenticated auth endpoints.
- Rate limit upload session creation.
- Rate limit expensive generation endpoints.
- Enforce quotas before transcription, LLM, TTS, and render jobs.
- Require idempotency keys for expensive operations.
- Detect repeated failed uploads, prompt abuse, and render retries.
- Do not let one workspace starve all worker capacity.
- Queue concurrency should be partitioned by job type and resource cost.

## SSRF and external fetch rules

- MVP should avoid fetching arbitrary user-provided URLs.
- If URL import is added later:
  - Validate scheme.
  - Block internal IP ranges and metadata services.
  - Resolve DNS safely.
  - Enforce redirects limits.
  - Enforce size and content-type limits.
  - Fetch through a hardened service with no cloud metadata access.

## Web security headers

Production responses should include:

- Content-Security-Policy appropriate for app and media playback.
- X-Content-Type-Options: nosniff.
- Referrer-Policy: strict-origin-when-cross-origin or stricter.
- Frame-Options or CSP frame-ancestors.
- Permissions-Policy limiting camera, microphone, geolocation, and other unused capabilities.
- HSTS once HTTPS is correctly configured.

CSP must account for video playback, signed media URLs, auth provider frames if any, and analytics if used. Keep it as restrictive as product behavior allows.

## Frontend security rules

- Do not use unsafe HTML rendering for user-provided or model-provided content.
- If rich text rendering is introduced, sanitize with an allowlist sanitizer.
- Treat generated scripts and captions as untrusted text until rendered safely.
- Do not expose internal object keys or provider IDs unnecessarily.
- Do not store secrets in localStorage or sessionStorage.
- Avoid putting signed URLs in long-lived browser storage.
- Clear sensitive in-memory state on sign-out where practical.

## API design security rules

- Validate all request bodies at runtime.
- Reject unknown enum values.
- Use safe pagination limits.
- Use idempotency keys for expensive job-creating endpoints.
- Return consistent error envelopes.
- Avoid stack traces and internal exception messages in responses.
- Use least-privilege service roles for database and storage access.
- Prefer server-side generated IDs or collision-resistant public IDs.

## Database security rules

- Enforce workspace scoping in repository functions.
- Use parameterized queries or ORM query builders.
- Avoid raw SQL with interpolated user input.
- Store provider request metadata carefully and scrub sensitive payloads.
- Keep soft-deleted data out of normal reads.
- Audit high-risk operations: project deletion, export creation, member changes, billing changes, and future publishing.
- Backups must be encrypted and access-controlled.

## Export and download rules

- Export generation requires authenticated editor access or higher.
- Export download URL creation requires workspace authorization.
- Download URLs must be short-lived.
- Export metadata should include provenance but not secrets.
- Future public-share links must be opt-in and revocable.
- Future social publishing must require explicit per-post confirmation.

## Social posting rules for future versions

- Do not ship direct posting in MVP.
- When added, platform OAuth tokens must be encrypted or stored in a provider-managed vault.
- Token refresh failures must be visible to users.
- Posting should default to draft or scheduled review, not immediate publish, unless the user explicitly chooses publish now.
- Every outbound post must show the exact video, caption, destination account, scheduled time, and platform before confirmation.
- Keep an audit trail of who approved and submitted each post.

## Billing and usage security

- Usage records should be append-only where practical.
- Expensive jobs should check entitlements before enqueueing and before execution.
- Retried jobs should not double-count successful completed work.
- Admin or billing endpoints require elevated roles.
- Webhook payloads from payment providers must verify signatures.
- Billing webhooks must be idempotent.

## Incident response rules

For suspected source recording exposure:

1. Disable affected signed URL generation if needed.
2. Identify affected workspace, project, media assets, and access logs.
3. Rotate storage credentials if exposure involves credentials.
4. Revoke active signed URLs where provider supports it.
5. Notify affected users according to legal and product requirements.
6. Document root cause and add a regression test.

For suspected secret exposure:

1. Rotate the secret.
2. Review logs and repository history.
3. Revoke sessions or provider credentials if needed.
4. Add secret scanning if missing.
5. Document prevention changes.

For prompt or generated-content abuse:

1. Preserve relevant artifact metadata.
2. Disable the offending workflow if needed.
3. Add prompt regression fixtures.
4. Update output-safety checks.

## Secure implementation checklist

Before merging security-sensitive changes:

- Authentication and authorization are enforced server-side.
- Runtime validation exists at every boundary.
- Workspace scoping is included in data access.
- No secrets or signed URLs are logged.
- Upload inputs are validated before processing.
- FFmpeg is called without shell interpolation.
- Expensive operations enforce quotas and idempotency.
- AI output is schema-validated and source-grounded.
- User approval gates are preserved.
- Tests include negative cases.

## Minimum beta security gate

Gideon should not accept external beta users until:

- Auth and workspace isolation tests pass.
- Upload validation rejects known bad fixtures.
- Source and derived media are private by default.
- Signed URLs expire and require authorization.
- CSRF protection is active for state-changing cookie-authenticated routes.
- Secrets are loaded from environment or secret manager only.
- Logs have been reviewed for sensitive data leakage.
- AI prompt injection fixtures are covered.
- Render workers run outside the web request process.
- Deletion or retention behavior is implemented and documented.
