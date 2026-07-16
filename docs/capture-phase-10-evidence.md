# Phase 10 local evidence — operator surfaces

Date: 2026-07-16

Phase 10 adds supported hosted CLI, MCP, OpenAPI, and review-UI surfaces over the existing structured-capture service. No command or test manipulates capture database rows directly.

## Implemented evidence

- A synthetic CLI journey moves from capability connection through secret-free environment creation/validation, discovery, flow review, exact-revision approval, capture, completed execution inspection, quality receipts, and bounded coverage.
- CLI manifests recursively reject credential-, header-, secret-, token-, password-, and command-shaped keys. Session cookies and CSRF tokens are accepted only through environment variables.
- Hosted MCP tools expose equivalent readiness, environment, discovery, flow-review, run-control, retry, evidence, and cancellation-based cleanup operations. Mutations remain behind hosted authorization and CSRF; async creation uses `Idempotency-Key`.
- Flow approval now requires the exact reviewed revision in the hosted API and web client. Missing revisions fail validation; stale revisions return `409 revision_conflict` with an actionable review message.
- `CAPTURE_RUNTIME_OPERATIONS` generates OpenAPI 3.1 at build time and through authenticated `GET /api/v1/openapi/capture.json`. Contract tests assert unique operation IDs, approval revision requirements, and idempotency headers.
- Hosted results show contained source framing, safe quality warnings, repair-review blockers, honest denominator provenance, explicit retry queueing state, and automatically follow the newly created retry run.

## Verification record

- Targeted main/MCP/API/operator/OpenAPI suite: 5 files, 57 tests passed.
- Capture-focused suite: 61 files, 214 tests passed.
- Full regression suite: 126 files passed, 2 environment-gated files skipped; 622 tests passed, 8 environment-gated tests skipped.
- Hosted web unit suite: 3 files, 9 tests passed.
- Main, renderer, MCP, and hosted web TypeScript checks passed.
- `pnpm capture:openapi` generated `docs/openapi/capture-api.json` successfully.
- Hosted Playwright E2E: 2 tests passed, including framing preview and capability fail-closed behavior.
- Desktop, MCP, and hosted Next.js production builds passed; repository lint passed.

Staging SSO, deployed isolated workers, external secret storage, and a design-partner sandbox remain external rollout evidence rather than local claims.
