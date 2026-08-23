---
name: ship-change
description: Take a finished change from working tree to merged main — branch, commit, PR, CI, merge, cleanup, re-verify. Use when asked to commit, push, open a PR, merge, "ship it", or clean up branches in Gideon or NexusReach. Covers the commit style, the CI traps, and what to verify after merging.
---

# Ship a change

The loop from a working change to a merged, verified `main`. Never skip the
verify-after-merge step: a branch that was green can still land on a `main` that
is not.

## Before committing

Run what the repo actually gates on, and read the output rather than the exit
code:

- **Gideon** — `npx vitest run`, `npm run lint`, `tsc --noEmit -p tsconfig.main.json`,
  `tsc --noEmit -p tsconfig.remotion.json`. Note `pnpm typecheck` does **not**
  currently pass (44 pre-existing errors under `tsconfig.renderer.json`), so run
  the projects you touched individually.
- **NexusReach** — `backend/.venv/bin/python -m pytest tests -q`. A pre-commit
  hook runs ruff.

Never commit generated video, customer media, secrets or env files. `renders/`
is gitignored in Gideon for this reason.

## Branch and commit

Branch off `main` — never commit to `main` directly.

```bash
git checkout -q -b <area>/<what-it-does>
git add <paths>            # name the paths; avoid `git add -A`
```

The commit message is the durable record. Write it so someone hitting the same
wall in six months finds the answer:

- **What changed and why**, in prose, not a bullet list of files.
- **The defect in its general form** — what two things disagreed, and what made
  the disagreement invisible.
- **What was verified**, with the numbers: test counts, measured values before
  and after, what you rendered and looked at.
- **What was NOT verified, and why.** A guard you could not write a failing test
  for. A fix you reverted. A limit you decided to live with. This is the most
  valuable part and the easiest to omit.

End with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Open the PR

```bash
git push -q -u origin <branch>
gh pr create --title "..." --body "$(cat <<'BODY'
...
🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

The PR body carries the same content as the commit message, formatted for
reading: what changed, what it fixes, what was verified, what is known and not
fixed.

## Wait for CI — and read failures before acting

**Gideon has no CI.** `statusCheckRollup` is empty; local verification is the
only gate.

**NexusReach has seven checks** and they take 1–5 minutes. Do not merge on
`mergeStateStatus: UNSTABLE` — poll until nothing is `IN_PROGRESS`:

```bash
for i in $(seq 1 45); do
  S=$(gh pr view <n> --json statusCheckRollup \
      --jq '[.statusCheckRollup[]?|select(.status=="IN_PROGRESS" or .status=="QUEUED")]|length')
  [ "$S" = "0" ] && break; sleep 20
done
gh pr view <n> --json mergeStateStatus,statusCheckRollup
```

**The `security` check can fail for reasons that are not vulnerabilities.**
`npm audit` calls a live endpoint, and a 503 from `registry.npmjs.org` fails the
job on a PR that changes no dependencies. Read the log before deciding:

```bash
gh run view <run-id> --log-failed | tail -40
```

If `pip-audit` says "No known vulnerabilities found" and `npm audit` returned a
transport error, **re-run the job** — do not merge red and do not override:

```bash
gh run rerun <run-id> --failed
```

If it is a real advisory, fix it. Never merge past a security check on the
assumption that it is flaky.

## Merge and clean up

```bash
gh pr merge <n> --merge
git checkout -q main && git pull -q
git branch -d <branch>                      # -d, not -D: it verifies the merge
git push -q origin --delete <branch>
```

Use `git branch -d`. It refuses if the commits are not reachable from `main`,
which is a free check that the merge really happened.

## Verify on merged main

Re-run the suite **on the merged result**, not on the branch:

```bash
git log --oneline -1
npx vitest run && npm run lint          # or the backend suite
git status --short && git branch -a
```

Report the merge sha, the test count on merged `main`, and confirm no branches
or open PRs are left behind. If `main` comes back red, say so immediately and
diagnose before doing anything else — including whether the failure predates the
merge (`git stash` + re-run, or check out the previous sha).

## Reporting

State what merged, what was verified with numbers, and what remains open. If a
concern was raised and the user chose to proceed anyway, note that the decision
was theirs and move on without relitigating it.
