import fs from "node:fs/promises";import path from "node:path";import{fileURLToPath}from "node:url";import{measureDecodedMedia}from "./lib/creator-story-decoded-quality.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const output=path.join(root,"tmp","solomon-creator-story-v8-robot");const master=process.env.SOLOMON_V8_MASTER??path.join(output,"final","solomon-creator-story-v8-robot-master-NOT-FOR-PUBLICATION.mp4");const current=await measureDecodedMedia(master);const baseline=JSON.parse(await fs.readFile(path.join(output,"baseline","v7-authoritative-measurements.json"),"utf8"));const refs=JSON.parse(await fs.readFile(path.join(output,"baseline","reference-fingerprint.json"),"utf8"));const comparison={schemaVersion:"1",methodVersion:"decoded-quality-v1",v7:baseline,v8:current,references:refs.references,regressions:{static:current.motion.longestStaticSeconds<=Math.min(2.5,baseline.motion.longestStaticSeconds),lowEnergy:current.audioActivity.lowEnergyProportion<=baseline.audioActivity.lowEnergyProportion,shotCadence:current.shots.meanSeconds<=baseline.shots.meanSeconds,loudness:Math.abs(current.loudness.integratedLufs+14)<=Math.abs(baseline.loudness.integratedLufs+14),darkCanvas:current.canvas.darkCanvasRatio<=baseline.canvas.darkCanvasRatio}};await fs.writeFile(path.join(output,"reports","v7-v8-reference-comparison.json"),`${JSON.stringify(comparison,null,2)}\n`);await fs.writeFile(path.join(output,"reports","v7-v8-reference-comparison.md"),`# V7 / V8 / reference decoded comparison

| Metric | V7 | V8 |
| --- | ---: | ---: |
| Mean detected shot | ${baseline.shots.meanSeconds.toFixed(2)} s | ${current.shots.meanSeconds.toFixed(2)} s |
| Median decoded difference | ${baseline.motion.medianDifference.toFixed(3)} | ${current.motion.medianDifference.toFixed(3)} |
| Longest static window | ${baseline.motion.longestStaticSeconds.toFixed(2)} s | ${current.motion.longestStaticSeconds.toFixed(2)} s |
| Low-energy audio | ${baseline.audioActivity.lowEnergyPercent.toFixed(1)}% | ${current.audioActivity.lowEnergyPercent.toFixed(1)}% |
| Integrated loudness | ${baseline.loudness.integratedLufs.toFixed(2)} LUFS | ${current.loudness.integratedLufs.toFixed(2)} LUFS |
| Dark-canvas ratio | ${(baseline.canvas.darkCanvasRatio*100).toFixed(1)}% | ${(current.canvas.darkCanvasRatio*100).toFixed(1)}% |

The decoded measurements are diagnostics, not retention claims. Raw values and method definitions are preserved in the JSON artifact.
`);process.stdout.write(`${JSON.stringify({master,sha256:current.sourceSha256,regressions:comparison.regressions},null,2)}\n`);
