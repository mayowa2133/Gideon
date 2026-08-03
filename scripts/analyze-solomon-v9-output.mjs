import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureV9Motion } from "./lib/creator-story-v9-motion.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),output=path.join(root,"tmp","solomon-creator-story-v9-mascot"),master=process.env.SOLOMON_V9_MASTER??path.join(output,"final","solomon-creator-story-v9-mascot-master-NOT-FOR-PUBLICATION.mp4");
const current=await measureV9Motion(master),baselineReport=JSON.parse(await fs.readFile(path.join(output,"baseline","v8-authoritative-measurements.json"),"utf8")),baseline=baselineReport.measurements.motion,refs=JSON.parse(await fs.readFile(path.join(output,"baseline","reference-fingerprint.json"),"utf8"));
const comparison={schemaVersion:"1",methodVersion:"v9-motion-v1",v8:baseline,v9:current,references:refs.references,targets:{medianAtLeast:baseline.medianFrameChange*2,continuousAtLeast:baseline.continuousMovementExcludingCuts*2,nearStaticBelow:baseline.nearStaticFramePercent},gates:{median:current.medianFrameChange>=baseline.medianFrameChange*2,continuous:current.continuousMovementExcludingCuts>=baseline.continuousMovementExcludingCuts*2,nearStatic:current.nearStaticFramePercent<baseline.nearStaticFramePercent,longestLowMotion:current.longestLowMotionSeconds<=2}};
await fs.writeFile(path.join(output,"reports","v8-v9-reference-comparison.json"),`${JSON.stringify(comparison,null,2)}\n`);
await fs.writeFile(path.join(output,"reports","v8-v9-reference-comparison.md"),`# V8 / V9 / reference decoded comparison\n\n- V8 median: ${baseline.medianFrameChange.toFixed(4)}\n- V9 median: ${current.medianFrameChange.toFixed(4)} (target ${comparison.targets.medianAtLeast.toFixed(4)})\n- V8 continuous: ${baseline.continuousMovementExcludingCuts.toFixed(4)}\n- V9 continuous: ${current.continuousMovementExcludingCuts.toFixed(4)} (target ${comparison.targets.continuousAtLeast.toFixed(4)})\n- V8 near-static: ${baseline.nearStaticFramePercent.toFixed(2)}%\n- V9 near-static: ${current.nearStaticFramePercent.toFixed(2)}%\n`);
console.log(JSON.stringify(comparison,null,2));
