import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureDecodedMedia } from "./lib/creator-story-decoded-quality.mjs";
import { measureV9Motion } from "./lib/creator-story-v9-motion.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "tmp", "solomon-creator-story-v9-mascot", "baseline");
await fs.mkdir(output, { recursive: true, mode: 0o700 });

const sources = {
  v8: path.join(root, "tmp", "solomon-creator-story-v8-robot", "final", "solomon-creator-story-v8-robot-master-NOT-FOR-PUBLICATION.mp4"),
  referenceA: "/Users/mayowaadesanya/Downloads/20cabc243fa4477ba6a6b18d608680df.mov",
  referenceB: "/Users/mayowaadesanya/Downloads/08575a746dd848448506f6ca9070f732.mov",
  referenceC: "/Users/mayowaadesanya/Downloads/f785b5de067a45ccbab8f0627a3fae3f.mov"
};

const measured = {};
for (const [id, target] of Object.entries(sources)) {
  await fs.access(target);
  process.stdout.write(`Measuring ${id}\n`);
  measured[id] = {
    sourcePath: target,
    sourceSha256: await sha256(target),
    decoded: await measureDecodedMedia(target),
    motion: await measureV9Motion(target)
  };
}

const v8Manifest = JSON.parse(await fs.readFile(path.join(root, "tmp", "solomon-creator-story-v8-robot", "story-manifest.json"), "utf8"));
const v8Quality = JSON.parse(await fs.readFile(path.join(root, "tmp", "solomon-creator-story-v8-robot", "reports", "media-quality-report.json"), "utf8"));
const v8ScriptHook = v8Manifest.scenes.find(({ id }) => id === "hook-host")?.narration;
const renderedEditorialHook = "YOUR JOB SEARCH JUST CHANGED.";
const findings = [
  finding("broken_product_composite", "confirmed", "Decoded frames 550, 740, and 870 show stacked translucent privacy/product rectangles covering message content; frame 870 begins mid-sentence."),
  finding("message_starts_mid_sentence", "confirmed", "Decoded frame 870 visibly begins with ‘of ML in marketplace solutions’ because the preceding copy is covered."),
  finding("empty_highlighted_reasoning", "confirmed", "The decoded payoff and draft frames place a highlighted region over an empty AI Reasoning panel."),
  finding("robot_caption_collisions", "confirmed", "Frame 660 visibly places the robot over the GROUNDED editorial word. The prior manifest-only collision report is therefore a false negative; the report’s claim of three separate collisions is not proven by the sampled frames."),
  finding("hook_mismatch", normalize(v8ScriptHook) === normalize(renderedEditorialHook) ? "rejected" : "confirmed", `Spoken hook is ‘${v8ScriptHook}’; the rendered editorial hook is ‘${renderedEditorialHook}’.`),
  finding("only_three_hard_cuts", "method-dependent", `Decoded 0.10 scene threshold finds ${measured.v8.decoded.shots.count} shots; the stricter motion-peak method finds ${measured.v8.motion.majorTransitionPeakCount}. V8 source uses contiguous Sequence boundaries rather than declared dissolves.`),
  finding("near_static_42_percent", "method-dependent", `Under the documented <1.0 luma-difference threshold, the exact master measures ${measured.v8.motion.nearStaticFramePercent.toFixed(2)}%. The review’s 42% depends on a different unpublished threshold.`),
  finding("empty_or_zero_hero_states", "confirmed", "Decoded frames show an empty highlighted AI Reasoning region used in hero proof. Zero-count dashboard claims are not independently established by the sampled hero frames."),
  finding("cta_comment_formula", "rejected", "A comment/DM CTA is not verified and would violate the product’s fail-closed CTA policy. V9 retains a truthful save action."),
  finding("v8_audio_technical_health", "confirmed", `Decoded master measures ${measured.v8.decoded.loudness.integratedLufs} LUFS, ${measured.v8.decoded.loudness.truePeakDbtp} dBTP, and ${measured.v8.decoded.audioActivity.clickCount} isolated clicks.`)
];

const authoritative = {
  schemaVersion: "1",
  measurementVersion: "v9-baseline-v1",
  exactSourceHash: measured.v8.sourceSha256,
  measurements: measured.v8,
  manifestCrossChecks: {
    hookNarration: v8ScriptHook,
    renderedEditorialHook,
    declaredProductOccupancy: v8Quality.decoded?.canvas?.decodedBrightNeutralOccupancy,
    priorCollisionGate: v8Quality.collision,
    priorRobotPixelGate: v8Quality.robotPixels
  },
  findings
};
await fs.writeFile(path.join(output, "v8-authoritative-measurements.json"), `${JSON.stringify(authoritative, null, 2)}\n`);
await fs.writeFile(path.join(output, "reference-fingerprint.json"), `${JSON.stringify({ schemaVersion: "1", measurementVersion: "v9-baseline-v1", references: [measured.referenceA, measured.referenceB, measured.referenceC] }, null, 2)}\n`);
await fs.writeFile(path.join(output, "v8-findings-reconciliation.md"), markdown(authoritative, measured));
process.stdout.write(`${JSON.stringify({ output, v8Sha256: measured.v8.sourceSha256, motion: measured.v8.motion, findings }, null, 2)}\n`);

function finding(id, classification, evidence) {
  return { id, classification, evidence };
}

function markdown(authoritativeReport, all) {
  const referenceAverage = average([all.referenceA, all.referenceB, all.referenceC].map(({ motion }) => motion.averageFrameChange));
  return `# V8 authoritative findings reconciliation for V9

Exact V8 master SHA-256: \`${authoritativeReport.exactSourceHash}\`

## Measurement method

- Motion: ${authoritativeReport.measurements.motion.method.decoder}; ${authoritativeReport.measurements.motion.method.difference}.
- Near-static threshold: decoded luma difference below ${authoritativeReport.measurements.motion.method.lowMotionThreshold}.
- Major transition threshold: decoded luma difference at or above ${authoritativeReport.measurements.motion.method.cutThreshold}.
- Technical media: decoded video/audio via the shared creator-story quality analyzer.
- Visual defect findings: inspected exact decoded PNGs from the final V8 master, not manifest declarations.

## Motion baseline

| Metric | V8 | Three-reference average |
|---|---:|---:|
| Average frame change | ${all.v8.motion.averageFrameChange.toFixed(3)} | ${referenceAverage.toFixed(3)} |
| Median frame change | ${all.v8.motion.medianFrameChange.toFixed(3)} | ${average([all.referenceA, all.referenceB, all.referenceC].map(({ motion }) => motion.medianFrameChange)).toFixed(3)} |
| Continuous movement excluding cuts | ${all.v8.motion.continuousMovementExcludingCuts.toFixed(3)} | ${average([all.referenceA, all.referenceB, all.referenceC].map(({ motion }) => motion.continuousMovementExcludingCuts)).toFixed(3)} |
| Centre-region movement | ${all.v8.motion.centerRegionMovement.toFixed(3)} | ${average([all.referenceA, all.referenceB, all.referenceC].map(({ motion }) => motion.centerRegionMovement)).toFixed(3)} |
| Lower-region movement | ${all.v8.motion.lowerRegionMovement.toFixed(3)} | ${average([all.referenceA, all.referenceB, all.referenceC].map(({ motion }) => motion.lowerRegionMovement)).toFixed(3)} |
| First-ten-second average | ${all.v8.motion.firstTenSeconds.average.toFixed(3)} | ${average([all.referenceA, all.referenceB, all.referenceC].map(({ motion }) => motion.firstTenSeconds.average)).toFixed(3)} |
| Near-static frames | ${all.v8.motion.nearStaticFramePercent.toFixed(2)}% | ${average([all.referenceA, all.referenceB, all.referenceC].map(({ motion }) => motion.nearStaticFramePercent)).toFixed(2)}% |
| Longest low-motion interval | ${all.v8.motion.longestLowMotionSeconds.toFixed(2)} s | method-specific |

## Finding disposition

${authoritativeReport.findings.map(({ id, classification, evidence }) => `- **${id} — ${classification}.** ${evidence}`).join("\n")}

## V9 implications

V9 must replace the manifest-only collision assumption with decoded composition evidence, prevent product-text loss by comparing clean and composed product layers, compile the hook from one beat source, increase semantic motion rather than idle decoration, and preserve the safe CTA until a real destination or delivery workflow is verified.
`;
}

function normalize(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

async function sha256(target) {
  return createHash("sha256").update(await fs.readFile(target)).digest("hex");
}
