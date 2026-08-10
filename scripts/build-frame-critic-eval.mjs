// Builds the labelled set the frame critic must pass before it is allowed to
// gate a render.
//
// Good frames are real: pulled from the current master, which has been read by
// eye and shipped. Bad frames are synthesised from those same frames by
// introducing one defect each, deterministically with ffmpeg -- an opaque panel
// over text is an occlusion, a shifted crop clips words at the edge, a flat fill
// is an empty frame. Synthetic, and labelled as such: they test whether the
// critic can name a category, not whether it can reproduce this project's
// history. Real historical bad frames would be better evidence and are not
// reproducible now, which the receipt records.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const master = path.join(root, "tmp", "solomon-creator-story-v22-performance", "final", "solomon-creator-story-v22-performance-master-NOT-FOR-PUBLICATION.mp4");
const outputDir = path.join(root, "fixtures", "creator-story", "critic-eval");
// Frames chosen across different shot types so a pass is not a pass on one look.
const GOOD_FRAMES = [120, 350, 620, 900, 1100];

const run = (args) => new Promise((resolve, reject) => {
  const child = spawn("ffmpeg", args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = ""; child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-500)}`)));
});

await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
const samples = [];
for (const frame of GOOD_FRAMES) {
  const file = path.join(outputDir, `good-${frame}.png`);
  await run(["-y", "-loglevel", "error", "-i", master, "-vf", `select='eq(n,${frame})'`, "-vsync", "0", "-frames:v", "1", file]);
  samples.push({ id: `good-${frame}`, file: path.relative(root, file), expectedDefect: false, kind: "none", provenance: "real" });
}
// One defect per frame, each the visual signature of a real failure this project
// shipped: a chip drawn over a product card, a word clipped by a card edge, and
// a scene that rendered essentially blank.
const DEFECTS = [
  { id: "occlusion", frame: 350, filter: "drawbox=x=90:y=430:w=760:h=150:color=black@0.95:t=fill" },
  { id: "clipped", frame: 620, filter: "crop=iw*0.82:ih:iw*0.18:0,scale=1080:1920" },
  { id: "empty", frame: 900, filter: "boxblur=40:4,eq=brightness=0.35:saturation=0" }
];
for (const defect of DEFECTS) {
  const file = path.join(outputDir, `bad-${defect.id}.png`);
  await run(["-y", "-loglevel", "error", "-i", master, "-vf", `select='eq(n,${defect.frame})',${defect.filter}`, "-vsync", "0", "-frames:v", "1", file]);
  samples.push({ id: `bad-${defect.id}`, file: path.relative(root, file), expectedDefect: true, kind: defect.id, provenance: "synthetic" });
}

const manifest = {
  schemaVersion: "1",
  note: "Good frames are real frames from a shipped master. Bad frames are synthetic single-defect variants of those frames; they test category detection, not this project's specific history.",
  sourceMaster: path.relative(root, master),
  samples
};
await fs.writeFile(path.join(outputDir, "eval-set.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${samples.filter((sample) => !sample.expectedDefect).length} good + ${samples.filter((sample) => sample.expectedDefect).length} bad -> ${path.relative(root, outputDir)}\n`);
