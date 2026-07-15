# Bounded capture coverage inventory

Gideon reports coverage only against a versioned, reviewable denominator. It does not infer that a discovered set is every possible product flow.

## Inventory contract

`capture-coverage-inventory-v1` tracks seven independent dimensions: persona, route, starting state, usage sequence, feature flag, outcome, and failure state. Each dimension records its evidence sources, the source revisions, covered identifiers, exclusions, and policy or environment blockers. Declared goals and current approved flow revisions remain first-class run dimensions outside this inventory.

A denominator is numeric only when its sources explicitly mark it trustworthy. Otherwise the API and UI return `denominator: "unknown"`; an empty or missing source is never converted to zero. Excluded and blocked identifiers remain visible beside the denominator so they cannot silently improve the percentage.

Bounded route evidence may be merged from:

- the versioned pilot manifest;
- structurally extracted repository routes;
- same-origin navigation rendered by the browser; and
- declarative Playwright or Cypress scenarios imported without executing arbitrary test code.

The compiler deduplicates identifiers across sources, rejects duplicates inside a source, validates every manifest mapping, and hashes the semantic inventory. The hash deliberately excludes creation time so equivalent evidence produces the same identity.

## Revision and freshness

Every `capture-coverage-v2` snapshot binds the inventory version, inventory revision/hash, environment version, policy hash, fixture revision, persona revision hash, and approved-flow revision hash. Read-time freshness comparison returns:

- `current` when every bound revision still matches;
- `stale` with stable reason codes when the inventory, environment, policy, fixture, persona, or approved flow changed; or
- `unknown` for legacy snapshots or when the current comparison basis is unavailable.

Percentages are displayed only for current, trustworthy denominators. Stale and unknown snapshots retain counts and provenance for audit, but the hosted UI suppresses a misleading percentage and names the freshness state.

## API and privacy projection

The hosted coverage response exposes the calculation version, inventory version/revision, freshness status/reasons, and each dimension's safe source kind/revision, opaque coverage IDs, exclusions, and stable blocker codes. It does not expose workspace IDs, semantic hashes, policy/persona/flow hashes, local paths, storage keys, signed URLs, selectors, page text, fixture values, or product content.

Full inventory and revision-basis records remain private server-side evidence. Baseline reports project only safe source/revision identifiers and aggregate counts.

## Product language

Use “bounded coverage” and explain the denominator source and revision. A valid statement is “6 of 22 routes in inventory revision 1 were verified.” Do not turn that into “27% of every possible product flow,” and do not describe all declared workflows as all possible workflows.
