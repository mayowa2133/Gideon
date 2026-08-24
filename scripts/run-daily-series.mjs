#!/usr/bin/env node
// Cut today's film for one angle, from today's feed, in one command.
//
//   node scripts/run-daily-series.mjs --angle remote-today
//   node scripts/run-daily-series.mjs --angle overnight --out tmp/daily
//
// Runs the whole pipeline: read the feed, write today's requirements, plan,
// capture, build the inventory, verify, brief, fill the script template,
// compile, check the crops are distinct, render, and file the result under
// renders/ with today's date.
//
// Two things it deliberately does NOT do.
//
// It does not write a script. The angle carries a template a person wrote, and
// this fills in the counts and the role the feed drew this morning. A daily
// series is a fixed format whose numbers change; that is the whole reason it can
// be automated without breaking the rule that no model writes the script.
//
// It does not decide whether the film is good. It samples a frame from every
// scene and prints the paths, because the gates cannot see a clipped word, a
// crop that caught a neighbouring panel, or a caption that argues with its
// picture -- all of which have shipped here at least once. Someone has to look.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DAILY_ANGLES } from "./daily-angles.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
};

const angleId = arg("--angle");
const angle = DAILY_ANGLES[angleId];
if (!angle) {
  console.error(`usage: run-daily-series.mjs --angle <${Object.keys(DAILY_ANGLES).join("|")}>`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const outDir = path.join(ROOT, arg("--out", `tmp/daily-${angleId}-${today}`));
const handle = arg("--handle", "@solomonhq");

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: ROOT, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (c) => { stdout += c; });
  child.stderr.setEncoding("utf8").on("data", (c) => { stderr = `${stderr}${c}`.slice(-4000); });
  child.once("error", reject);
  child.once("close", (code) => code === 0
    ? resolve(stdout)
    : reject(new Error(`${command} ${args[1] ?? ""} failed (${code})\n${stderr.slice(-1500)}\n${stdout.slice(-1500)}`)));
});

const node = (script, ...args) => run(process.execPath, [path.join(ROOT, "scripts", script), ...args]);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const step = (name) => process.stdout.write(`\n== ${name}\n`);

// A stage that reports `ok:false` or issues has found something. Say what, and
// stop -- a later stage would either fail more confusingly or paper over it.
const gate = (label, payload, { issues = payload?.issues, ok = payload?.ok } = {}) => {
  if (ok === false || (Array.isArray(issues) && issues.length)) {
    console.error(`\n${label} failed:\n${JSON.stringify(issues ?? payload, null, 1)}`);
    process.exit(1);
  }
};

fs.mkdirSync(outDir, { recursive: true });

step(`feed (${angle.surface})`);
const feedOut = await node("plan-daily-jobs-film.mjs", "--surface", angle.surface, "--out", outDir);
const feed = readJson(path.join(outDir, "feed-today.json"));
if (!feed.top?.length) {
  console.error(`the feed drew no cards to film:\n${feedOut}`);
  process.exit(1);
}
console.log(`   ${feed.header} | top: ${feed.top[0].title} @ ${feed.top[0].company}`);

step("today's requirements and script");
const { requirements, script } = angle.plan(feed);
fs.writeFileSync(path.join(outDir, "requirements.json"), `${JSON.stringify(requirements, null, 1)}\n`);
fs.writeFileSync(path.join(outDir, "script.json"), `${JSON.stringify(script, null, 1)}\n`);
console.log(`   ${requirements.length} claims, ${script.length} beats, ${script.reduce((n, b) => n + b.vo.split(/\s+/).filter(Boolean).length, 0)} words`);

step("plan");
gate("plan", JSON.parse(await node("plan-creator-capture.mjs", "plan",
  "--out", outDir, "--topic", angle.topic, "--requirements", path.join(outDir, "requirements.json"))));

step("capture");
const captured = JSON.parse(await node("run-creator-capture.mjs", "--out", outDir));
gate("capture", captured);
console.log(`   ${captured.captured}/${captured.planned} shots`);

step("inventory");
await node("build-screen-inventory.mjs", "--from", path.join(outDir, "capture-run.json"), "--out", path.join(outDir, "inventory.json"));

step("verify");
const verified = JSON.parse(await node("plan-creator-capture.mjs", "verify",
  "--out", outDir, "--inventory", path.join(outDir, "inventory.json")));
gate("verify", verified);
for (const shot of verified.shots ?? []) console.log(`   ${shot.claimId}: ${shot.renderedTextPx}px`);

step("brief");
await node("generate-creator-story.mjs", "brief", "--out", outDir,
  "--plan", path.join(outDir, "capture-plan.json"), "--inventory", path.join(outDir, "inventory.json"),
  "--topic", angle.topic, "--handle", handle, "--seconds", String(angle.seconds));

// The brief decides the beat ids from the claims that survived, and the template
// was written against a beat plan. If they disagree the compiler says so in a
// way that names the beat, which is more useful than anything this could add.
step("compile");
gate("compile", JSON.parse(await node("generate-creator-story.mjs", "compile",
  "--out", outDir, "--inventory", path.join(outDir, "inventory.json"))));

step("crops");
// Two claims that resolve to one crop prove the same thing twice while looking
// like two. It has happened, so it is checked rather than trusted.
const blueprint = readJson(path.join(outDir, "blueprint.json"));
const seen = new Map();
for (const scene of blueprint.scenes) {
  if (!scene.supportedClaimIds?.length) continue;
  const key = `${scene.productCrop.assetId}:${scene.productCrop.x},${scene.productCrop.y},${scene.productCrop.width}`;
  if (seen.has(key)) {
    console.error(`\ncrops failed: ${scene.id} draws the same crop as ${seen.get(key)} (${key})`);
    process.exit(1);
  }
  seen.set(key, scene.id);
  console.log(`   ${scene.id} -> ${key}`);
}

step("render");
await node("render-creator-story.mjs", "--in", outDir);
const film = fs.readdirSync(path.join(outDir, "render"))
  .filter((name) => name.endsWith(".mp4") && name !== "raw.mp4")
  .map((name) => path.join(outDir, "render", name))[0];
if (!film) { console.error("render produced no film"); process.exit(1); }

const filed = path.join(ROOT, "renders", `solomon-daily-${angle.slug}-${today}-1080x1920.mp4`);
fs.copyFileSync(film, filed);

step("frames to look at");
const props = readJson(path.join(outDir, "render", "input-props.json"));
const frameDir = path.join(outDir, "frames");
fs.mkdirSync(frameDir, { recursive: true });
for (const [index, scene] of (props.scenes ?? []).entries()) {
  const at = Math.round(scene.from + (scene.to - scene.from) * 0.62);
  await run("ffmpeg", ["-loglevel", "error", "-i", filed,
    "-vf", `select=eq(n\\,${at}),scale=340:604`, "-vframes", "1", "-y",
    path.join(frameDir, `s${index}.png`)]);
}

console.log(`\nfilm:   ${path.relative(ROOT, filed)}`);
console.log(`frames: ${path.relative(ROOT, frameDir)}/s0..s${(props.scenes?.length ?? 1) - 1}.png`);
console.log(`\nThe gates passed. They cannot see a clipped word, a crop that caught the`);
console.log(`panel next to it, or a caption arguing with its picture. Look at the frames.`);
