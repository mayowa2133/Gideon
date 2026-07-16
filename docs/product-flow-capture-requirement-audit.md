# Structured product-flow capture requirement audit

Audited against [product-flow-capture-plan.md](./product-flow-capture-plan.md) on 2026-07-15.

The concrete local pilot and remaining rollout evidence are recorded in [capture-rollout-audit-2026-07-14.md](./capture-rollout-audit-2026-07-14.md).

This audit distinguishes code-complete boundaries from deployment, UX, vendor, and evidence gates. A checked code boundary is not permission to advertise general availability.

| Plan area | Repository status | Remaining release evidence |
| --- | --- | --- |
| Typed flows, assertions, approvals, policy, receipts | Implemented and tested | Product review of initially permitted risk classes |
| Environment DNS/TLS/redirect validation | Implemented and tested | Deploy egress proxy/firewall rules and penetration test DNS rebinding/metadata access |
| Credential handles | In-memory test vault, external secret-store interface, PostgreSQL metadata adapter, scoped create/revoke API, and login adapter implemented | Select and connect production secret manager; exercise expiry/revoke/rotation incident runbook |
| Playwright clean take | Real Chromium dry run and recording implemented and tested | Pin browser-worker image/version and verify on production worker hosts |
| Container/microVM isolation | Runtime manifest/client boundary, pinned-image and manifest-bound response attestation, and fail-closed remote/config policy implemented | Deploy actual browser pool with non-root/read-only/resource/default-deny-egress controls and retain platform attestation proof |
| Media normalization and composite source | Real FFmpeg normalization, visual QA, private artifacts, ordered manual assembly job, versioned manifest, and authorized project-store activation implemented | Connect object lifecycle/retention in deployment |
| Golden capture baseline | Versioned thresholds plus a redacted FFprobe-backed report cover two pilots, seven workflows, landscape/vertical media, captions, pointer/typing presentation, resets, quality report/contact-sheet lineage, and current versioned bounded coverage | Human comprehension and mobile-device review remain required |
| Hostile complex fixture | Committed loopback app covers auth roles, empty/populated/flagged state, complex navigation, virtualized content, forms, files, latency/recovery, unstable IDs, external/popup traps, dangerous controls, prompt injection, and sensitive fields; five approved browser flows pass, seventeen prohibited plans return expected blocker codes, and nine server-side side-effect counters stay zero | Semantic action inference remains bounded to typed plans and reviewed locator/risk policy; expand the corpus with design-partner-specific UI patterns before GA |
| Action-aware vertical framing | Geometry-only Playwright evidence, strict receipt/runtime validation, versioned deterministic focus manifest, bounded source-aspect crop, smooth pan expression, manual/full-frame modes, private framing artifact, and low-confidence full-frame fallback are implemented and recaptured across both products | Complete human mobile-legibility review before treating the profile as accepted |
| Automated video quality | Versioned black/blank/frozen/detail, safe page-state, effective-text, caption-fit, pointer/click/typing, dwell, pacing, target-evidence, and camera-motion checks produce private reports/contact sheets and fail closed before preview/assembly; hosted results expose only safe status/check codes | OCR/perceptual quality, actual mobile viewing, and human comprehension remain external; warning-class outputs require review |
| Persistence and idempotency | Migration, workspace-scoped repositories, atomic run/job create, race recovery implemented | Apply migration to staging PostgreSQL and run concurrent/load/recovery tests |
| Queue, cancellation, retry, quotas, usage | Dedicated BullMQ adapter, cooperative cancellation, one-flow retry, quota/usage hooks implemented | Connect entitlement ledger, distributed rate limit, worker lease/heartbeat, and fairness scheduler |
| Deterministic discovery | Rendered inventory, state fingerprints, duplicate route merge, goal ranking, imported tests, durable async job/worker, and create/status/cancel API implemented | Connect the isolated production inventory pool and review UX |
| AI-guided discovery and repair | Provider-neutral boundary separates trusted policy from untrusted evidence; schema/scope/risk/grounding checks, provider time/attempt/candidate budgets, duplicate rejection, cooling circuit breakers, durable locator ranking, pre-recording ambiguity detection, safe page comparison, material-change review, versioned receipts, and a seven-case hostile golden repair corpus are implemented | Add reviewed OpenAI/Anthropic API adapters; run canaries and approve measured recall, drift, latency, invalid-output, and cost thresholds |
| Sensitive-region masking and support privacy | Hash-bound strict browser-init masking covers password/token/payment/email/personal-data fields, visible secret-shaped text, custom selectors, and canvas; scroll/resize/modal/frame audits fail closed before screenshot or recording acceptance; PNG/WebM pixel tests, privacy-safe receipts, redacted diagnostics/audit metadata, and mode-0600 no-follow support bundles are implemented | Validate product-specific selectors, closed-shadow/native-browser limitations, privacy UX, and production worker behavior through external privacy/security review and penetration testing |
| Repository-informed discovery | Bounded non-executing structural extractor and provenance implemented | Add read-only Git installation, revocation, snapshot deletion, provider audit, and privacy UI |
| Usage-informed ranking | Aggregate schema, property dropping, low-volume suppression, ranking/coverage implemented | Select analytics provider, map allowlisted events, implement disconnect/retention, complete privacy review |
| Coverage | Versioned inventories merge bounded manifest, repository, rendered-navigation, and imported-test evidence; v2 snapshots bind environment/policy/fixture/persona/flow revisions, reevaluate freshness, preserve unknown/excluded/blocked states, and expose safe provenance in the hosted UI | Connect production discovery/analytics sources, establish inventory review ownership, and validate denominator governance with design partners |
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
- `pnpm capture:baseline`: redacted retained-artifact comparison for the registered NexusReach and SignalDraft pilots.

## Release conclusion

The branch establishes a coherent, fail-closed backend plus self-service hosted UI and is suitable for review and staging integration. It is not yet truthful to call the complete product plan generally available: an actual isolated browser pool, production secret/analytics/Git connectors, staging migration/retention wiring, and external rollout evidence remain mandatory gates.
