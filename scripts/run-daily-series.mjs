#!/usr/bin/env node
// Cut today's film for one angle, from today's feed, in one command.
//
//   node scripts/run-daily-series.mjs --angle remote-today
//   node scripts/run-daily-series.mjs --all --ingest
//   node scripts/run-daily-series.mjs --angle remote-today,overnight
//
// With --ingest it runs Solomon's discovery first, once, and then cuts every
// angle from that one ingest. Once, because discovery walks a few dozen external
// job boards and takes minutes -- running it per angle would spend that three
// times over to look at the same feed. And first, because a film whose claim is
// "these arrived overnight" is only true if something went and looked.
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
import { DAILY_ANGLES, cardKey } from "./daily-angles.mjs";
import { retryPolicy, cardClaimIds } from "./lib/retry-policy.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
};

const wanted = process.argv.includes("--all")
  ? Object.keys(DAILY_ANGLES)
  : (arg("--angle") ?? "").split(",").map((name) => name.trim()).filter(Boolean);
const unknown = wanted.filter((name) => !DAILY_ANGLES[name]);
if (!wanted.length || unknown.length) {
  console.error(unknown.length ? `no such angle: ${unknown.join(", ")}` : "no angle given");
  console.error(`usage: run-daily-series.mjs [--ingest] --all | --angle <${Object.keys(DAILY_ANGLES).join("|")}>[,...]`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const handle = arg("--handle", "@solomonhq");
const outFor = (angleId) => path.join(ROOT, arg("--out", `tmp/daily-${angleId}-${today}`));

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

// The same, but a non-zero exit is data rather than a throw.
//
// `plan`, `capture` and `verify` all exit 1 when they have issues, which is right
// for a person at a terminal and wrong inside the candidate loop: the whole point
// there is to read the issues and try the next card. Without this the loop never
// ran, because the first rejection threw straight past it.
const nodeSoft = async (script, ...args) => {
  try {
    return { parsed: true, payload: JSON.parse(await node(script, ...args)) };
  } catch (error) {
    const text = String(error?.message ?? "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      // The stage ran, disagreed, and said why in JSON on its way out.
      try { return { parsed: true, payload: JSON.parse(text.slice(start, end + 1)) }; } catch { /* fall through */ }
    }
    // No JSON: the stage did not get far enough to have an opinion. Whether that
    // is worth retrying is `retryPolicy`'s call, not this function's.
    return { parsed: false, payload: { ok: false, issues: [{ reason: "stage_crashed", detail: text.slice(-600) }] } };
  }
};
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

/** Solomon's own discovery, run once before anything is filmed. */
async function ingest() {
  const repo = process.env.SOLOMON_REPO ?? path.join(process.env.HOME ?? "", "Projects", "NexusReach");
  const script = path.join(repo, "backend", "scripts", "daily_ingest.py");
  const python = path.join(repo, "backend", ".venv", "bin", "python");
  for (const required of [script, python]) {
    if (!fs.existsSync(required)) {
      console.error(`\ningest: ${required} not found. Set SOLOMON_REPO to Solomon's checkout.`);
      process.exit(1);
    }
  }
  // The backend's own .env may point at a database that no longer resolves, so
  // NEXUSREACH_DATABASE_URL is forwarded when set and named when it is not.
  if (!process.env.NEXUSREACH_DATABASE_URL) {
    console.log("   NEXUSREACH_DATABASE_URL is unset; the ingest will use whatever backend/.env points at.");
  }
  const summary = await new Promise((resolve, reject) => {
    const child = spawn(python, [script], { cwd: path.join(repo, "backend"), shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.setEncoding("utf8").on("data", (c) => { out += c; });
    child.stderr.setEncoding("utf8").on("data", (c) => { err = `${err}${c}`.slice(-4000); });
    child.once("error", reject);
    // A non-zero exit means at least one discovery mode failed. That is not
    // something to film over: an "arrived overnight" claim from a feed nothing
    // refreshed is simply false. Stop, and let the operator decide to re-run
    // without --ingest if they want a film from yesterday's data.
    child.once("close", (code) => code === 0
      ? resolve(out)
      : reject(new Error(`daily_ingest.py exited ${code}\n${out.slice(-1200)}\n${err.slice(-1200)}`)));
  });
  try {
    const parsed = JSON.parse(summary);
    console.log(`   stored ${parsed.stored} new; ${parsed.after.total} total, ${parsed.after.added_last_24h} in the last 24h`);
  } catch {
    console.log(summary.trim().slice(-400));
  }
}

async function cutFilm(angleId, spent) {
  const angle = DAILY_ANGLES[angleId];
  const outDir = outFor(angleId);
  console.log(`\n######## ${angleId}`);
  fs.mkdirSync(outDir, { recursive: true });

  step(`feed (${angle.surface})`);
  const feedOut = await node("plan-daily-jobs-film.mjs", "--surface", angle.surface, "--out", outDir);
  const feed = readJson(path.join(outDir, "feed-today.json"));
  if (!feed.top?.length) {
    console.error(`the feed drew no cards to film:\n${feedOut}`);
    process.exit(1);
  }
  console.log(`   ${feed.header} | ${feed.top.length} cards read`);

  // Choosing a card is a proposal, not a decision.
  //
  // Not every card in a feed can be framed. The topmost one has the filter bar
  // above it and empty space to grow into; a card further down the column has
  // another card tight above and below, and `snapClearOfWords` refuses a crop
  // that would slice either. So the first card the exclusion offers can fail
  // `no_fit_without_cutting_words` through no fault of the angle -- which is
  // exactly what happened the first time cross-angle exclusion pushed the second
  // film onto its second-choice posting.
  //
  // Everything from here to `compile` depends on which card was chosen, so a
  // rejection reruns all of it against the next candidate rather than failing the
  // day. Bounded, because a feed where nothing frames is a real problem and
  // should surface as one instead of grinding.
  const rejected = new Set();
  let chosen = null;
  for (let attempt = 1; attempt <= 3 && !chosen; attempt += 1) {
    step(`today's requirements and script (candidate ${attempt})`);
    const planned = angle.plan(feed, new Set([...spent, ...rejected]));
    if (!planned) {
      console.log(`   nothing left to feature: every card this feed drew is spent or unframeable.`);
      return false;
    }
    const key = planned.spent?.[0];
    const card = feed.top.find((entry) => cardKey(entry) === key) ?? feed.top[0];
    console.log(`   ${card.title} @ ${card.company}`);
    const { requirements, script } = planned;
    fs.writeFileSync(path.join(outDir, "requirements.json"), `${JSON.stringify(requirements, null, 1)}\n`);
    fs.writeFileSync(path.join(outDir, "script.json"), `${JSON.stringify(script, null, 1)}\n`);
    console.log(`   ${requirements.length} claims, ${script.length} beats, ${script.reduce((n, b) => n + b.vo.split(/\s+/).filter(Boolean).length, 0)} words`);

    const owned = cardClaimIds(requirements);
    let failure = null;
    for (const [name, stage] of [
      ["plan", () => nodeSoft("plan-creator-capture.mjs", "plan",
        "--out", outDir, "--topic", angle.topic, "--requirements", path.join(outDir, "requirements.json"))],
      ["capture", () => nodeSoft("run-creator-capture.mjs", "--out", outDir)],
      ["verify", async () => {
        await node("build-screen-inventory.mjs", "--from", path.join(outDir, "capture-run.json"), "--out", path.join(outDir, "inventory.json"));
        return nodeSoft("plan-creator-capture.mjs", "verify", "--out", outDir, "--inventory", path.join(outDir, "inventory.json"));
      }]
    ]) {
      const result = await stage();
      // `verify` reports `shots` as an array of per-claim verdicts; `plan`
      // reports it as a count. Same key, two shapes, and iterating the number is
      // a crash rather than a wrong film -- which is the good kind of bug, but
      // only if someone runs it.
      if (Array.isArray(result.payload.shots)) {
        for (const shot of result.payload.shots) console.log(`   ${shot.claimId}: ${shot.renderedTextPx}px`);
      }
      if (result.parsed && result.payload.ok !== false && !result.payload.issues?.length) continue;
      failure = { name, ...result };
      break;
    }

    if (!failure) { chosen = card; break; }

    // A different card fixes a card's framing and nothing else. A crashed stage
    // or a complaint about the surface will meet the next card identically, so
    // spending two more attempts on it would turn a clear error into a wrong one.
    const verdict = retryPolicy({ parsed: failure.parsed, payload: failure.payload, cardClaimIds: owned });
    if (verdict === "abort") {
      console.error(`\n${angleId}: ${failure.name} failed for a reason a different posting will not fix:`);
      console.error(JSON.stringify(failure.payload.issues ?? failure.payload, null, 1));
      process.exit(1);
    }
    console.log(`   ${failure.name} rejected this card: ${JSON.stringify(failure.payload.issues)}`);
    if (key) rejected.add(key);
  }

  if (!chosen) {
    console.error(`\n${angleId}: no card in this feed could be framed in 3 attempts.`);
    return false;
  }
  for (const key of [cardKey(chosen)]) spent.add(key);

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
  return true;
}

if (process.argv.includes("--ingest")) {
  step("ingest (Solomon discovery)");
  await ingest();
}

// One set across the whole run, so the second film cannot re-use the first
// film's posting.
const spent = new Set();
const skipped = [];
for (const angleId of wanted) {
  if (await cutFilm(angleId, spent) === false) skipped.push(angleId);
}

if (skipped.length) {
  // A legitimate condition -- the workspace really had nothing else fresh -- but
  // never a silent one, or a scheduled run quietly produces fewer films than it
  // was asked for.
  console.error(`\nincomplete: no film for ${skipped.join(", ")} (nothing unspent in their feeds).`);
  process.exit(1);
}
