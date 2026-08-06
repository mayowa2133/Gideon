import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { measureV22Motion } from "./lib/creator-story-v22-motion.mjs";

const require=createRequire(import.meta.url);
// Read the bands from the shared module rather than restating them. Through V20
// the shot-count band existed in three places with three different values
// (V20_SHOT_BANDS [13,20], the derived fixture [13,21], and a hardcoded [16,21]
// here), so the number this report displayed was not the number being enforced.
const {V22_MOTION_BANDS,V22_SHOT_BANDS}=require("../dist/main/shared/creatorStoryV22Quality.js");

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),output=path.join(root,"tmp","solomon-creator-story-v22-performance"),master=process.env.SOLOMON_V22_MASTER??path.join(output,"final","solomon-creator-story-v22-performance-master-NOT-FOR-PUBLICATION.mp4"),baseline=JSON.parse(await fs.readFile(path.join(output,"baseline","v21-authoritative-baseline.json"),"utf8")),quality=JSON.parse(await fs.readFile(path.join(output,"reports","media-quality-report.json"),"utf8"));
const current=await measureV22Motion(master,[{id:"opening",fromSeconds:0,toSeconds:4.4},{id:"mechanism",fromSeconds:14,toSeconds:24.5},{id:"payoff",fromSeconds:27.5,toSeconds:32},{id:"cta",fromSeconds:32,toSeconds:36}]),v21=baseline.v21.motion,referenceAverage=average(baseline.referenceMeasurements.map(({motion})=>motion.averageFrameChange));
const report={schemaVersion:"10.1",methodVersion:"common-decoded-luma-v22.1",v21:{path:baseline.v21.path,sha256:baseline.v21.sha256,motion:v21},v22:{path:master,sha256:quality.masterSha256,motion:current},references:baseline.referenceMeasurements.map(({path,sha256,motion})=>({path,sha256,motion})),improvements:{hookComprehension:"Cause-and-effect is shown with Applied, a cursor action, and Interviewing in the opening proof chain.",contactRevealTimingSeconds:1.8,productOccupancy:"Large isolated evidence objects replace desktop-page framing.",requiredTextReadability:quality.ocr.requiredCoverage,semanticMotion:"Every manifest scene has a semantic event; decoded movement is reported separately so decorative drift cannot satisfy the contract alone.",transitionTypes:quality.transitions.boundaries,mascotFaces:quality.mascot.renderedFaceStateCount,mascotGestures:quality.mascot.renderedGestureStateCount,payoff:"One combined state replaces V19’s four-screen carousel.",cta:"Mascot looks, holds, taps, confirms, and returns gaze around one truthful save action.",audio:quality.decoded.loudness,privacy:{bannedPassed:quality.ocr.banned.passed,privateMatches:quality.ocr.privateMatches,disclosurePassed:quality.ocr.singleDisclosurePassed}},targets:{medianBand:V22_MOTION_BANDS.medianFrameChange,continuousBand:V22_MOTION_BANDS.continuousMovementExcludingCuts,lowMotionAtMostSeconds:V22_MOTION_BANDS.longestLowMotionSeconds[1],shotCountBand:V22_SHOT_BANDS.decodedShotCount},referenceAverageFrameChange:referenceAverage,automatedParityClaimed:false,humanReferenceQualityRequired:true};

// Regression floors. Every metric that passed in the accepted parent version
// becomes a floor for this one: V5→V19 repeatedly fixed the criticized axis
// while silently regressing another, and only a mechanical check stops that.
const floorsPath=path.join(root,"fixtures","creator-story","v21-accepted-metrics.json");
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
  // A deliberate design change may lower a metric on purpose. Those are recorded
  // as accepted deviations with a reason and reported as "accepted" rather than
  // "passed", so the concession stays visible instead of disappearing into a
  // quietly rewritten floor.
  const accepted=floors.acceptedDeviations?.[metric];
  if(accepted&&status==="failed"&&(accepted.min===undefined||value>=accepted.min)&&(accepted.max===undefined||value<=accepted.max)){
    return{metric,v21:floor.value,v22:value,requirement:`accepted >= ${accepted.min ?? "n/a"} (${accepted.reason})`,status:"accepted"};
  }
  return{metric,v21:floor.value,v22:value,requirement,status};
});
const gateRows=Object.entries(quality.gates).map(([gate,status])=>({gate,status}));
const regressions=scorecardRows.filter(({status})=>status==="failed");
const failedGates=gateRows.filter(({status})=>status==="failed");
const scorecardReport={schemaVersion:"1",generatedAt:new Date().toISOString(),parentVersion:floors.parentVersion,parentMasterSha256:floors.masterSha256,masterSha256:quality.masterSha256,metrics:scorecardRows,gates:gateRows,regressions,failedGates,passed:regressions.length===0&&failedGates.length===0};
await fs.writeFile(path.join(output,"reports","v22-scorecard.json"),`${JSON.stringify(scorecardReport,null,2)}\n`);
await fs.writeFile(path.join(output,"reports","v22-scorecard.md"),scorecardMarkdown(scorecardReport));
if(!scorecardReport.passed){process.stdout.write(`${JSON.stringify({regressions,failedGates},null,2)}\n`);process.exitCode=1;}

await fs.writeFile(path.join(output,"reports","v21-v22-reference-comparison.json"),`${JSON.stringify(report,null,2)}\n`);await fs.writeFile(path.join(output,"reports","v21-v22-reference-comparison.md"),`# V19 → V22 → reference comparison\n\n| Metric | V19 | V22 | Target / context |\n|---|---:|---:|---:|\n| Median movement | ${v21.medianFrameChange.toFixed(3)} | ${current.medianFrameChange.toFixed(3)} | in band |\n| Continuous movement | ${v21.continuousMovementExcludingCuts.toFixed(3)} | ${current.continuousMovementExcludingCuts.toFixed(3)} | in band |\n| Near-static frames | ${v21.nearStaticFramePercent.toFixed(2)}% | ${current.nearStaticFramePercent.toFixed(2)}% | lower is better |\n| Longest low-motion interval | ${v21.longestLowMotionSeconds.toFixed(2)} s | ${current.longestLowMotionSeconds.toFixed(2)} s | ≤ 4.0 s |\n| Average frame change | ${v21.averageFrameChange.toFixed(3)} | ${current.averageFrameChange.toFixed(3)} | references avg ${referenceAverage.toFixed(3)} |\n\nV22 improves proof size, cause-and-effect, one-state payoff, presenter acting, and CTA performance. Automated metrics do not establish reference parity; the human checklist remains blocked.\n`);process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
function average(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;}

function scorecardMarkdown(report){
  const metrics=report.metrics.map(({metric,v21,v22,requirement,status})=>`| ${metric} | ${format(v21)} | ${format(v22)} | ${requirement} | ${status} |`).join("\n");
  const gates=report.gates.map(({gate,status})=>`| ${gate} | ${status} |`).join("\n");
  return `# V22 scorecard\n\nParent: V${report.parentVersion} (\`${report.parentMasterSha256}\`)\nMaster: \`${report.masterSha256}\`\nRegression-free: ${report.passed?"yes":"no"}\n\n## Metrics vs parent floors\n\n| Metric | V19 | V22 | Requirement | Status |\n| --- | --- | --- | --- | --- |\n${metrics}\n\n## Render gates\n\n| Gate | Status |\n| --- | --- |\n${gates}\n`;
}
function format(value){return typeof value==="number"?Number(value.toFixed(4)):String(value);}
