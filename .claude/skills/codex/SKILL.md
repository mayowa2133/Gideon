---
name: codex
description: Ask OpenAI Codex a question about this codebase and verify the answer. Use when the user types /codex, asks for a second opinion, an independent review, or a question about where something lives or how a value flows through the stack. Covers how to prompt it, when it is worth the round trip, and how to check what it says.
---

# Ask Codex

A second frontier model with its own reading of the code. Useful for a narrow set
of questions and a waste of a round trip for the rest.

## Run it

```bash
codex exec -s read-only --skip-git-repo-check "<question>"
```

**`-s read-only`, always.** Codex defaults to `sandbox: danger-full-access,
approval: never`. Implementation stays here. Give it write access only when the
user asks for that explicitly, and say so in the reply.

**Background it** (`run_in_background: true`) and keep working. The saving is
parallelism. A codex call you sit and wait for is usually slower than answering
the question yourself.

Run it from the directory whose code the question is about -- it reads that
repo's `AGENTS.md` unprompted, which is most of its context.

## Ask it the right kind of question

The questions that pay off are precise, about code, and cheap to verify
afterwards:

- *"Which fields does this filter compare against? Quote the expression with
  file:line."*
- *"Trace this value from the frontend to the SQL. Does it hit the network at
  request time?"*
- *"Which element renders X? Give the JSX and its className."*

Ask for **file:line and a quoted expression**, so checking it is one `sed` away.

## What it cannot do

Anything that needs the running system: rendered pixel dimensions, a frame that
looks wrong, database contents, whether a caption argues with its picture. It
reads code. Measuring is still this agent's job.

## Reviews: name the failure modes, and forbid politeness

"Review this" produces agreement. A review is worth running when the prompt says
what to look for:

```
You are reviewing another engineer's work. Do not defer to it.
Look specifically for: <the five things you are actually worried about>.
Report only concrete problems with file:line and a one-line consequence.
If a section is fine, say so briefly. Do not manufacture criticism.
```

The last line matters as much as the rest: a review that invents problems costs
more to triage than one that finds none.

## Verify before acting

It is confidently wrong in the same ways any model is -- it once answered a
question about this repo's stack straight from a stale `AGENTS.md` without
opening `package.json`, and got all three parts wrong.

Treat findings as leads. Open the line it cites. Then report it as *"codex found
X, I verified it by Y"* rather than passing its output through as fact. If it
turns out to be wrong, say that too -- a second opinion that is never checked is
just a second guess.
