// Looks at rendered frames and reports what geometry cannot see.
//
// Every composition defect this project shipped was invisible to all of its
// gates and obvious in a frame: chips drawn over product cards, the "J" clipped
// off "Jobs", a 0:13 frame with no caption, the presenter crowding proof text,
// the Jobs title rendered as an illegible strip. Rects cannot catch those, and
// the metrics average them away. A vision model looking at the picture is the
// only mechanism here that substitutes for a person looking at it.
//
// **The agent is the model.** There is no API call in here and no provider
// dependency: the render extracts frames and writes a worklist, whichever agent
// is driving -- Claude Code, Codex -- looks at those frames and writes its
// findings back, and the gate reads the file. That keeps the vision work inside
// the agent session that is already running instead of turning every render into
// metered API traffic, and it is the same shape as the rest of the agent surface.
//
// The rule this module is built around, learned the hard way elsewhere in this
// repo: **an uncalibrated critic reports blocked, never passed.** A checker that
// has not been shown to catch the failures it exists for manufactures
// confidence, which is worse than having no checker at all -- the slot looks
// filled. `criticStatus` returns "blocked_calibration" unless a receipt proves
// the critic caught known-bad frames and cleared known-good ones.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export const FINDING_KINDS = ["occlusion", "clippedText", "illegibleRegion", "collision", "emptyFrame"];

// Deliberately narrow and answerable from one still. "Is this a good frame" is
// not a question a model answers usefully; "is a word cut in half" is.
export const CRITIC_PROMPT_VERSION = "frame-critic-v1";
export const CRITIC_PROMPT = `You are inspecting one frame of a vertical short-form marketing video for defects a layout checker cannot see.

Answer only about what is visible in this image. Do not judge taste, colour, branding or whether the message is persuasive.

Report each of the following as true only when you can point to it:
- occlusion: something is drawn on top of text or a UI element so that it cannot be fully read.
- clippedText: a word or number is cut off by the edge of a card, panel or the frame, so a character is missing. A sentence that ends because it is finished is not clipped.
- illegibleRegion: text is present but too small or too low-contrast to read at this size.
- collision: two elements overlap in a way that looks accidental rather than layered by design.
- emptyFrame: the frame is essentially blank, or shows a large area where content was clearly meant to be.

Reply with JSON only: {"occlusion":bool,"clippedText":bool,"illegibleRegion":bool,"collision":bool,"emptyFrame":bool,"notes":"one sentence naming what you saw, or empty if all false"}`;

function run(command, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    child.once("error", reject);
    child.once("close", (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout }) : reject(new Error(`${command} failed (${code}): ${stderr.slice(-800)}`)); });
  });
}

export async function extractCriticFrames(master, frames, outputDir) {
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const files = [];
  for (const frame of frames) {
    const file = path.join(outputDir, `critic-${String(frame).padStart(4, "0")}.png`);
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", master, "-vf", `select='eq(n,${frame})'`, "-vsync", "0", "-frames:v", "1", file]);
    files.push({ frame, file });
  }
  return files;
}

// Model output is untrusted until it matches the shape. A critic that silently
// accepts a malformed reply reports "no findings" for a frame it never judged.
export function parseCriticReply(text) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`Frame critic reply contained no JSON object: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(start, end + 1));
  const finding = { notes: typeof parsed.notes === "string" ? parsed.notes : "" };
  for (const kind of FINDING_KINDS) {
    if (typeof parsed[kind] !== "boolean") throw new Error(`Frame critic reply missing boolean '${kind}'.`);
    finding[kind] = parsed[kind];
  }
  return finding;
}

// The worklist an agent is asked to judge. Written next to the frames so the
// task is self-contained: a path, the prompt, and where to put the answer.
export async function writeCriticWorklist(frames, outputDir) {
  const worklist = {
    schemaVersion: "1",
    promptVersion: CRITIC_PROMPT_VERSION,
    prompt: CRITIC_PROMPT,
    instructions: "Look at each frame listed below and append one finding per frame to findings.json in this directory, in the reply shape the prompt describes plus the frame's id.",
    findingsFile: path.join(outputDir, "findings.json"),
    frames: frames.map(({ frame, file }) => ({ id: String(frame), file }))
  };
  await fs.writeFile(path.join(outputDir, "worklist.json"), `${JSON.stringify(worklist, null, 2)}\n`);
  return worklist;
}

// Findings written by the agent. Every frame in the worklist must be answered:
// a missing frame is an unjudged frame, and silently treating it as clean is the
// failure this module exists to avoid.
export async function readCriticFindings(outputDir, expectedIds) {
  const parsed = JSON.parse(await fs.readFile(path.join(outputDir, "findings.json"), "utf8"));
  const byId = new Map(parsed.findings.map((finding) => [String(finding.id), finding]));
  const missing = expectedIds.filter((id) => !byId.has(String(id)));
  if (missing.length) throw new Error(`Frame critic findings are incomplete: ${missing.length} frame(s) unjudged (${missing.slice(0, 5).join(", ")}).`);
  return expectedIds.map((id) => ({ id: String(id), ...parseCriticReply(JSON.stringify(byId.get(String(id)))) }));
}

export function findingIsClean(finding) {
  return FINDING_KINDS.every((kind) => !finding[kind]);
}

// The calibration contract. A receipt records that the critic was run against a
// labelled set and caught the bad frames without condemning the good ones.
// Thresholds are deliberately strict on recall: a critic that misses defects is
// the failure mode that matters, and a false alarm only costs a human a look.
export const CALIBRATION = { minRecall: 0.8, minPrecision: 0.6 };

export function scoreCalibration(results) {
  const truePositives = results.filter(({ expectedDefect, clean }) => expectedDefect && !clean).length;
  const falseNegatives = results.filter(({ expectedDefect, clean }) => expectedDefect && clean).length;
  const falsePositives = results.filter(({ expectedDefect, clean }) => !expectedDefect && !clean).length;
  const recall = truePositives + falseNegatives ? truePositives / (truePositives + falseNegatives) : 0;
  const precision = truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : 0;
  return {
    promptVersion: CRITIC_PROMPT_VERSION,
    samples: results.length, truePositives, falseNegatives, falsePositives,
    recall: Number(recall.toFixed(3)), precision: Number(precision.toFixed(3)),
    passed: recall >= CALIBRATION.minRecall && precision >= CALIBRATION.minPrecision
  };
}

// The status a render should record. Never "passed" without a receipt, and never
// "passed" from a receipt for a different prompt: changing the prompt
// invalidates the evidence that the critic works.
export async function criticStatus(receiptPath) {
  try {
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    if (receipt.promptVersion !== CRITIC_PROMPT_VERSION) return { status: "blocked_calibration", reason: `receipt is for ${receipt.promptVersion}, critic is ${CRITIC_PROMPT_VERSION}` };
    if (!receipt.passed) return { status: "blocked_calibration", reason: `calibration failed: recall ${receipt.recall}, precision ${receipt.precision}` };
    return { status: "calibrated", receipt };
  } catch {
    return { status: "blocked_calibration", reason: "no calibration receipt; the critic has not been shown to catch anything" };
  }
}
