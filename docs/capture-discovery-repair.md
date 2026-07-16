# Deterministic discovery and bounded repair

Status: locally implemented and verified with synthetic evidence and real Chromium replay. No live reasoning provider is enabled.

## Safety boundary

Gideon separates untrusted product evidence from trusted policy. A provider can propose a typed draft, but cannot approve a flow, expand its workspace/project/environment/persona, introduce a risk class outside the run policy, cite evidence outside the immutable bundle, or navigate to a route absent from bounded rendered/repository/test evidence. Provider output is runtime parsed, candidate IDs must be unique, and every proposal still requires deterministic dry-run verification.

Provider calls have a 250–30,000 ms timeout, a one-to-five-attempt budget, a bounded candidate count, and a cooling circuit breaker. Malformed, empty, duplicated, scope-expanding, risk-escalating, evidence-drifting, route-drifting, timed-out, or failed output terminates with a stable failure code. No provider fallback is implicit.

## Locator durability

Rendered controls can produce these ordered locator candidates:

1. associated label;
2. accessible link name plus normalized same-product destination;
3. accessible role plus exact name;
4. explicit test ID;
5. accessible target inside a named landmark;
6. placeholder;
7. visible text.

Every action locator is checked for visible match count before recording. Zero matches, multiple matches, and hidden-only matches produce `locator_not_found`, `locator_ambiguous`, or `locator_not_visible`. Gideon does not silently select the first ambiguous match.

## Repair classification

A repair request is permitted only for a current approved revision and explicitly failed steps. The capture runtime compares normalized path, DOM-structure hash, sanitized accessibility-control similarity, screenshot hashes, and a locally computed screenshot-similarity score. Screenshot pixels stay inside the capture runtime; only hashes and bounded numeric similarity leave it.

A changed path or DOM structure, accessibility similarity below `0.70`, or screenshot similarity below `0.65` is material. Material change skips the provider, creates an unchanged draft revision, and returns `material_change_review_required`. It cannot be recorded until a human reviews and approves that revision.

For harmless locator drift, a provider may propose exactly one locator or wait-assertion replacement per failed step. The replacement locator must uniquely match current sanitized control evidence. Repair cannot change the goal, intent, action type, domain, persona, fixture, risk class, final assertions, or business outcome. Even a successful repair creates a new draft revision and a versioned receipt with attempt, limits, safe fingerprints, decision, provider/model, proposal count, and blocker code.

## Replay evidence

`fixtures/capture-repair-golden-v1.json` is a synthetic, redacted provider replay corpus covering accessible-name drift, ambiguity, material DOM change, unsafe fields, duplicate proposals, prompt-injection control text, and provider timeout. It stores no screenshots, customer content, credentials, paths to private artifacts, or provider responses from production.

The standard `pnpm test:capture` suite runs the golden corpus, locator ranking, safe comparison, repair policy, hostile discovery providers, and real-Chromium locator ambiguity/stable-link/landmark cases.

## Remaining external gates

- Select a provider only after privacy, security, cost, and contract review.
- Run the golden discovery/repair evaluation against each proposed model and prompt version.
- Approve rollout thresholds for recall, invalid output, intent drift, latency, and estimated cost.
- Keep the feature disabled if canary evidence or runtime isolation is unavailable.
