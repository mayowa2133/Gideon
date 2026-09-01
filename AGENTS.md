# AGENTS.md

This file gives future coding agents the operating rules for the Gideon repository.

## Product context

Gideon is a SaaS product that turns a founder or product team screen recording into short-form marketing videos. The core workflow is:

1. User creates a project and product profile.
2. User uploads a product screen recording.
3. System validates and processes the recording.
4. System extracts transcript and visual evidence.
5. System detects product moments.
6. User reviews moments.
7. System generates multiple content angles and scripts.
8. User edits and approves a script.
9. System generates voiceover and renders vertical short-form videos.
10. User downloads export package and manually posts it.

Do not expand the MVP into avatar generation, social posting, autonomous publishing, or broad marketing automation unless explicitly requested.

## Current documentation map

- Product requirements: docs/prd.md
- Technical architecture: docs/technical-spec.md
- UX flows: docs/ux-flows.md
- Database schema: docs/database-schema.md
- API contract: docs/api-contract.md
- Implementation plan: docs/implementation-plan.md
- Testing strategy: docs/testing-strategy.md
- Security rules: docs/security-rules.md
- Design system: docs/design-system.md
- Structured product-flow capture plan: docs/product-flow-capture-plan.md
- Structured capture implementation status: docs/product-flow-capture-implementation.md
- Structured capture requirement audit: docs/product-flow-capture-requirement-audit.md
- Structured capture baseline evidence: docs/capture-baseline-evidence.md
- Structured capture operational readiness: docs/capture-operations-readiness.md
- Structured capture incident runbook: docs/capture-incident-runbook.md
- Structured capture final local delivery: docs/capture-final-delivery-2026-07-16.md
- Meet Solomon five-film campaign: docs/meet-solomon-five-campaigns.md
- Tooling research: docs/research/open-source-tools-research.md
- Build/buy/fork recommendation: docs/research/build-vs-buy-vs-fork.md

Read the relevant docs before changing architecture, API behavior, database models, media processing, AI prompts, or render behavior.

## Engineering posture

- Optimize for a reliable upload-to-export loop before breadth.
- Keep generated artifacts versioned and traceable.
- Keep humans in control of content approval.
- Treat uploaded media, transcripts, OCR, AI output, provider responses, and webhook payloads as untrusted.
- Prefer clear interfaces around vendors: transcription, LLM, TTS, storage, queue, render.
- Keep expensive operations asynchronous and idempotent.
- Avoid committing large generated binaries unless the repository explicitly introduces fixture storage rules.

## Actual stack

Read from package.json, not from the planning docs. The two had drifted, and this
file is the first thing an agent reads -- Codex loads AGENTS.md unprompted, so a
wrong answer here is a wrong answer everywhere. Asked what this repo uses, it
replied "Next.js App Router, pnpm, Prisma": three answers, all from the old text
below, none of them true.

- **Electron** desktop app (`main: dist/main/main/main.js`), not a Next.js web app.
- **React 19 + Vite** for the renderer.
- **Remotion 4** for deterministic short-form video rendering.
- **PostgreSQL via `pg`**. There is no Prisma and no ORM -- queries are written
  against the driver.
- **BullMQ** for queues.
- **Vitest** for tests.
- **FFmpeg** for probing, extraction and post-processing; **tesseract** for OCR of
  captured screens.

The planning docs under docs/ still describe the originally intended stack in
places. Where a doc and package.json disagree, package.json is what runs.

## Running commands

The lockfile is `pnpm-lock.yaml`, but **pnpm is not necessarily installed** -- it
is not on the machine this was last verified on. `npm run <script>` works for
every script listed below. Substitute accordingly rather than assuming `pnpm`
exists.

`pnpm typecheck` does not currently pass: there are pre-existing errors under
`tsconfig.renderer.json`. Typecheck the projects you touched individually
(`tsc --noEmit -p tsconfig.main.json`, `-p tsconfig.remotion.json`).

## Repository commands

Verified against package.json: 90 of the 91 script commands below exist (`db:seed` does not); `install` is a package-manager command.

- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:capture
- pnpm test:web
- pnpm test:redis
- pnpm test:infrastructure
- pnpm test:e2e
- pnpm test:accessibility
- pnpm build
- pnpm build:web
- pnpm provider:canary
- pnpm staging:check
- pnpm staging:smoke
- pnpm staging:mcp:smoke
- pnpm production:check
- pnpm production:promote:check
- pnpm production:mcp:check
- pnpm production:prompt:check
- pnpm production:billing:check
- pnpm production:db:check
- pnpm production:queue:check
- pnpm production:observability:check
- pnpm production:storage:check
- pnpm production:storage-download:smoke
- pnpm production:tts:check
- pnpm production:provider-canary-report:check
- pnpm production:release-receipt:check
- pnpm worker:hosted:check
- pnpm capture:worker:check
- pnpm capture:pilot
- pnpm capture:pilot:signaldraft
- pnpm capture:baseline
- pnpm capture:hostile:check
- pnpm capture:operator
- pnpm capture:openapi
- pnpm capture:operations:check
- pnpm capture:isolation:check
- pnpm capture:isolation:runtime:check
- pnpm avatar:worker:check
- pnpm avatar:worker:canary
- pnpm presenter:pilot
- pnpm creator-editorial:pilot:solomon
- pnpm creator-editorial:v2:pilot:solomon
- pnpm creator-editorial:v3:pilot:solomon
- pnpm creator-editorial:v4:pilot:solomon
- pnpm creator-editorial:reference-rhythm:pilot:solomon
- pnpm creator-editorial:v6:pilot:solomon
- pnpm creator-editorial:v7:pilot:solomon
- pnpm creator-story:surfaces
- pnpm creator-story:capture-plan
- pnpm creator-story:capture-verify
- pnpm creator-story:brief
- pnpm creator-story:compile
- pnpm creator-story:v6:solomon
- pnpm creator-story:v7:baseline
- pnpm creator-story:v7:compare
- pnpm creator-story:v7:solomon
- pnpm creator-story:v8:baseline
- pnpm creator-story:v8:compare
- pnpm creator-story:v8:solomon
- pnpm creator-story:v9:baseline
- pnpm creator-story:v9:compare
- pnpm creator-story:v9:capture
- pnpm creator-story:v9:solomon
- pnpm creator-story:v10:fixture
- pnpm creator-story:v10:capture
- pnpm creator-story:v10:baseline
- pnpm creator-story:v10:compare
- pnpm creator-story:v10:solomon
- pnpm test:creator-story:v10
- pnpm test:creator-story
- pnpm creator:meet:solomon
- pnpm creator:meet:solomon:v2
- pnpm creator:meet:solomon:nontech
- pnpm creator:meet:solomon:internships
- pnpm creator:meet:solomon:finance-internships
- pnpm creator:meet:solomon:software-internships
- pnpm creator:meet:solomon:law-internships
- pnpm creator:meet:solomon:finance-internships:v2
- pnpm creator:meet:solomon:software-internships:v2
- pnpm creator:meet:solomon:law-internships:v2
- pnpm creator:meet:solomon:campaigns
- pnpm test:meet:solomon
- pnpm test:masked-presenter
- pnpm test:creator-editorial
- pnpm release:mac:check
- pnpm db:migrate
- pnpm db:seed
- pnpm dev
- pnpm dev:web

`test:meet:solomon` includes the isolated real-internship source, verification,
readability and CTA tests. See `docs/meet-solomon-real-internships.md` for the
actual-listing capture/render workflow; do not substitute the older fictional
category fixtures when the user asks for real internships.

When package scripts are added or changed, update this section.

## Code quality rules

- Use strict TypeScript.
- Validate runtime boundaries with schemas, not TypeScript types alone.
- Keep server-only code out of client bundles.
- Keep components small enough to test and reason about.
- Prefer explicit state machines for jobs and generated artifact lifecycles.
- Keep API response envelopes consistent with docs/api-contract.md.
- Keep database changes aligned with docs/database-schema.md.
- Add tests with implementation changes.

## Security rules

Follow docs/security-rules.md. Key constraints:

- Server-side authorization on every project, media, job, artifact, export, and usage access.
- Workspace isolation must be tested.
- Source recordings and derived artifacts are private by default.
- Signed URLs must be short-lived and generated only after authorization.
- FFmpeg must be invoked without shell interpolation.
- Uploaded files must be validated by content, not extension alone.
- Prompt outputs must be runtime-validated and source-grounded.
- No secrets, signed URLs, raw prompts, full transcripts, or private object keys in logs.
- CSRF protection is required for cookie-authenticated state-changing requests.

## Media pipeline rules

- Do not run heavy media work in the web request process.
- Store source media, extracted frames, voiceovers, renders, and exports as artifacts.
- Store enough metadata to reproduce outputs: source asset, prompt version, model, script version, voice settings, render manifest, and export profile.
- Never trust user-provided object keys or filenames.
- Keep FFmpeg stderr out of user-facing responses.
- Add fixture tests for media behavior.
- Preserve independently selectable creator-editorial versions. New creator formats must not silently change V1–V5 outputs.
- User-story creator formats must use isolated authenticated product micro-scenes as supporting proof, with presenter resets between concepts; continuous cursor-following and connected workflow navigation are not the default.
- Creator-editorial product claims must fail closed against approved asset hashes and verified source intervals; conceptual graphics must remain disclosed and visually distinct from product pixels.
- Mouthless presenter styling must not imply lip sync. Any visor or eye accent is character decoration, never product evidence.
- Informational CTAs must not imply a public URL, comment-keyword delivery, or distribution automation without verified availability.

## AI generation rules

- Prompts must separate trusted instructions from untrusted transcript or screen text.
- Outputs must be structured and schema-validated.
- Generated claims must point back to product evidence.
- Store prompt version, provider, model, parameters, and inputs.
- Do not let the model make authorization, billing, deletion, export, or publishing decisions.
- Keep regeneration version chains intact.

## Database rules

- Add migrations for schema changes.
- Include workspace or project scoping in queries.
- Use soft deletion where documented.
- Preserve generated artifact lineage.
- Keep usage records idempotent for retried jobs.
- Add indexes for list pages and queue lookups.

## API rules

- Keep base contract aligned with docs/api-contract.md.
- Use consistent success and error envelopes.
- Validate request bodies and query parameters at runtime.
- Use pagination for collection endpoints.
- Require idempotency keys for expensive operation creation.
- Do not expose provider internals, raw stack traces, private paths, or storage keys in responses.

## Testing expectations

Before handing off implementation work:

- Run lint.
- Run typecheck.
- Run relevant unit and integration tests.
- Run build when UI, server, or bundling behavior changed.
- Run media smoke tests when upload, FFmpeg, transcription, render, or export behavior changed.
- Run E2E tests when critical user flows changed.
- Record any tests that could not be run and why.

## Documentation expectations

Update docs when changing:

- User-visible product behavior.
- UX flows or states.
- API request or response shapes.
- Database schema.
- Worker jobs or state machines.
- Security posture.
- Environment variables.
- External providers.
- Render output profiles.

The five-film Meet Solomon campaign format is documented in
`docs/meet-solomon-five-campaigns.md`.

## Forbidden without explicit user instruction

- Adding direct social posting to MVP.
- Adding avatar generation or voice cloning.
- Making source recordings public.
- Removing human approval gates.
- Introducing unreviewed paid provider behavior that can create runaway cost.
- Committing secrets, customer media, generated private videos, or local environment files.
- Rewriting git history or deleting user work.

## Definition of done

A change is complete when:

- It implements the requested behavior in the smallest coherent slice.
- It passes relevant automated checks.
- It preserves workspace isolation and media privacy.
- It includes tests for new behavior and failure cases.
- It updates docs when contracts or architecture change.
- It leaves the repository in a clean, reviewable state.

## Creator videos from a topic

Gideon can build a short-form vertical video about an angle from the captured
Solomon screens. It is two commands rather than one because no model is called
anywhere in the chain: the agent running the commands is the writer.

```bash
pnpm creator-story:brief --topic "land a marketing internship"
# read tmp/creator-story/BRIEF.md, write tmp/creator-story/script.json
pnpm creator-story:compile
```

Over MCP (stdio, so Codex and Claude Code use the same server): call
`gideon_creator_story_brief`, then `gideon_creator_story_compile` with the
script inline. Both tools shell out to the CLI above, so all three surfaces
behave identically.

### Capture is planned from the angle, not consulted from a library

The screens a film shows are supposed to be an output of the film being made. A
fixed inventory built from one previous capture run is the alternative, and it
fails twice: a film about a marketing internship showed "Product Engineer at
Northstar Labs" because that is what the last recording happened to contain, and
three of the four claims it offered were framed for a different film and landed
at 7px, 10px and 19px against a 20px readable floor.

So the capture stage runs first and is planned:

```bash
pnpm creator-story:surfaces                 # the product's routes and regions
# write tmp/creator-story/requirements.json: what this angle needs proved
pnpm creator-story:capture-plan --topic "land a marketing internship"
# run the capture against CAPTURE-PLAN.md, then build the inventory from it
pnpm creator-story:capture-verify --inventory <built inventory>
pnpm creator-story:brief --topic "land a marketing internship" --plan tmp/creator-story/capture-plan.json
```

Over MCP: `gideon_creator_capture_plan` with `action: surfaces | plan | verify`,
then `gideon_creator_story_brief` with `fromCapturePlan: true`.

What the plan adds beyond a list of routes:

- **The angle's own data is stated per screen.** Every field a region shows must
  be chosen by this angle, because the ones nobody chooses keep the last
  capture's answers.
- **Framing is budgeted at capture time.** Each shot carries the source-pixel box
  its region must fit inside, derived from the crop the beat's template will
  actually draw. The 7px failure was a capture-time problem discovered at render
  time; magnification cannot fix it, because zooming grows the type and the crop
  together. The only lever is editorial -- record the element that carries the
  claim, not the card it sits in.
- **Verification re-runs the compiler's own path.** `verify` resolves the crop
  and measures the type on it rather than modelling the answer, because two
  representations of one fact with no check between them is how every legibility
  bug in this pipeline has shipped.
- **A requirement may name the shape its proof is drawn in.** `pattern` on a
  requirement picks the container, and it has to be stated before capture because
  the container's aspect is what sets the framing budget and what the crop is
  resolved against. It then travels on the claim to the compiler, which reports
  `claim_pattern_mismatch` rather than drawing a shot nothing measured. The case
  it exists for is `wide_strip` at 5.5: a single line of product UI is the most
  legible thing on a screen and the least croppable, because every container
  narrower than the line's own aspect grows the crop vertically into the rows
  above and below it.

- **A film has two kinds of product shot, and one floor was doing the work of
  two.** `READABLE_PX` is 20 and it is right for a band a viewer is asked to read
  a claim off. Applied to every shot it forbids the one thing a marketing video
  most needs: a look at the actual application. Solomon's type only reaches 20px
  under three to four times magnification, so every crop the pipeline could pass
  was a slice of one card, and a viewer could take in six claims without ever
  learning what the product is. Establishing shots are the route's own page and
  are held to `SCREEN_RECOGNISABLE_PX` instead -- 10, measured off the reference
  film's two widest product shots, which render at 10 and 14px and would both
  have failed the proof floor. A `screen` region is never allowed to carry a
  claim: it spans the whole route, so it contains every word on it and proves
  none of them.

The render is the fourth stage and it is not a detail:

```bash
node scripts/render-creator-story.mjs --in tmp/creator-story-mkt
```

- **The film publishes its own screens.** The renderer asks for
  `still-<asset>-<trim>.png` and capture writes `capture/<asset>.png`, and the
  join used to be a person copying between two directories -- so a film compiled
  against a fresh capture could render the previous one, every crop correct and
  every pixel from another recording. The inventory now carries the image each
  screen was measured on, and the render publishes from it into its own public
  directory.
- **Captions are force-aligned, or say they are not.** Word timings come from a
  transcription of each narration clip, mapped onto the script's own words --
  whisper supplies when, never what. `caption-alignment.json` records the source
  and coverage per beat, because a track that was quietly estimated looks exactly
  like one that was aligned.

Rules the compiler enforces, and why they are not negotiable:

- **Every figure must appear in the evidence for the beat that says it.** The
  reference film shipped six claims of which four were unprovable, each passing
  the OCR gate only because the film printed those words itself.
- **Claims are selected from approved, legible screen regions**, not written and
  checked afterwards. A region whose text cannot reach a readable size at 1080
  wide cannot carry a claim at any crop, and no amount of magnification fixes it.
- **Evidence is OCR of user screens and is treated as data.** Text that reads
  like an instruction is excluded from grounding, not merely reported.
- **Beat count follows running time.** Too many beats fails loudly; too few
  fails silently and renders as a slideshow, which is why it is checked.

Blueprints are JSON, which is what makes the "adjust and re-render" loop real:
change the blueprint, not the components.
