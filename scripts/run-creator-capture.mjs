// Walks a capture plan and records the screens it asks for.
//
//   node scripts/run-creator-capture.mjs --out tmp/creator-story
//
// The executor for the stage that used to be a library lookup. It reads
// capture-plan.json, visits each shot's route, waits for the element that
// carries the claim, and records both the still and the element's own box.
//
// Three things it does that the V22 capture did not, each because of a defect
// that shipped:
//
//   It refuses to record a screen that does not show the angle's data. A film
//   about a marketing internship went out showing "Product Engineer at Northstar
//   Labs" because capture had no idea what the film was about. Every seed value
//   the plan names must be found on the page, or the shot fails.
//
//   It measures the region against the framing budget the plan computed, at the
//   moment of recording. A region graded 22px and resolved to a 1440px crop
//   landed on screen at 7px -- a render-time discovery of a capture-time
//   mistake. Now the tape measure is here.
//
//   It seeds nothing implicitly. Fixture values are asserted, not written: the
//   plan's `reach` steps say what state the product must be in, and getting it
//   there is an explicit, reviewable action rather than a side effect of
//   recording. A capture run that quietly mutates a database is not a capture
//   run, it is a migration.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const outDir = path.resolve(flag("out", path.join(root, "tmp", "creator-story")));
const stillsDir = path.join(outDir, "capture");
const baseUrl = process.env.SOLOMON_DEMO_URL ?? "http://127.0.0.1:5173";
const plan = JSON.parse(await fs.readFile(path.join(outDir, "capture-plan.json"), "utf8"));
const viewport = plan.viewport ?? { width: 1440, height: 900 };

const report = (value) => { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); };
const reachable = async (url) => {
  try { return (await fetch(url, { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; }
};
if (!(await reachable(baseUrl))) {
  report({ ok: false, error: `Solomon is not answering at ${baseUrl}. Start it (frontend on 5173) or set SOLOMON_DEMO_URL.` });
  process.exit(1);
}

await fs.mkdir(stillsDir, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromium.executablePath()
});

// A held frame, not a moment. The product animates on route change and a
// screenshot taken mid-transition records a card at 0.94 scale, which silently
// shrinks every measurement taken from it.
const hold = (page, ms) => page.waitForTimeout(ms);

const shots = [];
const issues = [];
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();

  for (const shot of plan.shots) {
    const still = path.join(stillsDir, `${shot.surfaceId}.png`);
    try {
      await page.goto(`${baseUrl}${shot.route}`, { waitUntil: "networkidle" });
      await hold(page, 900);

      // The element that carries the claim. Role first, because the plan is
      // written against what a viewer sees and a role plus a name survives a
      // restyle -- then plain text, because most product copy is not a role at
      // all. Requiring a role timed out on three of four shots whose text was
      // demonstrably on the page: the contact's name and title render as text in
      // a card, which is what the V22 capture matched too.
      const pattern = new RegExp(shot.locator.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      // A container region records the box around the text, not the text. The
      // contact card is a plain div with no role and no name, so role-and-name
      // addressing returns the 116x20 name line -- a region hemmed in by its
      // neighbours that no aspect could crop without cutting one.
      let target = shot.locator.container
        ? page.locator(shot.locator.container).filter({ hasText: pattern }).first()
        : page.getByRole(shot.locator.role, { name: pattern }).first();
      try {
        await target.waitFor({ state: "visible", timeout: 5000 });
      } catch {
        target = page.getByText(pattern).first();
        await target.waitFor({ state: "visible", timeout: 10000 });
      }
      await target.scrollIntoViewIfNeeded();
      await hold(page, 600);

      // Every value the angle asked for has to be on the page. This is the
      // check that makes the capture about this film rather than the last one.
      const body = (await page.locator("body").innerText()).toLowerCase();
      const missing = shot.fixture.filter(({ value }) => !body.includes(String(value).toLowerCase()));
      if (missing.length) {
        issues.push({ claimId: shot.claimId, reason: "fixture_not_on_screen", detail: missing.map(({ path: field, value }) => `${field}=${value}`).join(", ") });
        continue;
      }

      const box = await target.boundingBox();
      if (!box) { issues.push({ claimId: shot.claimId, reason: "region_has_no_box" }); continue; }
      await page.screenshot({ path: still, scale: "css" });

      // The budget is a promise about the crop the film will draw. Recording a
      // region wider than it does not fail the run -- `verify` resolves the real
      // crop and measures the type -- but it is reported here, where the fix is
      // still cheap: frame a tighter element, or record a surface that has one.
      const { maxRegionWidthPx, maxRegionHeightPx } = shot.framing;
      const overBudget = box.width > maxRegionWidthPx || box.height > maxRegionHeightPx;
      if (overBudget) {
        issues.push({
          claimId: shot.claimId, reason: "region_over_framing_budget",
          detail: `${Math.round(box.width)}x${Math.round(box.height)} exceeds ${maxRegionWidthPx}x${maxRegionHeightPx}`
        });
      }

      shots.push({
        claimId: shot.claimId, assetId: shot.surfaceId, regionId: shot.regionId, route: shot.route,
        still: path.relative(root, still),
        region: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
        framing: shot.framing, withinBudget: !overBudget,
        says: shot.says,
        fixture: shot.fixture
      });
    } catch (error) {
      issues.push({ claimId: shot.claimId, reason: "shot_failed", detail: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    }
  }
} finally {
  await browser.close();
}

const runFile = path.join(outDir, "capture-run.json");
await fs.writeFile(runFile, `${JSON.stringify({
  planVersion: plan.planVersion, topic: plan.topic, viewport, capturedAt: new Date().toISOString(), shots, issues
}, null, 2)}\n`);

report({
  command: "run", ok: issues.length === 0 && shots.length === plan.shots.length,
  captured: shots.length, planned: plan.shots.length, issues,
  wrote: [runFile, stillsDir],
  next: `node scripts/build-screen-inventory.mjs --from ${runFile} --out ${path.join(outDir, "inventory.json")}`
});
process.exitCode = issues.length ? 1 : 0;
