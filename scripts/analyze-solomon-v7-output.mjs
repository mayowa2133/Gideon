import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const outputRoot=path.join(root,"tmp","solomon-creator-story-v7-robot");
const master=process.env.SOLOMON_V7_MASTER??path.join(outputRoot,"final","solomon-creator-story-v7-robot-master-NOT-FOR-PUBLICATION.mp4");
const baseline=JSON.parse(await fs.readFile(path.join(outputRoot,"baseline","reference-fingerprint.json"),"utf8"));
if(!existsSync(master))throw new Error(`V7 master is missing: ${master}`);
const regions={whole:"",center:"crop=104:200:38:48,",lower:"crop=180:152:0:168,"};
const v7={};
for(const [regionId,regionFilter] of Object.entries(regions)){
  const filter=`fps=30,scale=180:320:flags=bilinear,${regionFilter}tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG`;
  const result=await run("ffmpeg",["-hide_banner","-t","10","-i",master,"-vf",filter,"-an","-f","null","-"],true);
  const values=[...result.stderr.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map(match=>Number(match[1]));
  if(values.length!==299)throw new Error(`Expected 299 V7 movement samples for ${regionId}; got ${values.length}.`);
  v7[regionId]=summary(values);
}
const cutResult=await run("ffmpeg",["-hide_banner","-i",master,"-vf","select='gt(scene,0.22)',showinfo","-an","-f","null","-"],true);
v7.sceneCuts=[...cutResult.stderr.matchAll(/pts_time:([0-9.]+)/g)].map(match=>Number(match[1]));
v7.meanShotDurationSeconds=Number((36/(v7.sceneCuts.length+1)).toFixed(3));
const references=Object.fromEntries(Object.entries(baseline.references).map(([id,value])=>[id,value.firstTenSecondMotion]));
const referenceMean=(region)=>Object.values(references).reduce((sum,item)=>sum+item[region].trimmedMean95,0)/Object.keys(references).length;
v7.relativeToReferenceMean={wholeTrimmedPercent:percent(v7.whole.trimmedMean95,referenceMean("whole")),centerTrimmedPercent:percent(v7.center.trimmedMean95,referenceMean("center")),lowerTrimmedPercent:percent(v7.lower.trimmedMean95,referenceMean("lower"))};
const v6=JSON.parse(await fs.readFile(path.join(outputRoot,"baseline","v6-measurements.json"),"utf8"));
const comparison={schemaVersion:"1",method:"First 10 seconds at 30 fps and 180x320; luma absolute frame differences via tblend; 95% trimmed mean excludes the largest cut spikes. Full-master cuts use FFmpeg scene threshold 0.22.",references,v6:v6.firstTenSecondMotion,v7};
await fs.writeFile(path.join(outputRoot,"reference-comparison-metrics.json"),`${JSON.stringify(comparison,null,2)}\n`,"utf8");
await fs.writeFile(path.join(outputRoot,"reference-comparison-findings.md"),`# Solomon Creator Story V7 reference comparison

## Measured result

- V7 first-ten-second trimmed motion is ${v7.relativeToReferenceMean.wholeTrimmedPercent}% of the three-reference whole-frame mean, ${v7.relativeToReferenceMean.centerTrimmedPercent}% in the center, and ${v7.relativeToReferenceMean.lowerTrimmedPercent}% in the lower region.
- V6 measured ${v6.firstTenSecondMotion.relativeToReferenceMean.wholeTrimmedPercent}%, ${v6.firstTenSecondMotion.relativeToReferenceMean.centerTrimmedPercent}%, and ${v6.firstTenSecondMotion.relativeToReferenceMean.lowerTrimmedPercent}% respectively.
- V7 contains ${v7.sceneCuts.length} encoded scene changes at threshold 0.22, for a mean detected shot duration of ${v7.meanShotDurationSeconds} seconds.

## Interpretation

V7 preserves the references' consequence-first opening, frequent visual resets, presenter/product alternation, readable proof moments, creator captions, payoff, and concise brand resolution. Raw frame movement is diagnostic rather than a quality target: authentic product proof deliberately moves less than a human presenter, while the robot provides supporting gaze, torso, arm, blink, and audio-envelope motion. The final visual review should prefer causal clarity and readable Solomon evidence over artificial continuous cursor movement or decorative zooming.

V7's first-ten-second whole and center motion are lower than V6 (${v7.relativeToReferenceMean.wholeTrimmedPercent}% versus ${v6.firstTenSecondMotion.relativeToReferenceMean.wholeTrimmedPercent}%, and ${v7.relativeToReferenceMean.centerTrimmedPercent}% versus ${v6.firstTenSecondMotion.relativeToReferenceMean.centerTrimmedPercent}%). That is a measured tradeoff, not an improvement claim: V7 spends its opening four seconds on two authentic product results so both spoken hook atoms are actually proven. The lower-region measure is effectively unchanged (${v7.relativeToReferenceMean.lowerTrimmedPercent}% versus ${v6.firstTenSecondMotion.relativeToReferenceMean.lowerTrimmedPercent}%). Improving those motion percentages would require either a more active recorded presenter or sacrificing immediate product proof; neither should be inferred as automatically better without retention data.

## Remaining human evidence

Only publication can establish retention or conversion. Physical-phone readability, voice naturalness, Solomon brand approval, and genuine-footage release approval remain explicit human gates.
`,"utf8");
process.stdout.write(`${JSON.stringify({master,v7},null,2)}\n`);

function summary(values){const ordered=[...values].sort((a,b)=>a-b),trimmed=ordered.slice(0,Math.floor(ordered.length*.95));return{samples:values.length,mean:round(values.reduce((a,b)=>a+b,0)/values.length),median:round(ordered[Math.floor(ordered.length/2)]),trimmedMean95:round(trimmed.reduce((a,b)=>a+b,0)/trimmed.length)};}
function percent(a,b){return round(a/b*100,1)} function round(value,digits=4){return Number(value.toFixed(digits));}
async function run(command,args,acceptNonZero=false){return await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,shell:false,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.setEncoding("utf8").on("data",c=>stdout+=c);child.stderr.setEncoding("utf8").on("data",c=>stderr=`${stderr}${c}`.slice(-200000));child.once("error",reject);child.once("close",code=>code!==0&&!acceptNonZero?reject(new Error(`${command} failed: ${stderr.slice(-4000)}`)):resolve({stdout,stderr}));});}
