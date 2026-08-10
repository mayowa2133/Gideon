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

const screens = [];
for (const screen of SCREENS) {
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
  screens.push({ asset: screen.asset, trim: screen.trim, width: SOURCE_WIDTH, height: SOURCE_HEIGHT, elements });
  process.stdout.write(`${screen.asset.padEnd(20)}${String(words.length).padStart(4)} words  ${String(elements.filter((element) => element.provenance === "approved").length).padStart(2)} approved  ${String(elements.filter((element) => element.provenance === "candidate").length).padStart(2)} candidate\n`);
}

const inventory = { schemaVersion: "1", product: "solomon", source: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT }, screens };
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(target, `${JSON.stringify(inventory, null, 2)}\n`);
const total = screens.reduce((sum, screen) => sum + screen.elements.length, 0);
process.stdout.write(`\n${total} elements across ${screens.length} screens -> ${path.relative(root, target)}\n`);

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

async function ocrWords(file) {
  const { stdout } = await run("tesseract", [file, "stdout", "--psm", "6", "tsv"]);
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
