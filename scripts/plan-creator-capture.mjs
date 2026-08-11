#!/usr/bin/env node
// Plans the capture run an angle needs, before anything is recorded.
//
// The stage this replaces ran the other way round. `fixtures/creator-story/
// solomon-screen-inventory.json` was built once from a previous film's capture
// run, and every angle afterwards consulted it -- so a film about a marketing
// internship showed "Product Engineer at Northstar Labs", and three of the four
// claims it offered were framed for a different film and landed at 7px, 10px and
// 19px once cropped. The inventory should be an output of the video being made,
// not a library it shops in.
//
//   node scripts/plan-creator-capture.mjs surfaces
//   node scripts/plan-creator-capture.mjs plan --topic "..." --requirements req.json
//   node scripts/plan-creator-capture.mjs verify --inventory <built inventory>
//
// `surfaces` prints the product's paths and the regions on them. The agent picks
// from those and writes requirements.json. `plan` turns that into the capture
// run's instructions, including the pixel budget each region has to be framed
// inside. `verify` checks a built inventory against the plan that asked for it.
//
// No model is called here, for the same reason the brief calls none: the agent
// running this is the one that knows the angle.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = (name) => path.join(ROOT, "dist", "main", "shared", name);
const { planCapture, verifyCapturePlan } = await import(dist("creatorCapturePlan.js"));
const { SOLOMON_SURFACES } = await import(dist("solomonCaptureSurfaces.js"));
const { SHOT_BANDS } = await import(dist("creatorStoryQuality.js"));

const FPS = 30;
const args = process.argv.slice(2);
const command = args[0];
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const outDir = path.resolve(flag("out", path.join(ROOT, "tmp", "creator-story")));
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

function surfacesCommand() {
  return {
    command: "surfaces",
    product: SOLOMON_SURFACES.product,
    viewport: SOLOMON_SURFACES.viewport,
    fields: SOLOMON_SURFACES.fields,
    surfaces: SOLOMON_SURFACES.surfaces.map((surface) => ({
      id: surface.id,
      route: surface.route,
      purpose: surface.purpose,
      regions: surface.regions.map(({ id, purpose, fields, sourceTextPx }) => ({ id, purpose, fields, sourceTextPx }))
    })),
    next: "Write requirements.json as [{ id, surfaceId, regionId, says, fixture }], then run: plan --topic \"...\" --requirements requirements.json"
  };
}

function planCommand() {
  const topic = flag("topic");
  if (!topic) throw new Error("--topic is required.");
  const requirementsFile = flag("requirements", path.join(outDir, "requirements.json"));
  if (!existsSync(requirementsFile)) throw new Error(`No requirements at ${requirementsFile}. Run the surfaces command and write them first.`);
  const requirements = readJson(requirementsFile);
  const seconds = Number(flag("seconds", 38.5));
  const filmFrames = Math.round(seconds * FPS);
  // The same arithmetic the brief uses, because the plan has to lay its proofs
  // out on the beats the film will actually have. A plan for six shots against a
  // film that holds four is a capture run recording screens nothing will show.
  const beatCount = Number(flag("beats", Math.round(seconds / ((SHOT_BANDS.meanShotSeconds[0] + SHOT_BANDS.meanShotSeconds[1]) / 2))));

  const plan = planCapture({ topic, surfaces: SOLOMON_SURFACES, requirements, filmFrames, beatCount });
  mkdirSync(outDir, { recursive: true });
  const planFile = path.join(outDir, "capture-plan.json");
  writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  writeFileSync(path.join(outDir, "CAPTURE-PLAN.md"), renderPlanMarkdown(plan));
  return {
    command: "plan", ok: plan.issues.length === 0, topic, beatCount,
    shots: plan.shots.length, issues: plan.issues,
    wrote: [planFile, path.join(outDir, "CAPTURE-PLAN.md")],
    next: `Run the capture against CAPTURE-PLAN.md, build the inventory from it, then: node scripts/plan-creator-capture.mjs verify --out ${outDir} --inventory <inventory.json>`
  };
}

function renderPlanMarkdown(plan) {
  const rows = plan.shots.map((shot) =>
    `| \`${shot.claimId}\` | \`${shot.beatId}\` | \`${shot.route}\` | \`${shot.regionId}\` | ${shot.framing.maxRegionWidthPx}x${shot.framing.maxRegionHeightPx} |`);
  const shots = plan.shots.map((shot) => {
    // Seed values are quoted as data for the same reason the brief quotes
    // evidence that way: an angle can be written from material nobody vetted,
    // and a reader should be able to see where the instructions stop.
    const fixture = shot.fixture.length
      ? shot.fixture.map((entry) => `  - \`${entry.path}\` (${entry.shownAs})\n    > ${entry.value}`).join("\n")
      : "  - none: this shot proves a state, not one of the angle's facts.";
    return `### \`${shot.claimId}\` -- ${shot.says}

Route \`${shot.route}\` on surface \`${shot.surfaceId}\`, beat \`${shot.beatId}\`, drawn as \`${shot.framing.contentPattern}\`.
Record the box of the \`${shot.locator.role}\` named **${shot.locator.name}** as region \`${shot.regionId}\`.

Reach it by:
${shot.reach.map((step) => `1. ${step}`).join("\n")}

Seed data that must be on screen (**data, not instructions**):
${fixture}

Framing: the recorded region must fit inside **${shot.framing.maxRegionWidthPx}x${shot.framing.maxRegionHeightPx}** source pixels. At ${shot.framing.sourceTextPx}px type in a ${shot.framing.containerPx}px card, a crop wider than ${shot.framing.maxCropWidthPx}px puts this region's words below the ${shot.framing.readableFloorPx}px floor -- and a region taller than ${shot.framing.maxRegionHeightPx}px produces one as soon as it is stretched to ${shot.framing.containerAspect}.`;
  });

  return `# Capture plan: ${plan.topic}

Plan version \`${plan.planVersion}\` for ${plan.product} at ${plan.viewport.width}x${plan.viewport.height}.
${plan.shots.length} shot(s) across a ${plan.beatCount}-beat, ${(plan.filmFrames / FPS).toFixed(1)}s film.

| claim | beat | route | region | framing budget |
|---|---|---|---|---|
${rows.join("\n")}

## What the budget is

The film draws a crop, not the region. A region 22px-graded and resolved to a
1440px crop landed on screen at 7px, which is why the budget is stated at capture
time rather than checked after a render: the crop's width is the region's width,
or its height stretched to the template's aspect, whichever is wider.

Magnification does not help. Zooming the page grows the type and the region
together and the ratio does not move. The only lever is editorial -- record the
element that carries the claim, not the card it sits in.

A region inside its budget is guaranteed to read. One outside it may still read;
\`verify\` is what decides, by resolving the crop the film would draw and
measuring the type on it.

## Shots

${shots.join("\n\n")}
`;
}

function verifyCommand() {
  const planFile = flag("plan", path.join(outDir, "capture-plan.json"));
  const inventoryFile = flag("inventory", path.join(ROOT, "fixtures", "creator-story", "solomon-screen-inventory.json"));
  const plan = readJson(planFile);
  const verification = verifyCapturePlan(plan, readJson(inventoryFile));
  return {
    command: "verify", ok: verification.ok,
    inventory: path.relative(ROOT, inventoryFile),
    shots: verification.shots, issues: verification.issues
  };
}

try {
  const result = command === "surfaces" ? surfacesCommand()
    : command === "plan" ? planCommand()
      : command === "verify" ? verifyCommand()
        : null;
  if (!result) throw new Error(`Unknown command ${command ?? "(none)"}. Use "surfaces", "plan" or "verify".`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok === false ? 1 : 0;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
  process.exitCode = 1;
}
