# Gideon API contract

**Version:** v1

**Base path:** `/api/v1`

**Last updated:** 2026-06-24

## Contract principles

- JSON over HTTPS except direct object-storage upload/download bodies and SSE.
- Cookie-authenticated browser API with CSRF token plus strict Origin/Host checks on state-changing routes.
- All request bodies/params are runtime validated; unknown write fields are rejected.
- All tenant resources are authorized server-side through workspace membership and resource ownership.
- Long work returns `202 Accepted` plus a job resource; no request waits for media/AI/render completion.
- Public resource IDs are random UUIDs. Cross-workspace resource access returns generic `404`.
- `Idempotency-Key` is required on create/enqueue/export/delete mutation endpoints that may be retried.
- Mutable edits use `If-Match: "<revision>"`; conflict returns `409 revision_conflict`.
- Timestamps are ISO-8601 UTC. Durations/times are integer milliseconds. Sizes are integer bytes.
- API never returns storage object keys, permanent provider URLs, prompts, stack traces, or internal diagnostics.

## Authentication, CSRF, and headers

### Required request headers

| Header | Requirement |
|---|---|
| `Content-Type: application/json` | JSON bodies |
| `X-CSRF-Token` | Cookie-authenticated POST/PUT/PATCH/DELETE except verified external webhooks |
| `Idempotency-Key` | Create/enqueue/export/delete requests noted below; 16–191 printable safe chars |
| `If-Match` | Updates to revisioned resources |
| `X-Request-ID` | Optional client correlation; server validates/overrides unsafe value |

Session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production HTTPS only. CORS is disabled for MVP same-origin web. If an API client product is added, use bearer tokens and a strict origin policy rather than weakening browser cookies.

### CSRF token

`GET /auth/session` returns a non-secret CSRF token bound to the session (or a dedicated `/auth/csrf` endpoint may be adopted by the auth library). State-changing requests send it in `X-CSRF-Token`. Server validates token and exact configured Origin/Host. Tokens are never accepted in a query string.

## Standard response forms

### Single resource

```json
{
  "data": {
    "id": "019..."
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

### Collection

```json
{
  "data": [],
  "meta": {
    "requestId": "req_...",
    "nextCursor": null
  }
}
```

### Error

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Check the highlighted fields.",
    "requestId": "req_...",
    "details": {
      "fields": [
        { "path": "productDescription", "code": "too_short" }
      ]
    }
  }
}
```

`details` is allowlisted by code. Do not leak existence across tenants or provider/media internals.

## Status and error codes

| HTTP | Code examples | Meaning |
|---:|---|---|
| 400 | `invalid_request`, `invalid_cursor` | Malformed request |
| 401 | `authentication_required`, `session_expired` | No valid session |
| 403 | `csrf_failed`, `action_forbidden` | Authenticated but request/action invalid; use 404 for cross-tenant object |
| 404 | `not_found` | Missing or unauthorized tenant resource |
| 409 | `revision_conflict`, `invalid_state`, `idempotency_conflict` | State/version conflict |
| 413 | `upload_too_large` | Declared/request size exceeds limit |
| 415 | `unsupported_media_type` | Declared/API content type unsupported |
| 422 | `validation_failed`, `unsupported_media`, `insufficient_evidence` | Semantically invalid/correctable |
| 429 | `rate_limited`, `concurrency_limited` | Retry after indicated duration |
| 500 | `internal_error` | Safe generic server failure |
| 503 | `temporarily_unavailable` | Dependency unavailable before enqueue |

Quota/billing limit status is an implementation decision: use `402 quota_exceeded` or `429 quota_exceeded` consistently. The body includes allowance, used, required, reset time where safe.

## Rate-limit policy

Limits are per authenticated user and workspace, with IP defense-in-depth. Response headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` on 429. Initial defaults are configuration, not guaranteed product limits.

| Class | Initial policy |
|---|---|
| Read/list/status | 120/min/user, burst 30 |
| Standard mutations | 60/min/user |
| Upload session | 10/hour/workspace plus concurrent multipart limit |
| Analysis/concept/script generation | 20/hour/workspace and entitlement/concurrency checks |
| TTS/render/export | 30/hour/workspace plus queue concurrency |
| Delete | 20/hour/workspace |
| Auth | Provider controls plus IP/user throttles |

## Pagination

Collections use opaque cursor pagination: `?limit=20&cursor=...`; limit default 20, maximum 100. Cursors encode stable sort key + ID and are signed/encrypted or otherwise tamper-resistant. Offset pagination is not used for changing project/job lists.

## Resource summaries

### Project

```json
{
  "id": "uuid",
  "name": "LeadPilot launch",
  "status": "concept_review",
  "currentStep": "concepts",
  "revision": 4,
  "activeProductProfileId": "uuid",
  "activeRecording": {
    "id": "uuid",
    "status": "verified",
    "durationMs": 482000,
    "width": 1920,
    "height": 1080,
    "hasAudio": true,
    "thumbnailUrl": "short-lived signed URL"
  },
  "updatedAt": "2026-06-24T20:00:00Z"
}
```

### Job

```json
{
  "id": "uuid",
  "kind": "analysis",
  "status": "processing",
  "stage": "transcribing",
  "progress": { "current": 127, "total": 482, "unit": "seconds" },
  "attempt": 1,
  "cancelable": true,
  "userMessage": "Matching narration to the recording.",
  "createdAt": "...",
  "updatedAt": "...",
  "completedAt": null
}
```

## Auth/session

### GET `/auth/session`

Returns the current session, active/personal workspace, and CSRF token.

- **Auth:** Optional; unauthenticated returns `data.session = null`, 200.
- **Request:** No body.
- **Response 200:**

```json
{
  "data": {
    "session": {
      "user": { "id": "uuid", "email": "user@example.com", "displayName": "Maya" },
      "workspaces": [{ "id": "uuid", "name": "Maya's workspace", "role": "owner" }],
      "expiresAt": "..."
    },
    "csrfToken": "opaque-token"
  },
  "meta": { "requestId": "req_..." }
}
```

- **Validation/errors:** Invalid/expired cookie is treated as null session and cookie cleared according to auth library; provider outages may return 503.
- **Rate limit:** 120/min/IP or user.

Sign-in/sign-out/callback endpoints are owned by the chosen authentication library/provider and documented separately. `POST /auth/sign-out` must be CSRF-protected if exposed through this API.

## Projects

### POST `/projects`

Create a project and product profile version 1 transactionally.

- **Auth:** Active workspace member with `member+`; MVP owner.
- **Headers:** `Idempotency-Key`, CSRF.
- **Request:**

```json
{
  "workspaceId": "uuid",
  "name": "LeadPilot launch",
  "productProfile": {
    "productName": "LeadPilot",
    "targetCustomer": "B2B SaaS growth teams",
    "productDescription": "Automates lead research and personalized outreach from one workflow.",
    "preferredTone": "direct",
    "toneGuidance": "Plain founder voice. No hype.",
    "platforms": ["tiktok", "instagram_reels", "youtube_shorts", "linkedin"]
  }
}
```

- **Validation:** workspace UUID; name 1–120; product name 1–80; target 3–300; description 10–600; guidance ≤300; at least one unique known platform; reject unknown fields.
- **Response 201:** Project resource with product profile. `Location: /api/v1/projects/{id}`.
- **Errors:** 404 workspace, 409 idempotency conflict, 422 fields, 429.
- **Rate limit:** 30/hour/workspace.

### GET `/projects`

List workspace projects.

- **Auth:** Active member.
- **Query:** `workspaceId` required; optional `status`, `cursor`, `limit`, `includeArchived=false`.
- **Response 200:** Project summaries, newest updated first.
- **Validation:** known statuses; limit 1–100.
- **Errors:** 404 workspace, 400 cursor.
- **Rate limit:** 120/min.

### GET `/projects/{projectId}`

Return project summary, active artifacts, and allowed next actions.

- **Auth:** Active member authorized for project workspace.
- **Response 200:** Project plus `allowedActions` such as `upload_recording`, `start_analysis`, `generate_concepts`.
- **Errors:** 404.
- **Rate limit:** 120/min.

### PATCH `/projects/{projectId}`

Update project display name or archive state; product context uses separate endpoint.

- **Auth:** `member+` for name; owner/admin for archive future policy.
- **Headers:** CSRF, `If-Match` revision.
- **Request:** `{ "name": "New name" }` or `{ "archived": true }`; at least one, unknown rejected.
- **Response 200:** Updated project/revision.
- **Errors:** 404, 409 revision/invalid state, 422.
- **Rate limit:** 60/min.

### DELETE `/projects/{projectId}`

Revoke access and start asynchronous purge.

- **Auth:** Owner/admin; MVP owner.
- **Headers:** CSRF, `Idempotency-Key`, `If-Match`.
- **Request:** `{ "confirmation": "LeadPilot launch" }` required when project has exports; otherwise optional.
- **Response 202:** `{ "data": { "projectId": "uuid", "status": "deleting", "job": Job } }`.
- **Errors:** 404, 409 invalid state/revision, 422 confirmation, 429.
- **Rate limit:** 20/hour/workspace.

## Product profile

### GET `/projects/{projectId}/product-profile`

Return active profile plus version metadata.

- **Auth:** Active member.
- **Response 200:** Product profile and `downstreamImpact` summary.
- **Errors:** 404.
- **Rate limit:** 120/min.

### PUT `/projects/{projectId}/product-profile`

Create a new immutable profile version and set active pointer.

- **Auth:** `member+`.
- **Headers:** CSRF, `If-Match` project revision.
- **Request:** Same fields as create profile; full replacement, no workspace ID.
- **Validation:** Same as create. If analysis/concepts exist, body includes `acknowledgeStaleArtifacts: true` or request returns 409 impact confirmation required.
- **Response 200:** New profile, project revision, list/count of artifacts marked stale.
- **Errors:** 404, 409 revision/impact/invalid state, 422.
- **Rate limit:** 30/hour/project.

## Recording upload

### POST `/projects/{projectId}/recordings/uploads`

Create direct upload session. The current hosted foundation returns a bounded single-`PUT` S3-compatible upload session; a later production multipart implementation may swap the upload object shape without changing the project-scoped route.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:**

```json
{
  "filename": "walkthrough.mov",
  "mediaType": "video/quicktime",
  "sizeBytes": 734003200,
  "checksumSha256": "optional-64-hex",
  "partSizeBytes": 16777216,
  "acknowledgeReplace": false
}
```

- **Validation:** filename display 1–255 with controls removed; media type allowlist hint; size 1..plan maximum; checksum format; part size provider bounds; project not deleting; quota/concurrent upload.
- **Response 201:**

```json
{
  "data": {
    "recordingId": "uuid",
    "upload": {
      "uploadId": "opaque API upload session ID",
      "provider": "r2",
      "uploadUrl": "https://...",
      "method": "PUT",
      "headers": { "Content-Type": "video/quicktime" },
      "expiresAt": "...",
      "maxBytes": 734003200,
      "contentType": "video/quicktime",
      "originalFileName": "walkthrough.mov"
    }
  },
  "meta": { "requestId": "req_..." }
}
```

The API response must not expose private object storage keys. If multipart support is enabled later, the API may return a bounded initial set of signed part URLs; for large files, client requests batches to avoid oversized responses.

- **Errors:** 409 active recording/downstream impact unless replace acknowledged, 413, 415, 422, 429 quota/concurrency.
- **Rate limit:** 10/hour/workspace.

### POST `/projects/{projectId}/recordings/{recordingId}/upload-parts`

Issue signed URLs for specific multipart part numbers.

- **Auth:** Same creator/member and active upload ownership.
- **Headers:** CSRF.
- **Request:** `{ "partNumbers": [1,2,3,4] }`, unique sorted, maximum batch 20.
- **Response 200:** List of `{partNumber, url, expiresAt}`; URLs are not logged/cached.
- **Errors:** 404, 409 upload expired/completed, 422.
- **Rate limit:** 120/min/upload with abuse caps.

### POST `/projects/{projectId}/recordings/{recordingId}/complete`

Complete a direct upload and validate/cache the private object as the project recording. The current hosted foundation completes the single-`PUT` upload synchronously through the upload service and returns the validated recording; a production multipart implementation can keep the route and return `202` with a validation job when validation is delegated to workers.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:**

```json
{
  "checksumSha256": "optional-64-hex"
}
```

- **Validation:** active pending upload session, object expected size, optional checksum, project/workspace ownership, source-minute and storage quota.
- **Response 200:** Project summary plus safe recording metadata. Private file paths, object keys, signed URLs, and cache paths are not returned.

```json
{
  "data": {
    "project": {
      "id": "uuid",
      "status": "recording_ready",
      "hasRecording": true
    },
    "recording": {
      "artifactId": "uuid",
      "fileName": "walkthrough.mov",
      "durationMs": 42000,
      "sizeBytes": 734003200,
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "videoCodec": "h264",
      "audioCodec": "aac",
      "hasAudio": true,
      "sha256": "64-hex",
      "validatedAt": "..."
    }
  },
  "meta": { "requestId": "req_..." }
}
```

- **Errors:** 404, 409 incomplete/already completed/invalid state, 422 mismatch, 503 storage.
- **Rate limit:** 20/hour/upload.

### DELETE `/projects/{projectId}/recordings/{recordingId}/upload`

Abort incomplete multipart upload or cancel before verification.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Response 202/204:** Aborted/cancel cleanup job.
- **Errors:** 404, 409 cannot abort active downstream recording without replacement/delete flow.
- **Rate limit:** 20/hour.

### GET `/projects/{projectId}/recordings/{recordingId}`

Return safe recording metadata/status and short-lived preview URL only when verified and requested with `includePreviewUrl=true`.

- **Auth:** Active member.
- **Response 200:** Recording metadata, validation error code/user message, thumbnail/preview signed URL expiry.
- **Errors:** 404.
- **Rate limit:** 120/min.

## Analysis

### POST `/projects/{projectId}/analysis-runs`

Start full analysis for active verified recording/profile.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** `{}`. The current hosted foundation analyzes the active validated project recording/profile; future language hints can be added without changing the route.
- **Validation:** project belongs to session workspace, active recording exists, hosted job queue is configured, no equivalent active analysis job.
- **Response 202:** Analysis run projection plus top-level Job. If an equivalent active analysis job already exists, the API returns it with `reused=true` and does not enqueue a duplicate.

```json
{
  "data": {
    "analysisRun": {
      "id": "job-uuid",
      "projectId": "uuid",
      "workspaceId": "uuid",
      "status": "queued",
      "reused": false
    },
    "job": {
      "id": "job-uuid",
      "projectId": "uuid",
      "workspaceId": "uuid",
      "kind": "analysis",
      "status": "queued"
    }
  },
  "meta": { "requestId": "req_..." }
}
```

- **Errors:** 404, 409 invalid state/active run, 422 media/profile, 429 quota/concurrency, 503.
- **Rate limit:** 20/hour/workspace; one active analysis/project.
- **Queue handoff:** When `GIDEON_HOSTED_QUEUE_URL`/`GIDEON_WORKER_QUEUE_URL` and matching queue secret are configured, hosted dependencies enqueue analysis jobs by POSTing `{ kind, projectId, jobId }` to the worker endpoint with `X-Gideon-Queue-Timestamp` and HMAC `X-Gideon-Queue-Signature`. Worker intake must verify the timestamp tolerance, HMAC, JSON shape, and allowed `analysis|render` kind before enqueueing execution.

### GET `/projects/{projectId}/analysis-runs/{analysisRunId}`

Return status, safe progress, summary when complete, warnings, and allowed actions.

- **Auth:** Active member.
- **Response 200:** Run and associated Job projection.
- **Errors:** 404.
- **Rate limit:** 120/min; clients should use SSE/backoff polling.

### POST `/projects/{projectId}/analysis-runs/{analysisRunId}/cancel`

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** Empty JSON object.
- **Response 202:** Job with `cancelRequested=true` or already terminal status.
- **Errors:** 404, 409 noncancelable terminal stage.
- **Rate limit:** 30/hour.

## Project event stream

### GET `/projects/{projectId}/events`

Authenticated SSE for job/artifact progress.

- **Auth:** Active cookie session; exact Origin check. No token in query.
- **Headers:** `Accept: text/event-stream`, optional `Last-Event-ID`.
- **Response 200:** Events such as `job.updated`, `analysis.completed`, `concepts.completed`, `render.completed`, `project.deleted`; payload contains IDs/status/progress only.
- **Behavior:** Heartbeat comments every 15–30 seconds; bounded replay window; client falls back to GET status.
- **Errors:** 404 project; 429 connection limit.
- **Rate limit:** Max 3 concurrent streams/user and 10/workspace.

## Detected moments

### GET `/projects/{projectId}/analysis-runs/{analysisRunId}/moments`

- **Auth:** Active member.
- **Query:** `includeHidden=false`, cursor/limit up to 100.
- **Response 200:** Ordered moments with evidence-frame thumbnail signed URLs and transcript excerpts.
- **Errors:** 404, 409 analysis not sufficiently complete (or return empty with state; choose consistently).
- **Rate limit:** 120/min.

### PATCH `/projects/{projectId}/moments/{momentId}`

Rename, adjust range, hide, or mark key proof; creates/revises reviewed moment.

- **Auth:** `member+`.
- **Headers:** CSRF, `If-Match` revision.
- **Request:** Any of `label` (1–160), `startMs`, `endMs`, `isHidden`, `isKeyProof`; unknown fields rejected.
- **Validation:** end > start, within recording duration, minimum/maximum range policy.
- **Response 200:** Updated moment/revision and stale impact if concepts already exist.
- **Errors:** 404, 409 revision/impact, 422 range.
- **Rate limit:** 60/min.

### POST `/projects/{projectId}/moments`

Create a user-defined moment.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** `{ "analysisRunId": "uuid", "label": "Final report", "startMs": 123000, "endMs": 131000, "isKeyProof": true }`.
- **Validation:** same project/run/range; label; recording verified.
- **Response 201:** Moment.
- **Errors:** 404, 409 invalid state, 422.
- **Rate limit:** 60/hour/project.

## Content angles

### POST `/projects/{projectId}/content-angle-batches`

Generate ten concepts from reviewed analysis/moments.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:**

```json
{
  "analysisRunId": "uuid",
  "momentRevisionSetHash": "64-hex",
  "preserveSelectedAngleIds": [],
  "additionalGuidance": "Optional, maximum 500 characters"
}
```

- **Validation:** run completed; moments belong/current; guidance treated as untrusted data; quota; no equivalent active batch.
- **Response 202:** Batch `{id,status:'queued'}` + Job.
- **Errors:** 404, 409 stale/active batch, 422 insufficient evidence, 429.
- **Rate limit:** 20/hour/workspace.

### GET `/projects/{projectId}/content-angle-batches/{batchId}`

- **Auth:** Active member.
- **Response 200:** Batch status/job and, when complete, exactly ten ordered angle resources or a typed `insufficient_evidence` outcome.
- **Errors:** 404.
- **Rate limit:** 120/min.

### PATCH `/projects/{projectId}/content-angles/{angleId}`

Edit concept brief/status or select/deselect.

- **Auth:** `member+`.
- **Headers:** CSRF, `If-Match`.
- **Request:** allowlisted `title`, `hookDirection`, `targetPain`, `platforms`, `status` (`selected|dismissed|proposed`).
- **Validation:** text bounds, known unique platforms; maximum three selected in active batch transactionally.
- **Response 200:** Angle, revision, batch selected count.
- **Errors:** 404, 409 revision/selection limit/invalid batch, 422.
- **Rate limit:** 60/min.

### POST `/projects/{projectId}/content-angles/{angleId}/regenerations`

Regenerate one concept while preserving its slot/evidence.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** `{ "guidance": "Make this a before/after angle" }`, max 300.
- **Response 202:** Job and pending successor relation; original remains until success/explicit replacement.
- **Errors:** 404, 409 active regeneration, 422, 429.
- **Rate limit:** 30/hour/workspace.

## Scripts

### POST `/projects/{projectId}/script-batches`

Generate scripts for one to three selected angles.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** `{ "contentAngleIds": ["uuid"], "targetDurationMs": 30000 }`.
- **Validation:** 1–3 unique selected angles from same active batch/project; duration 15000–60000; current evidence/profile.
- **Response 202:** Batch/Job.
- **Errors:** 404, 409 stale/not selected/active job, 422, 429.
- **Rate limit:** 20/hour/workspace.

### GET `/projects/{projectId}/scripts`

- **Auth:** Active member.
- **Query:** optional `contentAngleId`, `status`, `latestOnly=true`.
- **Response 200:** Script resources including hook, voiceover, CTA, caption cues, visual beats, validation warnings, revision.
- **Errors:** 404 project.
- **Rate limit:** 120/min.

### PATCH `/projects/{projectId}/scripts/{scriptId}`

Edit user-controlled script fields.

- **Auth:** `member+`.
- **Headers:** CSRF, `If-Match`.
- **Request:** allowlisted `hookText`, `voiceoverText`, `ctaText`, `captionCues`, `visualBeats`, `overlayCues`; no provider/model/status directly.
- **Validation:** bounded text; caption ranges ordered/non-overlap policy; moment IDs owned; total duration <=60s; prohibited phrases return warnings or validation errors according to field; unsupported claim warning can require acknowledgment/context update.
- **Response 200:** New/revised script, validation, revision, downstream artifacts marked stale.
- **Errors:** 404, 409 revision/invalid state, 422.
- **Rate limit:** 60/min.

### POST `/projects/{projectId}/scripts/{scriptId}/approval`

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`, `If-Match`.
- **Request:** `{ "acknowledgedWarnings": ["claim_requires_review"] }` with only acknowledgeable warning codes.
- **Validation:** no blocking validation errors; current angle/profile/moments; script estimated duration.
- **Response 200:** Approved immutable script version/revision and allowed next actions.
- **Errors:** 404, 409 revision/stale, 422 blocking warnings.
- **Rate limit:** 30/hour/project.

### POST `/projects/{projectId}/scripts/{scriptId}/regenerations`

Regenerate a section or full script without overwriting current version.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** `{ "section": "hook|voiceover|captions|cta|visual_beats|all", "guidance": "..." }`.
- **Validation:** known section; guidance ≤300; script belongs/current enough.
- **Response 202:** Job; successor script created on success and requires review.
- **Errors:** 404, 409 active job, 422, 429.
- **Rate limit:** 30/hour/workspace.

## Voiceovers

### POST `/projects/{projectId}/voiceovers`

Start voiceover generation for approved script.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:**

```json
{
  "scriptId": "uuid",
  "voicePreset": "founder_direct_1",
  "locale": "en-CA",
  "speakingRate": 1.0
}
```

- **Validation:** script approved/current; preset from server allowlist; locale supported; rate 0.8–1.2 initial; quota.
- **Response 202:** Voiceover resource + Job.
- **Errors:** 404, 409 script state/active equivalent, 422 unsupported voice/locale, 429.
- **Rate limit:** 30/hour/workspace.

### GET `/projects/{projectId}/voiceovers/{voiceoverId}`

- **Auth:** Active member.
- **Response 200:** Status, duration, voice preset (not provider secret), safe error, and short-lived preview URL when complete.
- **Errors:** 404.
- **Rate limit:** 120/min.

### POST `/projects/{projectId}/voiceovers/{voiceoverId}/cancel`

- **Auth:** `member+`; CSRF/idempotency.
- **Response 202:** Cancellation requested or terminal resource.
- **Errors:** 404, 409 noncancelable.
- **Rate limit:** 30/hour.

## Render jobs

### POST `/projects/{projectId}/render-jobs`

Compile current approved script/edit choices into immutable manifest and render. The current hosted foundation queues render work for the project’s existing scripts and returns a top-level Job; future manifest/profile inputs can be enabled on the same route.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** `{}` for the current hosted foundation. Future manifest-specific render requests may use:

```json
{
  "scriptId": "uuid",
  "voiceoverId": "uuid-or-null",
  "templateKey": "signal-short",
  "profile": "preview_v1",
  "editDecision": {
    "sourceStartMs": 1000,
    "sourceEndMs": 32000,
    "focus": { "x": 0.62, "y": 0.44, "scale": 1.35 },
    "captionStyle": "signal",
    "sourceGainDb": -12,
    "voiceoverGainDb": -1
  }
}
```

- **Validation:** project belongs to session workspace, active recording exists, at least one script exists, hosted job queue is configured, no equivalent active render job. Future manifest mode additionally validates approved/current script; completed voiceover if provided; template/profile allowlist; source bounds; x/y 0..1, scale 1..configured max; gain bounds; caption/overlay preflight; all IDs same project/workspace; quota.
- **Response 202:** Render job projection plus top-level Job. If an equivalent active render job already exists, the API returns it with `reused=true` and does not enqueue a duplicate. Future manifest mode may return an existing completed generated video for identical idempotent manifest with `200 reused=true`.
- **Queue handoff:** Same signed hosted worker endpoint contract as analysis jobs, with `kind: "render"`.

```json
{
  "data": {
    "renderJob": {
      "id": "job-uuid",
      "projectId": "uuid",
      "workspaceId": "uuid",
      "status": "queued",
      "reused": false
    },
    "job": {
      "id": "job-uuid",
      "projectId": "uuid",
      "workspaceId": "uuid",
      "kind": "render",
      "status": "queued"
    }
  },
  "meta": { "requestId": "req_..." }
}
```

- **Errors:** 404, 409 stale/active equivalent/invalid state, 422 manifest preflight, 429.
- **Rate limit:** 30/hour/workspace; concurrency entitlement.

### GET `/projects/{projectId}/render-jobs/{renderJobId}`

- **Auth:** Active member.
- **Response 200:** Job status/stage/progress, QA status/warnings, generated video ID when ready.
- **Errors:** 404.
- **Rate limit:** 120/min.

### POST `/projects/{projectId}/render-jobs/{renderJobId}/cancel`

- **Auth:** `member+`; CSRF/idempotency.
- **Response 202:** Job cancellation requested.
- **Errors:** 404, 409 terminal/noncancelable finalization.
- **Rate limit:** 30/hour.

## Generated videos

### GET `/projects/{projectId}/generated-videos`

- **Auth:** Active member.
- **Query:** optional status/profile/contentAngleId, cursor/limit.
- **Response 200:** Video cards with thumbnail signed URL, status/stale reason, version, duration/profile, allowed actions.
- **Errors:** 404 project.
- **Rate limit:** 120/min.

### GET `/projects/{projectId}/generated-videos/{videoId}`

- **Auth:** Active member.
- **Query:** `includePreviewUrl=true`; URL short-lived and no-store.
- **Response 200:** Full review representation: script/manifest/edit projection, video metadata, preview URL, QA warnings, revision lineage.
- **Errors:** 404.
- **Rate limit:** 120/min.

### PATCH `/projects/{projectId}/generated-videos/{videoId}/edit`

Create a new EDL/manifest draft from a completed video; does not mutate encoded artifact.

- **Auth:** `member+`.
- **Headers:** CSRF, `If-Match` editing revision.
- **Request:** allowlisted text/caption/focus/source/audio fields matching EDL schema. No arbitrary template component/filter/URL.
- **Validation:** ranges, fit, safe areas, caption text/lines, gains, owned moment/recording IDs.
- **Response 200:** New edit draft/manifest version, old video status remains ready but successor state is stale/pending; client then starts render job.
- **Errors:** 404, 409 revision/invalid state, 422 preflight.
- **Rate limit:** 60/min.

### DELETE `/projects/{projectId}/generated-videos/{videoId}`

- **Auth:** `member+` or owner/admin future policy.
- **Headers:** CSRF, `Idempotency-Key`.
- **Response 202:** Deletion Job; access revoked immediately.
- **Errors:** 404, 409 already deleting.
- **Rate limit:** 20/hour.

## Export

### POST `/projects/{projectId}/exports`

Create/reuse final export from a completed render. If only preview or queued render state exists, client must start or wait for render first; API does not hide that stage.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** `{ "renderId": "uuid" }`. Future final-profile/generated-video aliases may be accepted once generated video resources are split from render records.
- **Validation:** project belongs to session workspace, render exists and is completed, export service is configured, export/storage quota.
- **Response 201:** Safe export artifact projection plus project summary. Private object keys, local cache paths, and signed download URLs are not returned here; use the download-url endpoint.

```json
{
  "data": {
    "export": {
      "id": "uuid",
      "projectId": "uuid",
      "workspaceId": "uuid",
      "renderId": "uuid",
      "contentType": "video/mp4",
      "byteSize": 123456,
      "sha256": "64-hex",
      "originalFileName": "leadpilot-launch.mp4",
      "createdAt": "..."
    },
    "project": {
      "id": "uuid",
      "artifactsCount": 4
    }
  },
  "meta": { "requestId": "req_..." }
}
```

- **Errors:** 404, 409 stale/not-final/not-ready, 422 filename/QA, 429.
- **Rate limit:** 30/hour/workspace.

### GET `/projects/{projectId}/exports/{exportId}`

- **Auth:** Active member.
- **Response 200:** Export status, file metadata, expiry policy, download count; no URL unless requested through download endpoint.
- **Errors:** 404.
- **Rate limit:** 120/min.

### POST `/projects/{projectId}/exports/{exportId}/download-url`

Authorize and mint one short-lived signed GET URL.

- **Auth:** Active member.
- **Headers:** CSRF (POST prevents link prefetch side effects/rate use); no idempotency required.
- **Request:** `{}`.
- **Response 200:** Safe download payload with one short-lived URL; private object keys, local cache paths, and provider internals are not returned. `Cache-Control: no-store`.

```json
{
  "data": {
    "download": {
      "exportId": "uuid",
      "projectId": "uuid",
      "workspaceId": "uuid",
      "url": "signed",
      "expiresAt": "...",
      "filename": "leadpilot-launch.mp4",
      "contentType": "video/mp4",
      "byteSize": 123456
    }
  },
  "meta": { "requestId": "req_..." }
}
```
- **Validation:** export ready/not deleted/retention valid; workspace authorized.
- **Errors:** 404, 409 expired/not ready, 429.
- **Rate limit:** 60/hour/user.

### DELETE `/projects/{projectId}/exports/{exportId}`

- **Auth:** `member+`; CSRF/idempotency.
- **Response 202:** Delete job/revoked access.
- **Errors:** 404, 409.
- **Rate limit:** 20/hour.

## Generic jobs

### GET `/jobs/{jobId}`

- **Auth:** Active member of job workspace.
- **Response 200:** Standard Job; result contains only artifact IDs/links to API resources.
- **Errors:** 404.
- **Rate limit:** 120/min.

### POST `/jobs/{jobId}/cancel`

Cancel a queued job immediately or request cooperative cancellation for a running job.

- **Auth:** `member+`.
- **Headers:** CSRF.
- **Request:** `{}`.
- **Validation:** status queued/running; job marked cancelable.
- **Response 202:** Updated Job with `canceled` or `canceling` status.
- **Errors:** 404, 409 not cancelable.
- **Rate limit:** 30/hour/workspace.

### POST `/jobs/{jobId}/retry`

Retry terminal retryable job using same immutable inputs.

- **Auth:** `member+`.
- **Headers:** CSRF, `Idempotency-Key`.
- **Request:** `{}`.
- **Validation:** status failed; retryable true; attempts/policy/quota; inputs still exist/current enough.
- **Response 202:** New attempt/job relation (prefer new job ID) or updated job by chosen invariant.
- **Errors:** 404, 409 not retryable/active/stale, 429.
- **Rate limit:** 30/hour/workspace.

## Usage and plan readiness

### GET `/workspaces/{workspaceId}/usage`

- **Auth:** Active member; billing details owner/admin future.
- **Query:** `period=current|YYYY-MM`.
- **Response 200:** Plan code, reset date, per-entitlement used/reserved/limit and non-sensitive cost summary only if role allows.
- **Errors:** 404, 422 period.
- **Rate limit:** 60/min.

### GET `/workspaces/{workspaceId}/entitlements`

- **Auth:** Active member.
- **Response 200:** Effective product limits/capabilities used by UI; server remains authority.
- **Errors:** 404.
- **Rate limit:** 60/min.

### POST `/workspaces/{workspaceId}/billing/checkout-sessions`

Create a hosted billing checkout session for a new paid workspace plan. The API authorizes the workspace and validates the requested plan before delegating provider-specific session creation to the billing adapter.

- **Auth:** owner/admin.
- **Headers:** CSRF.
- **Request:** `{ "plan": "starter|team|enterprise", "successUrl": "https://...", "cancelUrl": "https://..." }`.
- **Validation:** session workspace must match URL workspace, billing provider configured, price ID mapped for requested plan, absolute http(s) return URLs.
- **Provider wiring:** Hosted dependencies auto-wire the Stripe adapter when configured. The adapter posts `mode=subscription`, the configured price ID, workspace/user/plan metadata, and existing customer ID when present. Requires `GIDEON_BILLING_PROVIDER=stripe` plus `STRIPE_SECRET_KEY` or `GIDEON_STRIPE_SECRET_KEY`.
- **Response 201:** Provider checkout session URL. `Cache-Control: no-store`.

```json
{
  "data": {
    "checkoutSession": {
      "id": "cs_...",
      "workspaceId": "uuid",
      "provider": "stripe",
      "plan": "team",
      "url": "https://checkout.stripe.com/...",
      "expiresAt": "..."
    }
  },
  "meta": { "requestId": "req_..." }
}
```

- **Errors:** 403, 422 invalid plan/URL, 503 billing not configured.
- **Rate limit:** 20/hour/workspace.

### POST `/workspaces/{workspaceId}/billing/portal-sessions`

Create a hosted customer portal session for an existing billing customer.

- **Auth:** owner/admin.
- **Headers:** CSRF.
- **Request:** `{ "returnUrl": "https://..." }`.
- **Validation:** session workspace must match URL workspace, billing provider configured, workspace has a provider customer ID, absolute http(s) return URL.
- **Provider wiring:** Stripe adapter posts the stored provider customer ID and return URL to the customer portal sessions API.
- **Response 201:** Provider customer portal URL. `Cache-Control: no-store`.

```json
{
  "data": {
    "portalSession": {
      "id": "bps_...",
      "workspaceId": "uuid",
      "provider": "stripe",
      "plan": "team",
      "url": "https://billing.stripe.com/...",
      "expiresAt": null
    }
  },
  "meta": { "requestId": "req_..." }
}
```

- **Errors:** 403, 409 missing billing customer, 422 invalid URL, 503 billing not configured.
- **Rate limit:** 20/hour/workspace.

## Future social scheduling endpoints — not implemented in MVP

These reserve contract direction only. Do not expose routes until platform review, secure token storage, consent, retries, delete/revoke, and policy compliance are complete.

### POST `/workspaces/{workspaceId}/social-connections`

- Start OAuth with state/PKCE; returns an allowlisted provider authorization URL. Never accepts raw platform access tokens from browser unless provider flow requires and design is reviewed.
- Auth owner/admin; CSRF/idempotency; strict redirect allowlist and state binding.

### GET `/workspaces/{workspaceId}/social-connections`

- List provider/account display metadata and scopes/health; never tokens.

### DELETE `/workspaces/{workspaceId}/social-connections/{connectionId}`

- Revoke provider token when possible, delete encrypted credentials, cancel or flag scheduled posts, audit action.

### POST `/projects/{projectId}/scheduled-posts`

Proposed request:

```json
{
  "exportId": "uuid",
  "connectionId": "uuid",
  "platform": "tiktok",
  "scheduledAt": "2026-07-01T16:00:00Z",
  "caption": "...",
  "acknowledgePlatformPolicy": true
}
```

- Validate export/current rights, account scopes, platform format/text limits, future time window, timezone, content attestation, rate/quota.
- Return 202 scheduled post + job. Human confirmation is required; no default auto-post.

### GET `/projects/{projectId}/scheduled-posts`

- List scheduled/publishing/published/failed/canceled with platform post ID/link where permitted.

### PATCH `/projects/{projectId}/scheduled-posts/{postId}`

- Update future scheduled time/caption only before platform-specific lock window; revision required.

### DELETE `/projects/{projectId}/scheduled-posts/{postId}`

- Cancel pending job; deleting already-published platform content is a separate explicit action with confirmation.

## Webhooks — future billing/social providers

`POST /webhooks/{provider}` is outside cookie auth/CSRF but must:

- read bounded raw bytes;
- verify provider signature/timestamp before parsing;
- reject replay outside tolerance;
- store provider event ID with unique constraint;
- return quickly after transactional event/outbox persistence;
- process asynchronously and reconcile with provider API for critical billing state;
- rate limit/body limit at edge;
- never log raw body/signature.

## Contract evolution

- Additive fields are optional to old clients.
- Breaking changes create `/api/v2` or a negotiated schema version; do not silently repurpose enums/fields.
- Queue/manifest schemas carry independent `schemaVersion` and support at least current + previous during rolling deploy.
- Generated artifacts retain the versions that created them indefinitely for reproducibility, even if code no longer renders that version without a compatibility image.
- OpenAPI is generated from the same schemas, protected/disabled on public production as deployment policy requires, and contract-diffed in CI.

## API acceptance tests

- Every tenant endpoint denies a valid user from another workspace with generic 404.
- Every cookie-auth state change fails without valid CSRF and Origin.
- Unknown fields and invalid UUID/range/enum are rejected.
- Retried create/enqueue calls with same idempotency key/payload return same result; different payload returns 409.
- Revision conflicts never overwrite newer text/edit state.
- No endpoint returns object key, provider credential, signed URL outside explicit short-lived URL response, raw prompt/response, stack, or path.
- Long tasks return 202 under API latency budget.
- Rate/quota/concurrency errors occur before provider/media work starts.
- Delete revokes access immediately and is idempotent.
