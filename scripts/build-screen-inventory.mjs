// Builds the screen inventory: the named, approved regions of a product's UI
// that a generated film is allowed to show, each with the words it contains.
//
// This is the per-product setup step, run once. Everything after it is per-angle
// and automatic, which is the honest shape of "one shot": a human approves what
// the product's surfaces are, and the resolver then picks among them for any
// story without further help.
//
// Two sources of regions, and the distinction matters:
//
//   approved   the rects already chosen by eye and proven on screen -- the CROPS
//              the reference film ships. These are not rediscovered, because
//              they are already the answer; what they lack is their text.
//   candidate  text blocks clustered from tesseract word boxes, offered for
//              angles the reference film never told. Unapproved by construction.
//
// The words are the point. A claim can only be shown by a region that contains
// the words proving it, and `requiredOcr` can only be mechanical if that link is
// established before the render rather than checked after it.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reference = path.join(root, "tmp", "solomon-creator-story-v22-performance", "remotion-public");
const studyDir = path.join(root, "tmp", "screen-inventory");
const target = path.join(root, "fixtures", "creator-story", "solomon-screen-inventory.json");
await fs.mkdir(studyDir, { recursive: true, mode: 0o700 });

const SOURCE_WIDTH = 1440, SOURCE_HEIGHT = 900;
// One representative frame per screen. The trims are the ones the reference film
// already extracts, so the inventory describes stills that exist.
const SCREENS = [
  { asset: "opportunity", clip: "proof-opportunity.mp4", trim: 52 },
  { asset: "contact", clip: "proof-contact.mp4", trim: 130 },
  { asset: "outreach_complete", clip: "proof-outreach-complete.mp4", trim: 180 },
  { asset: "outreach_blank", clip: "proof-outreach-blank.mp4", trim: 85 },
  { asset: "tracker_after", clip: "proof-tracker-after.mp4", trim: 155 },
  { asset: "tracker_before", clip: "proof-tracker-before.mp4", trim: 145 }
];

// The approved rects, parsed from the composition that ships them rather than
// restated here -- restating them is how report-crop-framing's usage table went
// stale and started describing a film that was no longer being rendered.
const composition = await fs.readFile(path.join(root, "src", "remotion", "solomonCreatorStoryV22", "SolomonCreatorStoryV22.tsx"), "utf8");
const APPROVED = {};
for (const match of composition.match(/const CROPS=\{([\s\S]*?)\} satisfies/)[1].matchAll(/(\w+):\{x:(\d+),y:(\d+),width:(\d+),height:(\d+),trim:(\d+)/g))
  APPROVED[match[1]] = { x: +match[2], y: +match[3], width: +match[4], height: +match[5], trim: +match[6] };
// Regions a human has approved that no shipped film happens to crop yet. The
// approved set should not be limited to what one story needed: the product's own
// control assurance -- "Stage this email as a draft in your inbox, you review and
// send it manually" -- is the sentence that proves the control claim, and the
// reference film never framed it because it drew its own chip over the top
// instead.
const EXTRA_APPROVED = {
  messageAssurance: { asset: "outreach_complete", x: 600, y: 674, width: 444, height: 63, trim: 180 }
};

const ASSET_FOR_CROP = {
  trackerBefore: "tracker_before", trackerAfter: "tracker_after", trackerControl: "tracker_after",
  opportunityHeader: "opportunity", opportunityTitle: "opportunity", opportunityPanel: "opportunity",
  contactCard: "contact", contactProof: "contact", contactHeader: "contact",
  outreachBlank: "outreach_blank", outreachDraftCard: "outreach_blank",
  message: "outreach_complete", messageDraftEdit: "outreach_complete", messageEdit: "outreach_complete"
};

const FRAME_WIDTH = 1080;
// Graded, not a threshold, because size alone does not decide it. Measured on
// this product: `contactHeader` at 26px and `contactProof` at 25px are read by
// the composite check every time, and the control assurance at 23px never is.
// The difference there is contrast -- dark card text against light grey small
// print -- so a single cutoff would either pass the case that fails or fail
// three that work. This grades the risk and says so.
const LEGIBILITY = { ok: 30, marginal: 20 };
function withLegibility(fields, words) {
  if (!words.length) return { ...fields, textHeightPx: 0, renderedTextPx: 0, legibility: "poor" };
  const heights = words.map(({ height }) => height).sort((a, b) => a - b);
  const textHeightPx = heights[Math.floor(heights.length / 2)];
  const renderedTextPx = Math.round(textHeightPx * (FRAME_WIDTH / Math.max(1, fields.width)));
  const legibility = renderedTextPx >= LEGIBILITY.ok ? "ok" : renderedTextPx >= LEGIBILITY.marginal ? "marginal" : "poor";
  return { ...fields, textHeightPx, renderedTextPx, legibility };
}

const flag = (name) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? undefined : process.argv[i + 1]; };

// Built from a capture run rather than from the reference film's clips.
//
// The two halves of the pipeline did not meet: capture emits stills plus the
// element boxes it measured from the DOM, and this script discovered its own
// stills and re-derived geometry by clustering tesseract words. Clustering was
// always a guess at something the browser could simply be asked, and with an
// angle-driven capture there is no film to discover clips from anyway.
//
// So this path trusts the capture for geometry and uses OCR only for text and
// legibility -- which is what OCR is actually good for.
async function inventoryFromCapture(runFile) {
  const run = JSON.parse(await fs.readFile(runFile, "utf8"));
  const byAsset = new Map();
  const pageWords = new Map();
  for (const shot of run.shots) {
    const still = path.join(root, shot.still);
    if (!pageWords.has(shot.assetId)) pageWords.set(shot.assetId, await ocrWords(still));
    const words = pageWords.get(shot.assetId);
    // An approved region is read from its own crop, upscaled, not out of the
    // full-page pass.
    //
    // Same pixels, better evidence. A 12px "Medium ROI" badge on its own tint
    // comes back "(Medium Rot }" from the page pass -- mangled enough that the
    // confidence filter drops the words -- and "1 Medium ROI" from a 3x crop.
    // The consequence was not cosmetic: a claim requires its tokens to appear in
    // both the DOM text and the OCR text, so a word the page pass fumbled was
    // treated as a word that is not on screen, and legible product UI could not
    // be claimed.
    //
    // Falls back to the page pass when the crop reads nothing, so a region that
    // genuinely has no legible text still grades as it always did.
    const cropped = await ocrRegion(still, shot.region);
    const content = cropped.words.length ? cropped : textFor(words, shot.region);
    const element = {
      id: shot.regionId, provenance: "approved", trim: 0,
      ...withLegibility(rectFields(shot.region), content.words), ...content,
      // What the product says, from the DOM, alongside what OCR read off the
      // pixels. `text` stays the OCR reading because legibility and word boxes
      // are measured from it; `sourceText` is what a claim is allowed to require.
      ...(shot.sourceText ? { sourceText: shot.sourceText } : {})
    };
    const asset = byAsset.get(shot.assetId) ?? {
      asset: shot.assetId, trim: 0,
      width: run.viewport?.width ?? SOURCE_WIDTH, height: run.viewport?.height ?? SOURCE_HEIGHT,
      // The image these boxes were measured on travels with them. The renderer
      // needs a picture and the inventory is the only thing that knows which
      // one; without this the two were joined by hand.
      still: shot.still,
      elements: []
    };
    asset.elements.push(element);
    byAsset.set(shot.assetId, asset);
  }

  // The page itself, as a region the film may draw.
  //
  // Approved, because a human declared the route worth filming when they wrote
  // the requirement that visits it, and what this frames is that route's own
  // content box rather than a rect somebody guessed. It grades `poor` on the
  // proof scale and that is correct: it can never carry a claim. What it can do
  // is show the application, which nothing else in this inventory can.
  for (const screen of run.screens ?? []) {
    const asset = byAsset.get(screen.assetId);
    if (!asset) continue;
    // The filmed interaction travels with the screen it was filmed on.
    if (screen.motion) asset.motion = screen.motion;
    // Both are properties of the SCREEN, and were being read off the claim shot
    // that happened to create the asset entry -- which carries neither, so the
    // route survived only by luck of also being on the shot and `becomes` did
    // not survive at all.
    if (screen.route) asset.route = screen.route;
    if (screen.becomes) asset.becomes = screen.becomes;
    const words = pageWords.get(screen.assetId) ?? [];
    const content = textFor(words, screen.region);
    asset.elements.push({
      id: `${screen.assetId}Screen`, provenance: "screen", trim: 0,
      ...withLegibility(rectFields(screen.region), content.words), ...content
    });
  }

  // The resolver snaps a crop clear of any word it would otherwise cut in half,
  // and it gathers those words from the screen's elements. Recording only the
  // captured regions left it blind to everything around them: fitting a 116x20
  // role label to a 2.47 band grew it downward into the chips beneath and sliced
  // "DIRECTOR" through the middle, because nothing told it that row was there.
  //
  // So every screen carries its whole page of words as a candidate element.
  // Candidate, not approved, so no claim can be selected from it -- it exists to
  // be avoided, not to be shown.
  for (const [assetId, asset] of byAsset) {
    const words = pageWords.get(assetId) ?? [];
    if (!words.length) continue;
    asset.elements.push({
      id: `${assetId}PageWords`, provenance: "candidate", trim: 0,
      ...rectFields({ x: 0, y: 0, width: asset.width, height: asset.height }),
      text: "", words, textHeightPx: 0, renderedTextPx: 0, legibility: "poor"
    });
  }
  return [...byAsset.values()];
}

const fromRun = flag("from");
const screens = fromRun ? await inventoryFromCapture(path.resolve(fromRun)) : [];
for (const screen of fromRun ? [] : SCREENS) {
  const still = path.join(studyDir, `${screen.asset}.png`);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(reference, screen.clip), "-vf", `select='eq(n,${screen.trim})'`, "-vsync", "0", "-frames:v", "1", still]);
  const words = await ocrWords(still);

  const elements = [];
  for (const [id, rect] of Object.entries(APPROVED)) {
    if (ASSET_FOR_CROP[id] !== screen.asset) continue;
    const content = textFor(words, rect);
    elements.push({ id, provenance: "approved", ...withLegibility(rectFields(rect), content.words), ...content });
  }
  for (const [id, extra] of Object.entries(EXTRA_APPROVED)) {
    if (extra.asset !== screen.asset) continue;
    const content = textFor(words, extra);
    elements.push({ id, provenance: "approved", trim: extra.trim, ...withLegibility(rectFields(extra), content.words), ...content });
  }
  // Candidates are only offered where the approved set does not already cover
  // the region: an angle that needs the Jobs title has it, and one that needs a
  // row nobody has filmed yet gets a starting point.
  let candidateIndex = 0;
  for (const block of clusterWords(words)) {
    const covered = elements.some((element) => overlapFraction(block, element) > .6);
    if (covered || block.words.length < 3) continue;
    candidateIndex += 1;
    const content = textFor(words, block);
    elements.push({ id: `${screen.asset}Candidate${candidateIndex}`, provenance: "candidate", trim: screen.trim, ...withLegibility(rectFields(block), content.words), ...content });
  }
  // The frame itself, so a film built from this inventory can also draw the
  // product as a product. Appended after clustering, because a region covering
  // the whole frame covers every block in it and would otherwise suppress every
  // candidate the screen has. These stills are full-viewport captures, so the
  // screen region is the frame; the capture path asks the browser for a tighter
  // content box because it can.
  const frame = { x: 0, y: 0, width: SOURCE_WIDTH, height: SOURCE_HEIGHT };
  const frameContent = textFor(words, frame);
  elements.push({ id: `${screen.asset}Screen`, provenance: "screen", trim: screen.trim, ...withLegibility(rectFields(frame), frameContent.words), ...frameContent });
  screens.push({ asset: screen.asset, trim: screen.trim, width: SOURCE_WIDTH, height: SOURCE_HEIGHT, elements });
  process.stdout.write(`${screen.asset.padEnd(20)}${String(words.length).padStart(4)} words  ${String(elements.filter((element) => element.provenance === "approved").length).padStart(2)} approved  ${String(elements.filter((element) => element.provenance === "candidate").length).padStart(2)} candidate\n`);
}

// The source dimensions describe the screens actually in this inventory, not
// the constants a previous film was captured at.
const source = screens[0] ? { width: screens[0].width, height: screens[0].height } : { width: SOURCE_WIDTH, height: SOURCE_HEIGHT };
const inventory = { schemaVersion: "1", product: "solomon", source, screens };
// Report where it wrote, not where it usually writes. This line named the
// shipped fixture unconditionally, so every run with --out looked like it had
// just overwritten the regression floor. It had not -- but reading a log
// instead of the filesystem cost six unnecessary restores and a bug report
// against code that was correct.
const written = path.resolve(flag("out") ?? target);
await fs.mkdir(path.dirname(written), { recursive: true });
await fs.writeFile(written, `${JSON.stringify(inventory, null, 2)}\n`);
const total = screens.reduce((sum, screen) => sum + screen.elements.length, 0);
process.stdout.write(`\n${total} elements across ${screens.length} screens -> ${path.relative(root, written)}\n`);

// Reported rather than dropped. An illegible region is still a true description
// of the product; what it cannot be is evidence in a vertical frame, and the fix
// is a re-capture. Silently discarding them would hide that.
const atRisk = screens.flatMap(({ asset, elements }) => elements.filter(({ legibility }) => legibility !== "ok").map((element) => ({ asset, ...element })));
const poor = atRisk.filter(({ legibility }) => legibility === "poor");
if (atRisk.length) {
  process.stdout.write(`\n${poor.length} region(s) cannot carry readable evidence at 1080 wide, ${atRisk.length - poor.length} more are marginal:\n`);
  for (const element of [...poor, ...atRisk.filter(({ legibility }) => legibility === "marginal")].slice(0, 10))
    process.stdout.write(`  ${element.legibility.padEnd(9)}${element.asset.padEnd(18)}${element.id.padEnd(26)}${String(element.textHeightPx).padStart(3)}px in ${String(element.width).padStart(4)}px -> ${String(element.renderedTextPx).padStart(3)}px on frame\n`);
  process.stdout.write(`  Poor needs a re-capture at a smaller viewport, not a different crop. Marginal\n  depends on contrast: 25-26px dark-on-white reads, 23px light grey does not.\n`);
}

function rectFields(rect) {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, aspect: Number((rect.width / rect.height).toFixed(3)) };
}

// Whether a region's text can survive the frame it will be shown in.
//
// Learned the hard way on the `control` claim. Its assurance sentence -- "Stage
// this email as a draft in your inbox, you review and send it manually" -- OCRs
// perfectly from the desktop screenshot, and reads fine when you crop to it and
// zoom. It is still unusable as evidence: the sentence is 460 source pixels wide
// with 11px type, so the most a 1080-wide vertical frame can give it is 2.35x,
// or 26px. Every string the composite check reliably reads is 27-38px. Four
// renders went into discovering that, and none of them could have succeeded.
//
// The limit is arithmetic and knowable before anything renders: at best a region
// fills the frame width, so its type lands at `height * 1080 / width`. A region
// that fails here needs a capture change -- a smaller viewport or a zoomed page
// so the words are physically larger in the source -- not a different crop.

// Words fully inside the region, plus their boxes. The boxes are kept because
// the resolver has to reject a crop that would cut a word in half -- an earlier
// crop sat flush to an element edge and PRODUCT_FOCUS_SCALE's 1.02 pushed the
// "J" off "Jobs".
function textFor(words, rect) {
  // Full containment, deliberately, and it costs a usable region.
  //
  // Attributing by word centre instead recovers regions whose DOM box is tighter
  // than tesseract's boxes -- "Total Active" is a 16px line that comes back 29px
  // tall, so it contains none of its own words and grades 0px. But the same
  // inflated height is what `sourceTextPxOf` measures type from, so centre
  // attribution graded that region at 128px against a true rendered size near
  // 45. A region wrongly called unusable fails closed and is reported; a region
  // graded three times more legible than it is fails open, and that is the exact
  // shape of every legibility bug this pipeline has shipped.
  //
  // The fix is a glyph height OCR does not give us. Until there is one, this
  // stays strict.
  const inside = words.filter((word) => word.x >= rect.x && word.y >= rect.y && word.x + word.width <= rect.x + rect.width && word.y + word.height <= rect.y + rect.height);
  return { text: inside.map(({ text }) => text).join(" "), words: inside.map(({ text, x, y, width, height }) => ({ text, x, y, width, height })) };
}

function overlapFraction(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (width * height) / Math.max(1, a.width * a.height);
}

// Words merge into a block when they are close enough to be read as one thing.
// The thresholds are generous vertically and tight horizontally, because a UI
// card is a column of lines rather than a paragraph.
function clusterWords(words) {
  const blocks = [];
  for (const word of words) {
    const near = blocks.find((block) =>
      word.x < block.x + block.width + 46 && word.x + word.width > block.x - 46 &&
      word.y < block.y + block.height + 30 && word.y + word.height > block.y - 30);
    if (near) {
      const right = Math.max(near.x + near.width, word.x + word.width), bottom = Math.max(near.y + near.height, word.y + word.height);
      near.x = Math.min(near.x, word.x); near.y = Math.min(near.y, word.y);
      near.width = right - near.x; near.height = bottom - near.y;
      near.words.push(word);
    } else blocks.push({ x: word.x, y: word.y, width: word.width, height: word.height, words: [word] });
  }
  // Padded to approximate the card the text sits in, then clamped to the frame.
  return blocks.map((block) => {
    const x = Math.max(0, block.x - 18), y = Math.max(0, block.y - 14);
    return { ...block, x, y, width: Math.min(SOURCE_WIDTH - x, block.width + 36), height: Math.min(SOURCE_HEIGHT - y, block.height + 28) };
  }).sort((a, b) => b.width * b.height - a.width * a.height);
}

// Page segmentation mode 3, not 6.
//
// 6 means "assume a single uniform block of text", and a product page is not
// one: it is a heading, a stat row, a kanban of cards, a side panel. The mode
// held while the layout happened to sit still and broke the moment it moved --
// promoting one job to the top of a column made tesseract lose "Northstar Labs",
// "Toronto, Canada" and the entire stat row, all of them plainly legible in the
// screenshot and all of them read correctly the run before. A claim then failed
// its fixture check for text that was on the screen the whole time.
//
// 3 is automatic page segmentation, which is the shape these screens actually
// have: 71 words against 6's 56 on the same still, with both lost regions back.
// The sparse modes (11, 12) find a few more and are meant for text with no
// layout at all, which is the opposite of this.
// OCR one region, from a crop of it enlarged threefold.
//
// Tesseract is markedly better on large type, and the cheapest way to give it
// large type is to enlarge the crop. Word boxes come back in crop coordinates
// and are mapped home, so everything downstream still measures against the page.
async function ocrRegion(file, rect) {
  const scale = 3;
  const crop = path.join(os.tmpdir(), `region-${process.pid}-${rect.x}-${rect.y}.png`);
  try {
    await run("ffmpeg", ["-v", "error", "-i", file,
      "-vf", `crop=${rect.width}:${rect.height}:${rect.x}:${rect.y},scale=iw*${scale}:ih*${scale}:flags=lanczos`,
      "-y", crop]);
    // psm 6: the crop is one block by construction, which is the assumption psm 6
    // makes and psm 3 does not.
    const { stdout } = await run("tesseract", [crop, "stdout", "--psm", "6", "tsv"]);
    const words = stdout.split("\n").slice(1).map((line) => line.split("\t"))
      .filter((cells) => cells.length >= 12 && Number(cells[10]) > 60 && cells[11]?.trim())
      .map((cells) => ({
        text: cells[11].trim(),
        x: rect.x + Number(cells[6]) / scale,
        y: rect.y + Number(cells[7]) / scale,
        width: Number(cells[8]) / scale,
        height: Number(cells[9]) / scale
      }))
      .map((word) => ({ ...word, x: Math.round(word.x), y: Math.round(word.y), width: Math.round(word.width), height: Math.round(word.height) }));
    return { text: words.map(({ text }) => text).join(" "), words };
  } catch {
    return { text: "", words: [] };
  } finally {
    await fs.rm(crop, { force: true }).catch(() => {});
  }
}

async function ocrWords(file) {
  const { stdout } = await run("tesseract", [file, "stdout", "--psm", "3", "tsv"]);
  return stdout.split("\n").slice(1).map((line) => line.split("\t")).filter((cells) => cells.length >= 12 && Number(cells[11 - 1]) > 60 && cells[11]?.trim())
    .map((cells) => ({ x: Number(cells[6]), y: Number(cells[7]), width: Number(cells[8]), height: Number(cells[9]), confidence: Number(cells[10]), text: cells[11].trim() }));
}

function run(command, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
    child.once("error", reject);
    child.once("close", (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout }) : reject(new Error(`${command} failed (${code}): ${stderr.slice(-1500)}`)); });
  });
}
