---
name: prove-the-gate
description: Write a check that actually catches the defect it exists for, by perturbing the source and confirming it fails. Use whenever adding a test, an assertion, a validation gate or an invariant — especially after fixing a bug — or when a test passes and you are not certain it could ever fail.
---

# Prove the gate

A test that cannot fail is worse than no test: it costs the same to run and it
tells you the opposite of the truth. After writing any check, **break the thing
it guards and confirm it goes red.**

```bash
cp src/thing.ts /tmp/thing.bak
# reintroduce the defect — one line, the smallest change that restores it
npx vitest run path/to/test.ts        # MUST fail, with a message about the defect
cp /tmp/thing.bak src/thing.ts
npx vitest run path/to/test.ts        # green again
```

If the perturbed run passes, the check is vacuous. That is a finding, not a
formality — it means the defect could return unnoticed.

## Why tests come out vacuous

Every one of these has happened, and each was found only by perturbing:

- **The fixture cannot reach the state.** An assertion about the hook being
  ambient passed with the guard removed, because in that fixture the beat after
  the hook carried no claim and the hook was ambient anyway. Moving it to a
  denser fixture made it bite.
- **The assertion is a tautology.** `expect(total).toBe(partA + partB)` where
  both sides are computed from the same source. It can only ever pass.
- **The comparison is too weak to see the defect.** Strict inequality cannot
  detect a word flush against a crop edge; the defect lives exactly at equality.
- **An early return skips the case.** A loop with `if (!resolved) continue` never
  reaches the assertion for the input that matters.
- **The test asserts against a copy.** A test file that redeclares the map it is
  checking will happily pass while the real map is missing entries.

## When the gate genuinely cannot be tested

Some guards are unreachable in any fixture you can build, or the state that
triggers them only exists in the real system. Do not ship a passing assertion
that pretends otherwise. Instead:

1. Remove the vacuous assertion.
2. Record the property in a comment where the code lives, with **the measurement
   from the real system** — "measured on the real film: one card was
   unestablished before the fix and none after".
3. Say so in the commit message under what was not verified.

A stated limitation is honest. A green test that proves nothing is not.

## Perturb the right thing

Perturb the **source**, not the test. Changing the expectation to make it fail
proves only that assertions work. The perturbation should be the defect in its
smallest form — delete the guard clause, restore the old default, swap the
argument order — and the failure message should name the defect:

> `AssertionError: the slip must not reach the claim: expected [ 'Qutiook', ... ]`

If the failure message would not tell a future reader what broke, improve the
assertion's message before moving on.

## Two representations of one fact

Most defects worth gating have this shape: the same fact exists in two places
with nothing comparing them, and they drift. Geometry and the image it was
measured on. What the product says and what OCR read. A count in three
producers. A stored reason and a recomputed one.

When you find one, the durable fix is usually to **delete one of the two
representations** rather than add a check that they agree. The gate is for the
cases where you cannot.
