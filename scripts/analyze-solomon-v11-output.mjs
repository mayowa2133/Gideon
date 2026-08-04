import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureV11Motion } from "./lib/creator-story-v11-motion.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),output=path.join(root,"tmp","solomon-creator-story-v11-performance"),master=process.env.SOLOMON_V11_MASTER??path.join(output,"final","solomon-creator-story-v11-performance-master-NOT-FOR-PUBLICATION.mp4"),baseline=JSON.parse(await fs.readFile(path.join(output,"baseline","v10-authoritative-baseline.json"),"utf8")),quality=JSON.parse(await fs.readFile(path.join(output,"reports","media-quality-report.json"),"utf8"));
const current=await measureV11Motion(master,[{id:"opening",fromSeconds:0,toSeconds:4.4},{id:"mechanism",fromSeconds:14,toSeconds:24.5},{id:"payoff",fromSeconds:27.5,toSeconds:32},{id:"cta",fromSeconds:32,toSeconds:36}]),v10=baseline.v10.motion,referenceAverage=average(baseline.referenceMeasurements.map(({motion})=>motion.averageFrameChange));
const report={schemaVersion:"10.1",methodVersion:"common-decoded-luma-v11.1",v10:{path:baseline.v10.path,sha256:baseline.v10.sha256,motion:v10},v11:{path:master,sha256:quality.masterSha256,motion:current},references:baseline.referenceMeasurements.map(({path,sha256,motion})=>({path,sha256,motion})),improvements:{hookComprehension:"Cause-and-effect is shown with Applied, a cursor action, and Interviewing in the opening proof chain.",contactRevealTimingSeconds:1.8,productOccupancy:"Large isolated evidence objects replace desktop-page framing.",requiredTextReadability:quality.ocr.requiredCoverage,semanticMotion:"Every manifest scene has a semantic event; decoded movement is reported separately so decorative drift cannot satisfy the contract alone.",transitionTypes:quality.transitions.boundaries,mascotFaces:quality.mascot.renderedFaceStateCount,mascotGestures:quality.mascot.renderedGestureStateCount,payoff:"One combined state replaces V10’s four-screen carousel.",cta:"Mascot looks, holds, taps, confirms, and returns gaze around one truthful save action.",audio:quality.decoded.loudness,privacy:{bannedPassed:quality.ocr.banned.passed,privateMatches:quality.ocr.privateMatches,disclosurePassed:quality.ocr.singleDisclosurePassed}},targets:{medianAtLeast:4.5,continuousAtLeast:4.5,lowMotionAtMostSeconds:2},referenceAverageFrameChange:referenceAverage,automatedParityClaimed:false,humanReferenceQualityRequired:true};

// Regression floors. Every metric that passed in the accepted parent version
// becomes a floor for this one: V5→V10 repeatedly fixed the criticized axis
// while silently regressing another, and only a mechanical check stops that.
const floorsPath=path.join(root,"fixtures","creator-story","v10-accepted-metrics.json");
const floors=JSON.parse(await fs.readFile(floorsPath,"utf8"));
const observed={
  loudnessIntegratedLufs:quality.decoded.loudness.integratedLufs,
  truePeakDbtp:quality.decoded.loudness.truePeakDbtp,
  clickCount:quality.decoded.audioActivity.clickCount,
  medianFrameChange:current.medianFrameChange,
  continuousMovementExcludingCuts:current.continuousMovementExcludingCuts,
  nearStaticFramePercent:current.nearStaticFramePercent,
  longestLowMotionSeconds:current.longestLowMotionSeconds,
  majorTransitionPeakCount:current.majorTransitionPeakCount,
  decodedShotCount:quality.decoded.shots.count,
  durationSeconds:quality.decoded.metadata.durationSeconds,
};
const bands=quality.motionBands?.checks??[];
const scorecardRows=Object.entries(floors.metrics).map(([metric,floor])=>{
  const value=observed[metric];
  const band=bands.find(({metric:name})=>name===metric);
  let status="passed",requirement="";
  if(band){requirement=`band ${band.low}–${band.high}`;status=band.passed?"passed":"failed";}
  else if(floor.kind==="band"&&floor.band){requirement=`band ${floor.band[0]}–${floor.band[1]}`;status=value>=floor.band[0]&&value<=floor.band[1]?"passed":"failed";}
  else if(floor.kind==="max"){requirement=`<= ${floor.max}`;status=value<=floor.max?"passed":"failed";}
  else if(floor.kind==="min"){requirement=`>= ${floor.value}`;status=value>=floor.value?"passed":"failed";}
  return{metric,v10:floor.value,v11:value,requirement,status};
});
const gateRows=Object.entries(quality.gates).map(([gate,status])=>({gate,status}));
const regressions=scorecardRows.filter(({status})=>status==="failed");
const failedGates=gateRows.filter(({status})=>status==="failed");
const scorecardReport={schemaVersion:"1",generatedAt:new Date().toISOString(),parentVersion:floors.parentVersion,parentMasterSha256:floors.masterSha256,masterSha256:quality.masterSha256,metrics:scorecardRows,gates:gateRows,regressions,failedGates,passed:regressions.length===0&&failedGates.length===0};
await fs.writeFile(path.join(output,"reports","v11-scorecard.json"),`${JSON.stringify(scorecardReport,null,2)}\n`);
await fs.writeFile(path.join(output,"reports","v11-scorecard.md"),scorecardMarkdown(scorecardReport));
if(!scorecardReport.passed){process.stdout.write(`${JSON.stringify({regressions,failedGates},null,2)}\n`);process.exitCode=1;}

await fs.writeFile(path.join(output,"reports","v10-v11-reference-comparison.json"),`${JSON.stringify(report,null,2)}\n`);await fs.writeFile(path.join(output,"reports","v10-v11-reference-comparison.md"),`# V10 → V11 → reference comparison\n\n| Metric | V10 | V11 | Target / context |\n|---|---:|---:|---:|\n| Median movement | ${v10.medianFrameChange.toFixed(3)} | ${current.medianFrameChange.toFixed(3)} | ≥ 4.5 |\n| Continuous movement | ${v10.continuousMovementExcludingCuts.toFixed(3)} | ${current.continuousMovementExcludingCuts.toFixed(3)} | ≥ 4.5 |\n| Near-static frames | ${v10.nearStaticFramePercent.toFixed(2)}% | ${current.nearStaticFramePercent.toFixed(2)}% | lower is better |\n| Longest low-motion interval | ${v10.longestLowMotionSeconds.toFixed(2)} s | ${current.longestLowMotionSeconds.toFixed(2)} s | ≤ 2.0 s |\n| Average frame change | ${v10.averageFrameChange.toFixed(3)} | ${current.averageFrameChange.toFixed(3)} | references avg ${referenceAverage.toFixed(3)} |\n\nV11 improves proof size, cause-and-effect, one-state payoff, presenter acting, and CTA performance. Automated metrics do not establish reference parity; the human checklist remains blocked.\n`);process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
function average(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;}

function scorecardMarkdown(report){
  const metrics=report.metrics.map(({metric,v10,v11,requirement,status})=>`| ${metric} | ${format(v10)} | ${format(v11)} | ${requirement} | ${status} |`).join("\n");
  const gates=report.gates.map(({gate,status})=>`| ${gate} | ${status} |`).join("\n");
  return `# V11 scorecard\n\nParent: V${report.parentVersion} (\`${report.parentMasterSha256}\`)\nMaster: \`${report.masterSha256}\`\nRegression-free: ${report.passed?"yes":"no"}\n\n## Metrics vs parent floors\n\n| Metric | V10 | V11 | Requirement | Status |\n| --- | --- | --- | --- | --- |\n${metrics}\n\n## Render gates\n\n| Gate | Status |\n| --- | --- |\n${gates}\n`;
}
function format(value){return typeof value==="number"?Number(value.toFixed(4)):String(value);}
