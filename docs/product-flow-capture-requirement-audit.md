# Structured product-flow capture requirement audit

Audited against [product-flow-capture-plan.md](./product-flow-capture-plan.md) on 2026-07-14.

This audit distinguishes code-complete boundaries from deployment, UX, vendor, and evidence gates. A checked code boundary is not permission to advertise general availability.

| Plan area | Repository status | Remaining release evidence |
| --- | --- | --- |
| Typed flows, assertions, approvals, policy, receipts | Implemented and tested | Product review of initially permitted risk classes |
| Environment DNS/TLS/redirect validation | Implemented and tested | Deploy egress proxy/firewall rules and penetration test DNS rebinding/metadata access |
| Credential handles | In-memory test vault, external secret-store interface, PostgreSQL metadata adapter, scoped create/revoke API, and login adapter implemented | Select and connect production secret manager; exercise expiry/revoke/rotation incident runbook |
| Playwright clean take | Real Chromium dry run and recording implemented and tested | Pin browser-worker image/version and verify on production worker hosts |
| Container/microVM isolation | Runtime manifest/client boundary and fail-closed remote policy implemented | Deploy actual browser pool with non-root/read-only/resource/default-deny-egress controls and capture proof |
| Media normalization and composite source | Real FFmpeg normalization, visual QA, private artifacts, ordered manual assembly job, versioned manifest, and authorized project-store activation implemented | Connect object lifecycle/retention in deployment |
| Persistence and idempotency | Migration, workspace-scoped repositories, atomic run/job create, race recovery implemented | Apply migration to staging PostgreSQL and run concurrent/load/recovery tests |
| Queue, cancellation, retry, quotas, usage | Dedicated BullMQ adapter, cooperative cancellation, one-flow retry, quota/usage hooks implemented | Connect entitlement ledger, distributed rate limit, worker lease/heartbeat, and fairness scheduler |
| Deterministic discovery | Rendered inventory, state fingerprints, duplicate route merge, goal ranking, imported tests, durable async job/worker, and create/status/cancel API implemented | Connect the isolated production inventory pool and review UX |
| AI-guided discovery and repair | Provider-neutral boundary, schema/policy checks, prompt-like evidence signals, repair constraints, evaluation harness implemented | Add reviewed OpenAI/Anthropic API adapters; run canaries and approve measured recall/drift thresholds |
| Repository-informed discovery | Bounded non-executing structural extractor and provenance implemented | Add read-only Git installation, revocation, snapshot deletion, provider audit, and privacy UI |
| Usage-informed ranking | Aggregate schema, property dropping, low-volume suppression, ranking/coverage implemented | Select analytics provider, map allowlisted events, implement disconnect/retention, complete privacy review |
| Coverage | Multi-dimensional calculation, persistence, automatic post-capture snapshot, and latest-read service implemented | Enrich route/state denominators from production discovery evidence and build coverage review UI |
| Self-service HTTP | Async validation/discovery, environment/persona/flow review, capture/status/cancel/retry, ordered assembly, signed preview, coverage, audit, and capabilities routes implemented behind dependency gates | Generate OpenAPI and run staging contract tests against deployed dependencies |
| Self-service UI | Hosted Next.js project launcher and connect/discover/edit/approve/run/results/preview/retry/coverage/assembly screens implemented; same-origin proxy and real-browser E2E are tested; capture controls fail closed unless all dependencies are configured | Deploy with the existing auth shell, run accessibility/usability review, and validate with design partners |
| Deletion | Transactional capture-row purge and secret cleanup/reconciliation implemented | Connect to the main project-deletion outbox and verify object purge end to end |
| Observability and config | Safe aggregate snapshot, production configuration checker, and fail-closed capability endpoint implemented | Export metrics/traces, create dashboards/alerts, support views, capacity and cost SLOs |
| Internal concierge workflow | Domain modules can be invoked directly | Add supported CLI/MCP commands and operator checklist if the team wants design-partner concierge before UI |
| General availability gates | Not locally satisfiable | Design-partner results, legal/vendor review, external security/privacy review, penetration test, load/cost tests, incident exercises, published limitations |

## Automated evidence

- `pnpm test:capture`: capture-focused unit and real browser/media integration suite.
- `pnpm lint`: repository policy/lint gate.
- `pnpm typecheck`: main, renderer, and MCP TypeScript checks.
- `pnpm test`: full regression suite.
- `pnpm test:web`: hosted client and proxy policy unit suite.
- `pnpm test:e2e`: hosted capture workspace real-browser journey and capability fail-closed test.
- `pnpm build`: Electron main, renderer, MCP, and hosted Next.js production builds.
- `pnpm capture:worker:check`: deployment configuration gate; production refuses local browser isolation, in-memory secrets, or local artifact storage.

## Release conclusion

The branch establishes a coherent, fail-closed backend plus self-service hosted UI and is suitable for review and staging integration. It is not yet truthful to call the complete product plan generally available: an actual isolated browser pool, production secret/analytics/Git connectors, staging migration/retention wiring, and external rollout evidence remain mandatory gates.
