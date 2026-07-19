# Creator-video requirements matrix

Updated: 2026-07-18

Status meanings:

- **Complete — local:** implemented and verified without an external provider.
- **External canary:** provider-neutral implementation exists; a real provider/model run is still required.
- **User confirmation:** a product, brand, consent, or commercial decision is required.
- **Deferred:** useful follow-up that is not needed for structural correctness and has not been implemented.

## Live matrix

| Requirement | Current evidence | Status | Tests/validation | Remaining confirmation |
|---|---|---|---|---|
| Reference grammar | Versioned 36–53s template, ≤3s hook, 4.5s CTA, three pace ranges, safe areas, transitions and −14 LUFS target | Complete — local | `creativeBlueprint.test.ts` | Brand acceptance only |
| Scene-level composition | `CreativeBlueprint`, `SceneComposition`, `PresenterCue`, `ProductEvidenceAsset`, quality/render policies | Complete — local | Main and renderer type checks | None |
| Backward compatibility | Blueprint is optional on EDL/script; approved scripts compile and project onto EDL v2 | Complete — local | compiler/store type check and projection tests | None |
| Evidence-grounded direction | Claim IDs resolve to approved evidence assets; missing support is blocking | Complete — local | compiler and quality tests | Product owner approves factual evidence |
| Deterministic planning | Stable IDs/timing/layout choices, CTA reservation, presenter/product alternation, manual override preservation | Complete — local | deterministic recompilation tests | None |
| Product asset records | Screenshot, clip, mockup, terminal, phone, before/after, feature/comparison/hero/conceptual kinds with lineage and approval | Complete — local | `creativeBlueprint.test.ts` | User approves captured assets |
| Product asset materialization | FFmpeg screenshots, trimmed clips, before/after composition, masks and path-free manifest | Complete — local | `productAssetFactory.test.ts`; benchmark | None for local fixtures |
| Cursor/click/typing policy | Existing capture telemetry/cues are retained and used only when explanatory | Complete — local | Existing capture presentation tests | Product-specific allowed actions |
| Avatar contract | Performance metadata, crop/matte, timing/tags, receipt, status/failure, consent and script lineage | Complete — local | `avatarWorker.test.ts` | Provider/model choice |
| Deterministic avatar fixture | Green-screen 1080×1920/30 fixture exercises multiple compositions and hidden scenes | Complete — local | fixture tests and benchmark | Not evidence of realism |
| Real avatar quality | Typed lip-sync/deformation/stability/flicker/pronunciation/emotion report | External canary | Contract/type checks | Provider, GPU/model, legal and human acceptance |
| Scene-aware compositor | Per-scene visibility/crops, product-only/split/card layouts, chroma key/fallback, text, CTA, transitions/SFX | Complete — local | renderer tests and benchmark | Final brand styling |
| Caption/typography system | Kinetic bold and editorial serif/italic, word highlight, emphasis, placement, safe layouts and CTA | Complete — local | compiler/renderer/quality tests | Accessibility threshold |
| Pacing | Readable, energetic and explicit reference-fast; narration estimate, proof dwell and CTA reservation | Complete — local | compiler tests and readable/energetic benchmark plans | Default pace choice |
| Pronunciation dictionary | Editable product-profile contract | Complete — local | profile/type checks | Selected TTS must honor it |
| Audio | Mixed narration/music/SFX, measured post-encode normalization, missing/silence/loudness checks | Complete — local | parser tests; benchmark measured −14 LUFS | Voice selection |
| Media quality | Format/duration/audio/frame-signal gates | Complete — local | `creatorVideoQuality.test.ts`; ffprobe benchmark | Production thresholds |
| Structural quality | Dwell, cut rate, repetition, CTA, evidence, text/collision gates | Complete — local | quality tests | Human creative approval |
| Avatar safety quality | Disclosure, consent, lineage, artifact, crop/FPS/duration and matte gates | Complete — local | avatar and quality tests | Real artifact canary |
| Scene review | Pace and scene inspection/editing for shot, asset, presenter and text; evidence/override visibility | Complete — local | Renderer type check | UX acceptance |
| Single-scene revision | Blueprint scene can be replanned while other manual overrides persist | Complete — local | preservation/replan logic tests | None |
| Single-scene encoded rerender cache | Final export currently recomposes the full timeline | Deferred | Not implemented | Choose cache/storage complexity budget |
| Local benchmark | Synthetic source, screenshot/clip, 10 shot types, fixture avatar, captions/type, CTA, final render/contact sheet/report | Complete — local | 1080×1920 H.264/AAC and ffprobe/audio QA | Subjective review never inferred |
| Path/privacy hygiene | Benchmark report uses basenames, media under ignored `tmp/`, mode 0600 | Complete — local | final diff/status audit | None |
| Production deployment | Contracts are provider-neutral; no infrastructure was modified | User confirmation | Existing production checks available | Infrastructure and spending authorization |

## Later confirmations

Each item below is deliberately actionable. Codex cannot make identity, consent, legal, commercial, spending, or subjective brand decisions on the user's behalf.

### User decisions

#### 1. AI avatar identity

- **Confirm:** fictional Gideon-owned avatar, the user's consented likeness, another authorised person, or managed-provider stock avatar.
- **Why later:** ownership, likeness rights, brand fit, and consent are human/legal facts that local code cannot establish.
- **Recommended:** start with a fictional Gideon-owned avatar; it minimizes consent and revocation risk while the production system is validated.
- **Trade-offs:** fictional is safest/private but may feel less personal; user likeness is distinctive but needs durable consent/source capture; another person adds authorization risk; stock is fast but less differentiated and provider-dependent.
- **Canary:** import the approved source/ID, generate the benchmark narration, then run `pnpm avatar:worker:canary` and the creator benchmark with that artifact.
- **Pass/fail:** pass only with matching source receipt, current consent where required, correct disclosure, stable identity, and human brand approval; otherwise fail.
- **Unlocks:** production presenter artifact, final crop rules, and identity-specific QA thresholds.

#### 2. Avatar provider

- **Confirm:** existing MuseTalk worker, SadTalker prototype, Synthesia, Tavus, HeyGen, or another approved provider.
- **Why later:** the options differ materially in price, privacy, realism, licensing, latency, API behavior, and infrastructure.
- **Recommended:** canary the existing MuseTalk worker first if its licence is commercially approved; compare one managed provider only if local quality misses the threshold.
- **Trade-offs:** local MuseTalk/SadTalker offers control and privacy but requires GPU operations; managed providers offer quality/operations but add cost, retention, vendor lock-in, and rate limits.
- **Canary:** set provider-specific configuration, run `pnpm avatar:worker:check && pnpm avatar:worker:canary`, then render the fixed benchmark script.
- **Pass/fail:** complete receipt/metadata, no stale lineage, duration within 1.5s, valid matte/crop/FPS, no provider errors, and human quality acceptance.
- **Unlocks:** provider adapter finalization, retry/time-out policy, cost model, and production SLA.

#### 6. Voice policy

- **Confirm:** approved stock TTS, provider voice, user-authorised custom voice, and whether voice cloning stays disabled.
- **Why later:** voice rights, cloning consent, brand tone, pronunciation, and provider pricing are policy decisions.
- **Recommended:** approved stock TTS with cloning disabled for the first release.
- **Trade-offs:** stock is safer and repeatable but less distinctive; provider voices improve convenience but increase lock-in; custom voice improves identity but requires explicit consent/revocation and stronger abuse controls.
- **Canary:** run `pnpm provider:canary`, synthesize the benchmark plus pronunciation-dictionary terms, and measure duration/alignment.
- **Pass/fail:** all terms pronounced acceptably, audio valid, captions remain aligned, voice rights documented, and cloning policy enforced.
- **Unlocks:** final TTS adapter/configuration and narration acceptance thresholds.

#### 7. Visual identity

- **Confirm:** avatar appearance, wardrobe, background, personality, gesture intensity, and exact disclosure wording.
- **Why later:** these are brand and legal-disclosure choices, not technical facts.
- **Recommended:** restrained wardrobe/background, medium gestures, and visible `AI-generated brand presenter` wording until counsel approves another formulation.
- **Trade-offs:** energetic styling may improve attention but increase uncanny/artifact risk; subtle styling improves repeatability but can feel generic; stronger disclosure is safer but occupies screen space.
- **Canary:** render the same benchmark in full, medium, lower-third, split, and CTA crops and conduct a signed brand review.
- **Pass/fail:** no crop/wardrobe/background failures, disclosure is readable, and brand reviewer approves every layout.
- **Unlocks:** locked presenter preset and final visual tokens.

#### 8. Default pace

- **Confirm:** readable, energetic, or reference-fast.
- **Why later:** the default affects comprehension, duration, platform fit, and brand tone.
- **Recommended:** energetic (160–175 WPM), with readable available and reference-fast explicit only.
- **Trade-offs:** readable maximizes comprehension but needs more time/fewer claims; energetic balances attention and proof; reference-fast resembles the references but risks poor comprehension/accessibility.
- **Canary:** render identical approved copy with all three plans; run a five-person comprehension/readability review.
- **Pass/fail:** at least the agreed comprehension threshold, no proof-dwell failures, and no caption overflow.
- **Unlocks:** product default and script-fit warnings.

#### 9. CTA policy

- **Confirm:** comment keyword, link, trial/signup, or platform-specific end cards.
- **Why later:** CTA mechanics depend on campaign goals, platform rules, attribution, and product strategy.
- **Recommended:** platform-specific link/trial CTA; avoid a comment keyword unless the campaign explicitly needs it.
- **Trade-offs:** comment CTA may increase engagement but creates moderation/automation burden; link is direct but platform-limited; trial/signup is measurable but higher friction.
- **Canary:** configure one CTA per target platform, render the 4.5s end card, and verify text/action against current platform policy.
- **Pass/fail:** readable for 4.5s, no unsupported promise, correct destination/action, and marketing approval.
- **Unlocks:** CTA presets and campaign analytics mapping.

#### 10. Product access

- **Confirm:** test URL, safe credentials/account, approved flows, and actions Gideon must never execute.
- **Why later:** Codex cannot infer authorization to access accounts or perform potentially destructive/external actions.
- **Recommended:** isolated seeded test tenant with reversible data and an explicit deny-list for payments, invitations, deletion, publishing, and external messaging.
- **Trade-offs:** a synthetic tenant is safest but may omit edge cases; staging is realistic but may contain sensitive data; production access is highest risk and not recommended for initial capture.
- **Canary:** `pnpm capture:operator -- preflight <manifest>` followed by dry-run and one approved capture in the isolated environment.
- **Pass/fail:** environment validation succeeds, masking is active, only allow-listed flows run, no deny-listed action occurs, and evidence receipts are complete.
- **Unlocks:** genuine product assets and flow-specific creative plans.

#### 13. Human quality approval

- **Confirm:** lip-sync tolerance, acceptable realism, disclosure placement, brand acceptance, and accessibility/readability threshold.
- **Why later:** structural metrics cannot prove subjective trust, realism, comprehension, or brand suitability.
- **Recommended:** require named human approval for every new avatar/provider/version and sample releases thereafter.
- **Trade-offs:** strict thresholds reduce risk but slow release; looser thresholds improve throughput but expose brand/uncanny/accessibility failures.
- **Canary:** blinded review of the fixed benchmark plus two real product scripts across all presenter layouts and pace presets.
- **Pass/fail:** meet predeclared scores for lip sync, identity, deformation, flicker, pronunciation, emotion, readability, disclosure, and brand fit; any critical reviewer rejection fails.
- **Unlocks:** final publish gate and sampling policy.

### External access and compute

#### 3. Real GPU/model canary

- **Confirm:** approved NVIDIA environment, exact pinned weights, component licences, commercial-use approval, and runtime/quality budget.
- **Why later:** no approved remote GPU or model-weight download is available locally, and licence approval is external.
- **Recommended:** isolated NVIDIA worker with immutable image digest and pinned, checksummed weights.
- **Trade-offs:** larger/newer weights may improve quality but raise download, GPU, latency, and licence risk; local hosting improves privacy but increases operations.
- **Canary:** run `pnpm avatar:worker:check && pnpm avatar:worker:canary` on the approved worker, recording GPU/model/image digests and timing.
- **Pass/fail:** all licences approved, checksums match, one continuous performance completes within the agreed runtime, metadata gates pass, and human avatar QA passes.
- **Unlocks:** real local-model claims, capacity planning, and pinned deployment image.

#### 4. Managed-provider credentials

- **Confirm:** API key, plan/API access, retention/deletion, processing region, pricing, and rate limits.
- **Why later:** credentials and commercial/provider policy cannot be fabricated or accepted by Codex.
- **Recommended:** least-privilege project key in a secrets manager, zero/short retention where available, and a hard spend/rate cap.
- **Trade-offs:** higher plans may improve throughput/quality but increase cost; restricted retention/region may cost more or limit models; managed processing sends source/voice data to a third party.
- **Canary:** inject the secret only in the approved environment, run `pnpm provider:canary`, delete the test artifact through the provider API, and retain the receipt without the key.
- **Pass/fail:** authenticated generation and deletion succeed, region/retention match policy, measured unit cost is within cap, and rate-limit behavior is handled.
- **Unlocks:** managed adapter enablement and operational limits.

#### 5. Avatar source and consent

- **Confirm:** live consent capture, source-footage specification, expiry/revocation, and proof the subject is authorised.
- **Why later:** identity and voluntary authorization require the subject/owner; code can validate records but not truthfully create them.
- **Recommended:** signed/live consent tied to source hash, exact uses, expiry, revocation route, and no voice cloning unless separately granted.
- **Trade-offs:** stronger consent adds onboarding friction but reduces legal/abuse risk; indefinite consent is operationally easy but riskier.
- **Canary:** import the hashed source with consent, generate once, revoke consent, and verify subsequent generation is blocked while deletion workflow removes derived artifacts.
- **Pass/fail:** source and subject match, consent is current/specific/auditable, revocation blocks new work, and deletion completes.
- **Unlocks:** authorised likeness generation.

### Legal and commercial approval

#### 11. Provider/legal approval

- **Confirm:** code licence, model-weight licence, training-data obligations, avatar asset licence, generated-output rights, and required disclosure.
- **Why later:** legal interpretation and commercial risk acceptance require counsel/authorized owners.
- **Recommended:** written approval for the exact pinned component/model/provider versions before any commercial output.
- **Trade-offs:** permissive/local components improve control but may have weaker provenance; managed providers may offer clearer terms but impose usage/data restrictions and cost.
- **Canary:** create a bill of materials with versions/digests, attach licence texts/provider terms, and obtain a dated approval record; rerun on any version change.
- **Pass/fail:** every component/source/output right is approved for intended commercial use and disclosure obligations are implementable; ambiguity fails closed.
- **Unlocks:** commercial release and provider/model claims.

### Production infrastructure

#### 12. Production infrastructure

- **Confirm:** object storage, queue, database, GPU worker, observability, secrets, and deletion/retention policy.
- **Why later:** deployment changes infrastructure, incurs spending, and requires security/operations ownership.
- **Recommended:** private encrypted object storage, managed Postgres/queue, isolated GPU workers, centralized metrics/logs without media payloads, secrets manager, and explicit TTL/deletion jobs.
- **Trade-offs:** managed services reduce operational burden but cost more and add vendors; self-hosting increases control but requires on-call capacity; longer retention aids debugging but increases privacy exposure.
- **Canary:** run existing `staging:check`, `staging:smoke`, storage, database, queue, observability, provider, deletion, and production readiness checks in an authorized staging environment.
- **Pass/fail:** encryption/access/retention/deletion, retries/idempotency, metrics/alerts, secret isolation, capacity, backup/recovery, and end-to-end render all meet the approved SLO and policy.
- **Unlocks:** controlled staging rollout, then separately authorized production promotion.

## Explicit local follow-ups

These are engineering improvements Codex can implement later without redefining product policy:

1. Cache encoded scene segments by blueprint/asset/avatar/audio hash and splice only changed scenes, with boundary-frame and audio-continuity validation.
2. Add full-timeline perceptual-hash frozen-frame detection rather than representative frame sampling.
3. Add segmentation-aware face/product collision maps when a real avatar provider supplies masks/landmarks.
4. Add a UI panel that renders every `CreatorVideoQualityGateResult` and records final-export approval.
5. Add a first-class package script for the creator benchmark after the iCloud-placeholder repository metadata is fully hydrated.
