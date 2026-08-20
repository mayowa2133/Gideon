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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const runFfmpeg = promisify(execFile);
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
const screens = new Map();
// One filmed sequence per surface; the interaction itself is repeated per shot.
const filmedSurfaces = new Set();
const pendingMotion = new Map();
// How long to let the product finish after the burst. Generating a draft is a
// round trip to a model and takes seconds; filtering a list is instant.
const motionSettleMs = (motion) => (motion.actions.some((action) => action.kind === "click") ? 16000 : 900);
const issues = [];

// A still cannot show what the screenshot does not contain. `main` runs to the
// bottom of the document -- 3487px on the dashboard against a 900px viewport --
// and an unclamped box would have the renderer draw two thirds empty card. Every
// recorded region is clamped, not just the page's: a region scrolled half out of
// frame was never capturable either.
const clampToViewport = (box) => {
  if (!box) return null;
  const x = Math.max(0, Math.round(box.x)), y = Math.max(0, Math.round(box.y));
  const width = Math.min(viewport.width - x, Math.round(box.width));
  const height = Math.min(viewport.height - y, Math.round(box.height));
  return width > 0 && height > 0 ? { x, y, width, height } : null;
};
// How much of the frame has to change between consecutive burst frames before
// the sequence is worth calling motion.
//
// Measured on Solomon rather than chosen: a settled route differs by 0.000
// between frames, page load only resolves a spinner into content, clicking a
// card moves 0.161, and typing into the contact filter moves 1.161 because the
// list narrows as the letters land. A floor of 0.5 separates the interaction
// that reads on screen from the ones that do not. Below it the run records no
// motion at all -- twelve identical frames would put `motion` in the blueprint
// and a frozen card on the screen, a lie the manifest tells and the picture
// does not.
const MOTION_FLOOR = 0.5;
const MOTION_FRAMES = 12, MOTION_INTERVAL_MS = 70, MOTION_STEP = 3, MOTION_HOLD = 4;

// Mean luma of the absolute difference between two frames.
async function frameDelta(first, second) {
  const { stdout } = await runFfmpeg("ffmpeg", ["-v", "error", "-i", first, "-i", second, "-filter_complex",
    "[0:v][1:v]blend=all_mode=difference,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
    "-frames:v", "1", "-f", "null", "-"]);
  const line = stdout.split("\n").find((entry) => entry.includes("YAVG"));
  return line ? Number(line.split("=").pop()) : 0;
}

// The same role-then-text addressing the claim regions use.
async function locate(page, locator) {
  const pattern = new RegExp(locator.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (locator.role === "combobox" || locator.role === "textbox") {
    const labelled = page.getByLabel(pattern).first();
    try { await labelled.waitFor({ state: "visible", timeout: 4000 }); return labelled; } catch { /* fall through */ }
  }
  let target = locator.container
    ? page.locator(locator.container).filter({ hasText: pattern }).first()
    : page.getByRole(locator.role, { name: pattern }).first();
  try { await target.waitFor({ state: "visible", timeout: 4000 }); return target; } catch { /* fall through */ }
  target = page.getByText(pattern).first();
  await target.waitFor({ state: "visible", timeout: 6000 });
  return target;
}

// Perform the surface's interaction and film the product's response.
//
// The burst runs alongside the action rather than after it. Typing resolves in
// well under a second, and a sequence recorded once the list has already
// narrowed is a photograph of the answer rather than a film of the product
// arriving at it.
async function filmMotion(page, motion, dir, assetId, record) {
  const stills = [];
  const shoot = async () => {
    if (!record) return;
    for (let index = 0; index < MOTION_FRAMES; index += 1) {
      const file = path.join(dir, `${assetId}-motion-${String(index).padStart(2, "0")}.png`);
      await page.screenshot({ path: file, scale: "css" });
      stills.push(path.relative(root, file));
      await hold(page, MOTION_INTERVAL_MS);
    }
  };
  const perform = async () => {
    for (const action of motion.actions) {
      // An unresolved placeholder means the plan could not fill it from this
      // angle's fixture, and it already said so. Typing it anyway puts the
      // literal "{contact.company}" into the product and films the empty state
      // that comes back -- which the difference gate happily passes, because
      // emptying a list is a very large change. A gate that measures whether
      // pixels moved cannot tell working from broken; this one can.
      const unresolved = `${action.locator.name} ${action.text ?? ""}`.match(/\{[^}]+\}/);
      if (unresolved) throw new Error(`unresolved placeholder ${unresolved[0]} in the filmed interaction`);
      const target = await locate(page, action.locator);
      await target.scrollIntoViewIfNeeded();
      if (action.kind === "click") { await target.click(); continue; }
      if (action.kind === "select") { await target.selectOption({ label: action.text }); continue; }
      for (const character of action.text ?? "") await target.type(character, { delay: 0 });
    }
  };
  await Promise.all([shoot(), perform()]);
  let moved = 0;
  for (let index = 1; index < stills.length; index += 1) {
    moved = Math.max(moved, await frameDelta(path.join(root, stills[index - 1]), path.join(root, stills[index])));
  }
  return {
    shows: motion.shows, stills, frames: stills.length,
    step: MOTION_STEP, hold: MOTION_HOLD,
    delta: Number(moved.toFixed(3)), moved: moved >= MOTION_FLOOR, floor: MOTION_FLOOR
  };
}

try {
  // Animations explicitly allowed. Playwright leaves the preference to the
  // platform, and a headless run that inherits "reduce" films a product whose
  // transitions never play -- which is indistinguishable from a product that has
  // none. V22's capture set this for the same reason.
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  const page = await context.newPage();

  // How many claims each surface carries, because that is what decides whether
  // a shot may scroll. One shot owns its still and may put its region wherever
  // it likes; two shots share one still and must therefore share one scroll.
  const shotsPerSurface = plan.shots.reduce((counts, { surfaceId }) => counts.set(surfaceId, (counts.get(surfaceId) ?? 0) + 1), new Map());

  for (const shot of plan.shots) {
    const still = path.join(stillsDir, `${shot.surfaceId}.png`);
    const sharesStill = (shotsPerSurface.get(shot.surfaceId) ?? 0) > 1;
    try {
      await page.goto(`${baseUrl}${shot.route}`, { waitUntil: "networkidle" });
      await hold(page, 900);

      // The interaction runs before anything is measured.
      //
      // A composer with nobody selected has no person card and no draft on it:
      // measuring first would record the empty form and then film the product
      // filling it, which is the wrong way round twice over. Performed on every
      // shot, because each shot re-navigates and the region only exists in the
      // state the interaction produces; filmed only the first time, because one
      // sequence per screen is all the renderer can play.
      //
      // It also puts the motion frames *before* the measured state rather than
      // after it, so the sequence resolves into the frame the crops were
      // measured on instead of drifting away from it.
      if (shot.motion) {
        try {
          const filmed = await filmMotion(page, shot.motion, stillsDir, shot.surfaceId, !filmedSurfaces.has(shot.surfaceId));
          filmedSurfaces.add(shot.surfaceId);
          if (filmed.stills.length && !filmed.moved) {
            issues.push({ claimId: shot.claimId, reason: "motion_did_not_move", detail: `${shot.surfaceId} changed by ${filmed.delta}, floor is ${filmed.floor}` });
          }
          if (filmed.stills.length && filmed.moved) pendingMotion.set(shot.surfaceId, filmed);
          await hold(page, motionSettleMs(shot.motion));
        } catch (error) {
          issues.push({ claimId: shot.claimId, reason: "motion_failed", detail: error instanceof Error ? error.message.split("\n")[0] : String(error) });
          continue;
        }
      }

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
      // Into view first so anything lazy renders, then back to the top.
      //
      // One surface can carry several claims, and every shot on it writes the
      // SAME still: `<asset>.png`. Each shot used to scroll to its own region
      // and photograph the page there, so the last shot's scroll decided the
      // image while the earlier shots' boxes were measured against a page that
      // had since moved. The `replies` box came back pointing at "36.5d ago"
      // and OCR read nothing where a region plainly was -- geometry and image
      // are one moment, and nothing was holding them to it.
      //
      // Invisible with one claim per surface, which is why raising claim count
      // is what surfaced it.
      await target.scrollIntoViewIfNeeded();
      if (sharesStill) await page.evaluate(() => window.scrollTo(0, 0));
      await hold(page, 600);

      // Every value the angle asked for has to be on the page. This is the
      // check that makes the capture about this film rather than the last one.
      const body = (await page.locator("body").innerText()).toLowerCase();
      const missing = shot.fixture.filter(({ value }) => !body.includes(String(value).toLowerCase()));
      if (missing.length) {
        issues.push({ claimId: shot.claimId, reason: "fixture_not_on_screen", detail: missing.map(({ path: field, value }) => `${field}=${value}`).join(", ") });
        continue;
      }

      const measured = await target.boundingBox();
      // Clamping silently is how a region half outside the frame became a region
      // the film measured as if it were whole. Say so instead.
      if (measured && (measured.y + measured.height > viewport.height || measured.x + measured.width > viewport.width)) {
        issues.push({
          claimId: shot.claimId, reason: "region_outside_viewport",
          detail: `${Math.round(measured.x)},${Math.round(measured.y)} ${Math.round(measured.width)}x${Math.round(measured.height)} in ${viewport.width}x${viewport.height}`
        });
        continue;
      }
      const box = clampToViewport(measured);
      if (!box) { issues.push({ claimId: shot.claimId, reason: "region_has_no_box" }); continue; }
      // The product's own words, taken from the DOM while it is open in front of
      // us.
      //
      // Everything downstream reads text off the OCR pass, which is a reading of
      // the pixels rather than the words themselves, and a claim's required
      // tokens were being chosen from that reading. Tesseract renders "Outlook"
      // as "Qutiook" and "Gmail" as "Gmall" on some runs and correctly on
      // others, so the claim required "Qutiook" -- and the next capture, reading
      // the SAME screen BETTER, dropped the claim for not containing it. The
      // same run lost "carried" from another region and dropped that claim too.
      // A pipeline where improving the input breaks the output is inverted.
      //
      // OCR keeps the two jobs it is the only witness for: whether the text is
      // legible in the rendered pixels, and where each word sits so a crop can
      // avoid cutting one. What the product SAYS is not one of them.
      const sourceText = (await target.innerText()).replace(/\s+/g, " ").trim();
      await page.screenshot({ path: still, scale: "css" });

      // The page itself, once per surface.
      //
      // Not a planned shot and never a claim: it is the establishing wide, and
      // it is recorded here rather than requested because every surface the film
      // visits should be showable as itself. Without it a generated film can
      // only draw what a claim points at, so a viewer sees six magnified card
      // fragments and never the application -- true in every frame, and useless
      // as marketing.
      if (!screens.has(shot.surfaceId)) {
        const main = page.locator("main").first();
        const content = clampToViewport(await main.boundingBox().catch(() => null));
        if (content) {
          const entry = { assetId: shot.surfaceId, still: path.relative(root, still), region: content };
          const filmed = pendingMotion.get(shot.surfaceId);
          if (filmed) entry.motion = filmed;
          screens.set(shot.surfaceId, entry);
        }
        else issues.push({ claimId: shot.claimId, reason: "surface_has_no_content_box", detail: shot.surfaceId });
      }

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
        sourceText,
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
  planVersion: plan.planVersion, topic: plan.topic, viewport, capturedAt: new Date().toISOString(),
  shots, screens: [...screens.values()], issues
}, null, 2)}\n`);

report({
  command: "run", ok: issues.length === 0 && shots.length === plan.shots.length,
  captured: shots.length, planned: plan.shots.length, issues,
  wrote: [runFile, stillsDir],
  next: `node scripts/build-screen-inventory.mjs --from ${runFile} --out ${path.join(outDir, "inventory.json")}`
});
process.exitCode = issues.length ? 1 : 0;
