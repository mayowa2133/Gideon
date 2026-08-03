import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureDecodedMedia, wordGapsFromTranscript } from "./lib/creator-story-decoded-quality.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"tmp","solomon-creator-story-v8-robot","baseline");
const v7Root=path.join(root,"tmp","solomon-creator-story-v7-robot");
const sources={
  v7:path.join(v7Root,"final","solomon-creator-story-v7-robot-master-NOT-FOR-PUBLICATION.mp4"),
  v6:path.join(root,"tmp","solomon-creator-story-v6-robot","final","solomon-creator-story-v6-robot-master-NOT-FOR-PUBLICATION.mp4"),
  referenceA:"/Users/mayowaadesanya/Downloads/20cabc243fa4477ba6a6b18d608680df.mov",
  referenceB:"/Users/mayowaadesanya/Downloads/08575a746dd848448506f6ca9070f732.mov",
  referenceC:"/Users/mayowaadesanya/Downloads/f785b5de067a45ccbab8f0627a3fae3f.mov"
};
await fs.mkdir(output,{recursive:true,mode:0o700});
for(const [id,target] of Object.entries(sources))if(!existsSync(target))throw new Error(`V8 baseline source ${id} is missing: ${target}`);
const measured={};for(const [id,target] of Object.entries(sources)){process.stdout.write(`Measuring ${id}\n`);measured[id]=await measureDecodedMedia(target);}
const manifest=JSON.parse(await fs.readFile(path.join(v7Root,"story-manifest.json"),"utf8"));
const transcript=JSON.parse(await fs.readFile(path.join(v7Root,"transcript-check-current","solomon-creator-story-v7-robot-master-NOT-FOR-PUBLICATION.json"),"utf8"));
const approvedWords=manifest.script.match(/[A-Za-z0-9']+/g)?.length??0;
const narrationGaps=wordGapsFromTranscript(transcript,35.6);
const v7={...measured.v7,approvedScript:{words:approvedWords,wpm:approvedWords/(measured.v7.metadata.durationSeconds/60)},narrationGaps,manifestCrossChecks:{productOccupancy:JSON.parse(await fs.readFile(path.join(v7Root,"retention-audit.json"),"utf8")).productOccupancy,robotEnvelopeSource:JSON.parse(await fs.readFile(path.join(v7Root,"robot-performance-plan.json"),"utf8")).audioEnvelopeSource}};
await fs.writeFile(path.join(output,"v7-authoritative-measurements.json"),`${JSON.stringify(v7,null,2)}\n`);
await fs.writeFile(path.join(output,"reference-fingerprint.json"),`${JSON.stringify({schemaVersion:"1",measurementVersion:"decoded-quality-v1",references:{v6:measured.v6,referenceA:measured.referenceA,referenceB:measured.referenceB,referenceC:measured.referenceC}},null,2)}\n`);
const freezeFinding=v7.motion.longestStaticSeconds>=7.5?"confirmed":v7.motion.longestStaticSeconds>2.5?"method-dependent":"rejected";
const deadAirFinding=narrationGaps.longestGapMs>=1200?"confirmed":narrationGaps.longestGapMs>250?"method-dependent":"rejected";
await fs.writeFile(path.join(output,"findings-reconciliation.md"),`# V7 authoritative finding reconciliation for V8

Exact final source SHA-256: \`${v7.sourceSha256}\`.

| Finding | Result | Reproducible measurement |
| --- | --- | --- |
| Approximately 233 WPM | Rejected | The approved manifest contains ${approvedWords} words over ${v7.metadata.durationSeconds.toFixed(3)} seconds: ${v7.approvedScript.wpm.toFixed(2)} WPM. |
| Eight-second pixel-static interval | ${freezeFinding} | The decoded 5 fps luma-difference method found ${v7.motion.longestStaticSeconds.toFixed(2)} seconds at threshold ${v7.motion.staticThreshold}. A sparse five-frame-per-second perceptual sample can classify low-motion product footage differently; both raw methods must be named rather than conflated. |
| Approximately 1.6 seconds of narration dead air | ${deadAirFinding} | Whisper word timestamps found a longest inter-word gap of ${narrationGaps.longestGapMs} ms before the outro; mixed-soundtrack silencedetect found ${v7.mixedAudioSilence.longestGapMs} ms. |
| Fabricated repeating robot envelope | Rejected for the final V7 renderer | The final plan records \`${v7.manifestCrossChecks.robotEnvelopeSource}\`; source inspection confirms hydration from the selected narration WAV before serialization. V8 must verify decoded frame response rather than trusting that declaration. |
| Comment-keyword CTA should replace save | Rejected as unsafe | No verified Solomon comment-delivery system or public destination exists. The truthful platform-save CTA remains the default. |

## Methods and thresholds

- Static intervals: ${v7.methods.static}
- Mixed audio gaps: ${v7.methods.silence}
- Click candidates: ${v7.methods.clicks}
- Canvas ratios: ${v7.methods.canvas}
- Narration gaps: ${narrationGaps.method}

The reports correctly identify a perceptual pacing and low-energy problem even where their literal freeze, WPM, or silence figures are method-dependent. V8 therefore locks both decoded technical gates and stricter perceptual/editorial gates.
`);
process.stdout.write(`${JSON.stringify({output,v7Sha256:v7.sourceSha256,wpm:v7.approvedScript.wpm,longestStaticSeconds:v7.motion.longestStaticSeconds,longestNarrationGapMs:narrationGaps.longestGapMs},null,2)}\n`);
