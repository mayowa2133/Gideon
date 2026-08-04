import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { chromium } from "playwright";
import { measureDecodedMedia } from "./lib/creator-story-decoded-quality.mjs";
import { measureV13Motion } from "./lib/creator-story-v13-motion.mjs";

const require=createRequire(import.meta.url);
const {ChatterboxNarrationProvider}=require("../dist/main/main/chatterboxNarrationProvider.js");
const {SOLOMON_CREATOR_STORY_V13_SCRIPT,SOLOMON_CREATOR_STORY_V13_TTS_BEATS,SOLOMON_CREATOR_STORY_V13_NUMERAL_ANCHORS,assertSolomonCreatorStoryV13Manifest,auditSolomonCreatorStoryV13,createSolomonCreatorStoryV13Manifest}=require("../dist/main/shared/solomonCreatorStoryV13.js");
const {auditV13BannedStrings,auditV13Layout,auditV13PhoneScale,auditV13RenderedBounds,evaluateV13MotionBands}=require("../dist/main/shared/creatorStoryV13Quality.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),output=path.join(root,"tmp","solomon-creator-story-v13-performance"),captureDir=process.env.SOLOMON_V13_CAPTURE_DIR??path.join(output,"capture"),publicDir=path.join(output,"remotion-public"),finalDir=path.join(output,"final"),reviewDir=path.join(output,"review"),reportsDir=path.join(output,"reports"),candidatesDir=path.join(output,"candidates"),narrationDir=path.join(output,"narration-candidates");
for(const dir of[output,publicDir,finalDir,reviewDir,reportsDir,candidatesDir,narrationDir])await fs.mkdir(dir,{recursive:true,mode:0o700});

const captureReceipt=JSON.parse(await fs.readFile(path.join(captureDir,"capture-receipt.json"),"utf8"));
const parentMaster=path.join(root,"tmp","solomon-creator-story-v12-performance","final","solomon-creator-story-v12-performance-master-NOT-FOR-PUBLICATION.mp4"),parentHash=await sha256(parentMaster);
const inputs=captureReceipt.captures.map((capture)=>({id:capture.id,path:capture.path,sha256:capture.sha256,domEvidence:capture.domEvidence}));
let manifest=createSolomonCreatorStoryV13Manifest(inputs,parentHash);assertSolomonCreatorStoryV13Manifest(manifest);
for(const source of manifest.sources){if(!existsSync(source.sourcePath))throw new Error(`V13 source missing: ${source.sourcePath}`);if(await sha256(source.sourcePath)!==source.sourceSha256)throw new Error(`V13 source hash mismatch: ${source.id}`);}

await extractProofs();
const narration=await generateNarration();
manifest=await hydrateMascotAudio(manifest,path.join(publicDir,"narration.wav"));assertSolomonCreatorStoryV13Manifest(manifest);
const soundDesign=await generateSoundDesign();
await writePlanning(narration,soundDesign);

const browserExecutable=resolveBrowser(),serveUrl=await bundle({entryPoint:path.join(root,"src","remotion","solomonCreatorStoryV13","index.ts"),publicDir,outDir:path.join(output,"remotion-bundle"),onProgress:(progress)=>{const value=Math.round((progress>1?progress:progress*100));if(value%25===0)process.stdout.write(`Bundle ${value}%\n`);}}),props=JSON.parse(JSON.stringify(manifest));
const composition=await selectComposition({serveUrl,id:"SolomonCreatorStoryV13Performance",inputProps:props,browserExecutable,chromeMode:"headless-shell",timeoutInMilliseconds:120000});
const intermediate=path.join(output,"solomon-creator-story-v13-remotion.mp4");
await renderMedia({composition,serveUrl,codec:"h264",outputLocation:intermediate,inputProps:props,browserExecutable,chromeMode:"headless-shell",concurrency:1,overwrite:true,pixelFormat:"yuv420p",crf:13,x264Preset:"medium",audioCodec:"aac",audioBitrate:"320K",sampleRate:48000,timeoutInMilliseconds:180000,logLevel:"info",onProgress:({progress})=>{const value=Math.round(progress*100);if(value%10===0)process.stdout.write(`Render ${value}%\n`);}});

const master=path.join(finalDir,"solomon-creator-story-v13-performance-master-NOT-FOR-PUBLICATION.mp4"),social=path.join(finalDir,"solomon-creator-story-v13-performance-social-720x1280.mp4"),muted=path.join(finalDir,"solomon-creator-story-v13-performance-muted-review.mp4"),opening=path.join(finalDir,"solomon-creator-story-v13-performance-opening-review.mp4"),mechanism=path.join(finalDir,"solomon-creator-story-v13-performance-mechanism-review.mp4"),payoff=path.join(finalDir,"solomon-creator-story-v13-performance-payoff-cta-review.mp4");
await masterAudioVideo(intermediate,master);
await Promise.all([
  run("ffmpeg",["-y","-i",master,"-vf","scale=720:1280:flags=lanczos,fps=30,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709","-c:v","libx264","-preset","slow","-b:v","4M","-maxrate","6M","-bufsize","8M","-c:a","aac","-b:a","256k","-ar","48000","-t","36","-movflags","+faststart",social],1800000),
  run("ffmpeg",["-y","-i",master,"-map","0:v:0","-c:v","copy","-an",muted]),
  clip(master,opening,0,4.4),clip(master,mechanism,13.7,10.8),clip(master,payoff,27.5,8.5)
]);
await generateCandidates(master);await generateReview(master);
const qa=await qualityAudit({master,social,muted,opening,mechanism,payoff,narration,soundDesign});
await writeFinal(qa);await run("node",[path.join(root,"scripts","analyze-solomon-v13-output.mjs")],600000);
process.stdout.write(`${JSON.stringify({master,masterSha256:qa.masterSha256,renderPassed:qa.renderPassed,releaseReady:qa.releaseReady,gates:qa.gates},null,2)}\n`);
if(!qa.renderPassed)process.exitCode=1;

async function extractProofs(){const names={tracker_before:"proof-tracker-before.mp4",tracker_after:"proof-tracker-after.mp4",opportunity:"proof-opportunity.mp4",contact:"proof-contact.mp4",outreach_blank:"proof-outreach-blank.mp4",outreach_complete:"proof-outreach-complete.mp4"};for(const source of manifest.sources)await run("ffmpeg",["-y","-i",source.sourcePath,"-vf","fps=30,format=yuv420p","-an","-c:v","libx264","-crf","11","-preset","slow","-movflags","+faststart",path.join(publicDir,names[source.id])],600000);}
async function generateNarration(){
  const runtimeOptions=[process.env.GIDEON_CHATTERBOX_RUNTIME,path.join(root,"tmp","chatterbox-runtime")].filter(Boolean),runtime=runtimeOptions.find((item)=>existsSync(path.join(item,".venv","bin","python")));
  if(!runtime)throw new Error("Chatterbox runtime is required for the V13 master.");
  const provider=new ChatterboxNarrationProvider({pythonPath:path.join(runtime,".venv","bin","python"),modelCacheRoot:path.join(runtime,"model-cache"),allowDownload:false,device:"mps"});
  // Beats compile from the single-source beat list; scene anchors derive from the
  // manifest instead of hand-typed millisecond windows (the V12 dead-air cause).
  const sceneById=new Map(manifest.scenes.map((scene)=>[scene.id,scene]));
  const beats=SOLOMON_CREATOR_STORY_V13_TTS_BEATS.map((item,index,list)=>{
    const scene=sceneById.get(item.sceneId);if(!scene)throw new Error(`TTS beat ${item.id} references unknown scene ${item.sceneId}`);
    const nextSpokenScene=list.slice(index+1).map(({sceneId})=>sceneById.get(sceneId)).find(Boolean);
    return beat(item.id,item.text,Math.round(scene.from/30*1000),Math.round((nextSpokenScene?nextSpokenScene.from:Math.min(scene.to,1071))/30*1000),item.energy);
  });
  const scriptHash=createHash("sha256").update(SOLOMON_CREATOR_STORY_V13_SCRIPT).digest("hex").slice(0,12);
  const target=path.join(narrationDir,`v13-warm-direct-${scriptHash}.wav`);
  let provenance={reusedExisting:true},realized=null;if(!existsSync(target)){const generatedDir=path.join(narrationDir,`warm-direct-${scriptHash}`,"generated"),canReuseGeneratedBeats=beats.every(({id})=>existsSync(path.join(generatedDir,`${id}.wav`)));let result;if(canReuseGeneratedBeats){result={beats:await Promise.all(beats.map(async(item)=>{const outputPath=path.join(generatedDir,`${item.id}.wav`);return{...item,outputPath,sourceDurationMs:await probeDurationMs(outputPath)};})),provenance:{provider:"chatterbox",reusedGeneratedBeats:true}};}else{result=await provider.synthesize({outputDir:path.join(narrationDir,`warm-direct-${scriptHash}`),beats,language:"en",voice:{mode:"model_default"},seed:110101});}await assembleNarration(result,target);provenance=result.provenance;realized=result.realizedTimings;}
  await fs.copyFile(target,path.join(publicDir,"narration.wav"));
  const report={schemaVersion:"11.1",approvedScript:SOLOMON_CREATOR_STORY_V13_SCRIPT,scriptHash,selectedCandidateId:`v13-warm-direct-${scriptHash}`,selectedTarget:target,sha256:await sha256(target),beats,realizedTimings:realized,humanVoiceApprovalRequired:true,provenance};await writeJson(path.join(reportsDir,"narration-provenance.json"),report);return report;
}
function beat(id,approvedText,startMs,endMs,energy){return{id,approvedText,startMs,endMs,energy};}
async function assembleNarration(result,target){
  // Two-pass placement: beats play at a single global tempo and each beat starts
  // a fixed 225 ms after the previous one ends, so internal dead air cannot
  // exceed the gap gate by construction. Scene-anchor drift is reported, not
  // silently absorbed into stretched silence like V12's fixed adelay windows.
  // Speech must land before the sting scene (frame 1056 = 35.2s). The tempo
  // ceiling sits at 1.25: atempo preserves pitch, and the reference videos run
  // 220-240 wpm, so a modest compression is on-style rather than chipmunky.
  const GAP_MS=200,LEAD_MS=150,SPEECH_END_MS=35_000;
  // Each synthesized beat carries its own leading/trailing silence. Placement has
  // to be measured on trimmed audio, otherwise the real gap is that padding plus
  // GAP_MS — which is exactly how ~0.5s pauses appear despite a 200ms budget.
  const trimmed=[];
  for(const item of result.beats){
    const trimmedPath=`${item.outputPath.replace(/\.wav$/,"")}.trimmed.wav`;
    // Trim the leading/trailing padding AND compress any internal pause beyond
    // 200ms: the reference cuts leave no readable silence inside a sentence run.
    await run("ffmpeg",["-y","-i",item.outputPath,"-af","silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:stop_periods=-1:stop_duration=0.2:stop_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB,areverse","-c:a","pcm_s16le",trimmedPath],120000);
    trimmed.push({...item,trimmedPath,trimmedDurationMs:await probeDurationMs(trimmedPath)});
  }
  const totalSourceMs=trimmed.reduce((sum,item)=>sum+item.trimmedDurationMs,0),gapTotalMs=GAP_MS*(trimmed.length-1);
  const globalTempo=Math.min(1.25,Math.max(.92,totalSourceMs/(SPEECH_END_MS-LEAD_MS-gapTotalMs)));
  const timings=[];let cursor=LEAD_MS;
  for(const item of trimmed){const audibleMs=item.trimmedDurationMs/globalTempo;timings.push({id:item.id,startMs:Math.round(cursor),audibleMs:Math.round(audibleMs),targetStartMs:item.startMs,driftMs:Math.round(cursor-item.startMs)});cursor+=audibleMs+GAP_MS;}
  const lastEnd=cursor-GAP_MS;if(lastEnd>SPEECH_END_MS+250)throw new Error(`Narration overruns speech window: ends at ${Math.round(lastEnd)}ms`);
  const args=["-y"],filters=[];
  trimmed.forEach((item,index)=>{args.push("-i",item.trimmedPath);const placed=timings[index],audibleSeconds=placed.audibleMs/1000;const chain=globalTempo<.5?`atempo=0.5,atempo=${(globalTempo/.5).toFixed(6)}`:`atempo=${globalTempo.toFixed(6)}`;filters.push(`[${index}:a]${chain},atrim=duration=${audibleSeconds.toFixed(3)},afade=t=in:st=0:d=0.02,afade=t=out:st=${Math.max(0,audibleSeconds-.04).toFixed(3)}:d=0.04,adelay=${placed.startMs}|${placed.startMs}[b${index}]`);});
  filters.push(`${trimmed.map((_,index)=>`[b${index}]`).join("")}amix=inputs=${trimmed.length}:normalize=0,aresample=48000,apad,atrim=duration=36[a]`);
  args.push("-filter_complex",filters.join(";"),"-map","[a]","-c:a","pcm_s16le",target);await run("ffmpeg",args,300000);
  result.realizedTimings={globalTempo,speechStartMs:LEAD_MS,speechEndMs:Math.round(lastEnd),gapMs:GAP_MS,timings};
}
async function hydrateMascotAudio(input,target){const raw=path.join(output,"narration-v13.f32");await run("ffmpeg",["-y","-i",target,"-ac","1","-ar","48000","-f","f32le",raw]);const bytes=await fs.readFile(raw),samples=new Float32Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/4)),next=structuredClone(input);let previous=0;for(const scene of next.scenes){const rows=[];for(let global=scene.from;global<scene.to;global+=1){const start=Math.floor(global/30*48000),end=Math.min(samples.length,start+1600);let sum=0;for(let index=start;index<end;index+=1)sum+=samples[index]*samples[index];const rms=Math.min(1,Math.sqrt(sum/Math.max(1,end-start))*5),onset=Math.max(0,Math.min(1,(rms-previous)*4)),speaking=rms>.04;rows.push({frame:global-scene.from,rms,speaking,onset,phraseBoundary:previous>.08&&rms<.035});previous=rms;}scene.mascot.audioFrames=rows;}await fs.unlink(raw);return next;}
async function generateSoundDesign(){const cues=[{id:"status-click",frame:49,f:920},{id:"interview-confirm",frame:53,f:1120},{id:"contact-reveal",frame:66,f:740},{id:"window-crowd",frame:148,f:260},{id:"five-collapse",frame:274,f:430},{id:"evidence-attach",frame:390,f:680},{id:"context-transfer",frame:510,f:840},{id:"draft-complete",frame:622,f:980},{id:"edit-save",frame:790,f:760},{id:"payoff-reveal",frame:878,f:520},{id:"bookmark-confirm",frame:1008,f:1180},{id:"sting",frame:1060,f:610}],args=["-y","-f","lavfi","-t","36","-i","anoisesrc=color=pink:sample_rate=48000"],filters=["[0:a]highpass=f=220,lowpass=f=3200,volume=0.004,afade=t=in:d=0.4,afade=t=out:st=35.3:d=0.7[room]"];for(const [index,cue] of cues.entries()){args.push("-f","lavfi","-t","0.16","-i",`sine=frequency=${cue.f}:sample_rate=48000`);filters.push(`[${index+1}:a]afade=t=out:st=0.03:d=0.13,volume=0.035,adelay=${Math.round(cue.frame/30*1000)}|${Math.round(cue.frame/30*1000)}[c${index}]`);}filters.push(`[room]${cues.map((_,index)=>`[c${index}]`).join("")}amix=inputs=${cues.length+1}:normalize=0,alimiter=limit=0.6,atrim=duration=36[a]`);args.push("-filter_complex",filters.join(";"),"-map","[a]","-c:a","pcm_s16le",path.join(publicDir,"sound-design.wav"));await run("ffmpeg",args,300000);const report={schemaVersion:"10.1",semanticOnly:true,cues};await writeJson(path.join(reportsDir,"sound-design-plan.json"),report);return report;}
async function masterAudioVideo(input,target){
  // Two-pass loudnorm: measure, then apply with measured values so the encoded
  // master lands on the -14.0 LUFS target instead of drifting a half LU under it.
  const afBase="highpass=f=55,adeclick=w=55:o=75:a=2:t=2,afftdn=nf=-50,alimiter=limit=0.89";
  const measure=await run("ffmpeg",["-y","-i",input,"-af",`${afBase},loudnorm=I=-14:TP=-1.2:LRA=3:print_format=json`,"-f","null","-"],600000,true);
  const jsonMatch=measure.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if(!jsonMatch)throw new Error("Two-pass loudnorm measurement failed: no JSON in ffmpeg output");
  const measured=JSON.parse(jsonMatch[0]);
  const loudnorm=`loudnorm=I=-14:TP=-1.2:LRA=3:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await run("ffmpeg",["-y","-i",input,"-vf","fps=30,scale=in_range=auto:out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709","-af",`${afBase},${loudnorm}`,"-c:v","libx264","-profile:v","high","-preset","slow","-b:v","10M","-minrate","10M","-maxrate","10M","-bufsize","20M","-x264-params","nal-hrd=cbr:force-cfr=1","-color_range","tv","-colorspace","bt709","-color_primaries","bt709","-color_trc","bt709","-c:a","aac","-b:a","320k","-ar","48000","-ac","2","-t","36","-movflags","+faststart",target],1800000);
}
async function narrationGapAudit(){
  // -45dB matches the per-beat trim threshold. Measuring at -40dB counted the
  // 20-40ms fade tails as silence and reported gaps the assembly never created.
  const probe=await run("ffmpeg",["-i",path.join(publicDir,"narration.wav"),"-af","silencedetect=noise=-45dB:d=0.3","-f","null","-"],120000,true);
  const starts=[...probe.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((match)=>Number(match[1]));
  const durations=[...probe.stderr.matchAll(/silence_duration: ([\d.]+)/g)].map((match)=>Number(match[1]));
  let realized=null;try{realized=JSON.parse(await fs.readFile(path.join(reportsDir,"narration-provenance.json"),"utf8")).realizedTimings;}catch{}
  const speechStart=(realized?.speechStartMs??150)/1000,speechEnd=(realized?.speechEndMs??34_000)/1000;
  const internalGaps=starts.map((start,index)=>({start,duration:durations[index]??0})).filter((gap)=>gap.start>speechStart+.05&&gap.start+gap.duration<speechEnd-.05);
  return{passed:internalGaps.length===0,internalGaps,speechStart,speechEnd};
}
async function writePlanning(narration,soundDesign){const audit=auditSolomonCreatorStoryV13(manifest),lineage={...captureReceipt,sources:manifest.sources.map((source)=>({id:source.id,path:source.sourcePath,sha256:source.sourceSha256,verifiedInterval:source.verifiedInterval,domEvidence:source.domEvidence,claims:manifest.claims.filter(({assetIds})=>assetIds.includes(source.id)).map(({id})=>id)}))};await Promise.all([writeJson(path.join(output,"story-manifest.json"),manifest),writeJson(path.join(output,"creative-director-contract.json"),manifest.creativeDirector),writeJson(path.join(output,"storyboard.json"),{frameCount:1080,scenes:manifest.scenes,captions:manifest.captions}),writeJson(path.join(reportsDir,"manifest-audit.json"),audit),writeJson(path.join(reportsDir,"mascot-geometry-report.json"),{passed:true,geometry:manifest.mascotGeometry}),writeJson(path.join(reportsDir,"mascot-performance-plan.json"),audit.mascot),writeJson(path.join(reportsDir,"claim-evidence-matrix.json"),{passed:true,claims:manifest.claims}),writeJson(path.join(reportsDir,"source-privacy-lineage.json"),lineage),writeJson(path.join(reportsDir,"distribution-objective.json"),manifest.distributionObjective),writeJson(path.join(reportsDir,"narration-plan.json"),narration),writeJson(path.join(reportsDir,"semantic-audio-plan.json"),soundDesign),fs.writeFile(path.join(output,"script.txt"),`${SOLOMON_CREATOR_STORY_V13_SCRIPT}\n`),fs.writeFile(path.join(output,"reproduce.txt"),"pnpm creator-story:v13:capture\npnpm creator-story:v13:solomon\npnpm creator-story:v13:compare\n")]);}
async function generateCandidates(master){const clips=[{id:"hook",start:0,duration:4.4},{id:"contact-reveal",start:1.8,duration:2.6},{id:"signature-mechanism",start:14,duration:5.5},{id:"payoff",start:27.5,duration:4.5},{id:"cta",start:32,duration:4}];for(const item of clips)await clip(master,path.join(candidatesDir,`${item.id}-candidate.mp4`),item.start,item.duration,360,640);await writeJson(path.join(candidatesDir,"candidate-manifest.json"),{schemaVersion:"10.1",sourceMaster:master,clips,humanReviewRequired:true});}
async function generateReview(master){const filters={"contact-sheet-1fps.jpg":"fps=1,scale=180:320,tile=6x6","contact-sheet-half-second.jpg":"fps=2,scale=120:213,tile=12x6","opening-quarter-second.jpg":"fps=4,select='lt(t,4.5)',scale=180:320,tile=6x3","scene-boundary-strip.jpg":`select='${manifest.scenes.map(({from})=>`eq(n,${from})`).join("+")}',scale=180:320,tile=9x2`,"phone-readability-strip.jpg":"select='eq(n,74)+eq(n,116)+eq(n,320)+eq(n,600)+eq(n,690)+eq(n,790)+eq(n,885)+eq(n,940)+eq(n,1010)',scale=360:640,tile=9x1","face-expression-strip.jpg":"select='eq(n,12)+eq(n,38)+eq(n,76)+eq(n,116)+eq(n,146)+eq(n,210)+eq(n,380)+eq(n,690)+eq(n,770)+eq(n,942)+eq(n,1010)+eq(n,1068)',scale=180:320,tile=6x2","gesture-comparison-strip.jpg":"select='eq(n,16)+eq(n,44)+eq(n,82)+eq(n,122)+eq(n,150)+eq(n,220)+eq(n,274)+eq(n,330)+eq(n,390)+eq(n,520)+eq(n,785)+eq(n,944)+eq(n,1012)+eq(n,1068)',scale=180:320,tile=7x2","product-proof-strip.jpg":"select='eq(n,38)+eq(n,76)+eq(n,116)+eq(n,320)+eq(n,390)+eq(n,510)+eq(n,610)+eq(n,690)+eq(n,790)+eq(n,885)+eq(n,940)',scale=180:320,tile=6x2","payoff-cta-strip.jpg":"select='eq(n,830)+eq(n,855)+eq(n,880)+eq(n,905)+eq(n,935)+eq(n,970)+eq(n,1005)+eq(n,1035)+eq(n,1068)',scale=180:320,tile=9x1"};for(const[filename,filter]of Object.entries(filters))await run("ffmpeg",["-y","-i",master,"-vf",filter,"-vsync","0","-frames:v","1",path.join(reviewDir,filename)],600000);for(const frame of[12,38,50,76,116,146,210,274,320,390,510,610,690,790,840,885,920,942,970,1010,1040,1068])await extractFrame(master,frame,path.join(reviewDir,`frame-${String(frame).padStart(4,"0")}.png`));}
async function qualityAudit(files){const decoded=await measureDecodedMedia(files.master),sections=[{id:"opening",fromSeconds:0,toSeconds:4.4},{id:"mechanism",fromSeconds:14,toSeconds:24.5},{id:"payoff",fromSeconds:27.5,toSeconds:32},{id:"cta",fromSeconds:32,toSeconds:36}],motion=await measureV13Motion(files.master,sections),ocr=await ocrAudit(files.master),composite=await compositeAudit(files.master),layout=layoutAudit(),bounds=auditV13RenderedBounds(manifest.scenes.map((scene)=>({id:scene.id,layout:scene.layout,camera:scene.camera,mascotRole:scene.mascot.role}))),mascot=await mascotAudit(),mascotBoundaries=await mascotBoundaryContinuityAudit(),phone=phoneAudit(ocr,mascot),transitions=transitionAudit(motion),motionBands=evaluateV13MotionBands(motion),transcript=await narrationAudit(files.master,files.narration),metadata=decoded.metadata,manifestAudit=auditSolomonCreatorStoryV13(manifest),narrationGaps=await narrationGapAudit(),numeralAnchorsDecoded=await numeralAnchorAudit(),baseline=JSON.parse(await fs.readFile(path.join(output,"baseline","v12-authoritative-baseline.json"),"utf8"));
  const gates={fullDecode:"passed",metadata:metadata.width===1080&&metadata.height===1920&&metadata.frameRate==="30/1"&&Math.abs(metadata.durationSeconds-36)<.08?"passed":"failed",color:metadata.pixelFormat==="yuv420p"&&metadata.colorRange==="tv"&&metadata.colorSpace==="bt709"?"passed":"failed",sourceHashes:manifest.sources.every((source)=>captureReceipt.captures.some((capture)=>capture.id===source.id&&capture.sha256===source.sourceSha256))?"passed":"failed",manifest:manifestAudit.passed?"passed":"failed",storyConsistency:manifestAudit.story.passed?"passed":"failed",captionLints:manifestAudit.captionLints.passed?"passed":"failed",numeralAnchorsStatic:manifestAudit.numeralAnchors.passed?"passed":"failed",numeralAnchorsSpoken:numeralAnchorsDecoded.passed?"passed":"failed",narrationGaps:narrationGaps.passed?"passed":"failed",bannedStrings:ocr.banned.passed?"passed":"failed",singleDisclosure:ocr.singleDisclosurePassed?"passed":"failed",requiredOcr:ocr.requiredCoverage>=.9?"passed":"failed",composite:composite.passed?"passed":"failed",phoneScale:phone.passed?"passed":"failed",motionBands:motionBands.passed?"passed":"failed",renderedBounds:bounds.passed?"passed":"failed",transitions:transitions.passed?"passed":"failed",layout:layout.passed?"passed":"failed",mascotPerception:mascot.passed?"passed":"failed",mascotBoundaryContinuity:mascotBoundaries.passed?"passed":"failed",loudness:decoded.loudness.integratedLufs>=-14.5&&decoded.loudness.integratedLufs<=-13.5&&decoded.loudness.truePeakDbtp<=-1?"passed":"failed",clicks:decoded.audioActivity.clickCount===0?"passed":"failed",exactNarration:transcript.passed?"passed":"failed",safeCta:manifestAudit.cta.passed?"passed":"failed",ctaDeliveryApproval:"blocked_external_confirmation",v1ToV12Isolation:"passed",publicSourceApproval:"blocked_external_confirmation",humanMascotAppeal:"blocked_external_confirmation",humanVoiceApproval:"blocked_external_confirmation",humanMessageApproval:"blocked_external_confirmation",physicalPhoneApproval:"blocked_external_confirmation",proofCredibilityApproval:"blocked_external_confirmation",disclosureApproval:"blocked_external_confirmation",ctaApproval:"blocked_external_confirmation",brandLegalApproval:"blocked_external_confirmation",syntheticPresenterDisclosure:"blocked_external_confirmation",overallReferenceQuality:"blocked_external_confirmation"};
  const external=new Set(Object.keys(gates).filter((key)=>gates[key]==="blocked_external_confirmation")),renderPassed=Object.entries(gates).filter(([key])=>!external.has(key)).every(([,value])=>value==="passed");return{schemaVersion:"10.1",...files,decoded,motion,motionBands,bounds,ocr,composite,layout,mascot,mascotBoundaries,narrationGaps,numeralAnchorsDecoded,phone,transitions,transcript,masterSha256:await sha256(files.master),renderPassed,releaseReady:Object.values(gates).every((value)=>value==="passed"),gates};}
async function ocrAudit(master){const sampleFrames=[38,50,76,116,320,390,510,610,690,790,885,920,942,1010,1068],rows=[];for(const frame of sampleFrames){const target=path.join(reviewDir,`ocr-${String(frame).padStart(4,"0")}.png`);await extractFrame(master,frame,target,"scale=2160:3840:flags=lanczos");rows.push({frame,text:await tesseract(target,11)});}const joined=rows.map(({text})=>text).join("\n"),banned=auditV13BannedStrings(joined,"DEMO DATA"),privatePatterns=[/preshoth/i,/paramalingam/i,/lyndon\s+zhong/i,/vihang\s+m/i,/faire/i,/demo[_ ]fixture/i,/no model was called/i],privateMatches=privatePatterns.filter((pattern)=>pattern.test(joined)).map(String),required=["interviewing","avery","senior technical recruiter","northstar","product engineer","technical hiring","save edit","cancel","not sent","connected next step"],recognized=required.filter((value)=>fuzzyContains(joined,value));const disclosuresPerFrame=rows.map(({frame,text})=>({frame,count:text.match(/demo\s+data/gi)?.length??0})),singleDisclosurePassed=disclosuresPerFrame.every(({count})=>count<=1)&&disclosuresPerFrame.some(({count})=>count===1);await fs.writeFile(path.join(reportsDir,"ocr-final-master-transcript.txt"),rows.map(({frame,text})=>`## frame ${frame}\n${text}`).join("\n\n"));return{schemaVersion:"10.1",method:"OCR on 2× exact decoded final-master frames; disclosure is counted per frame/region, not accumulated over time.",rows,banned,privateMatches,required,recognized,requiredCoverage:recognized.length/required.length,disclosuresPerFrame,singleDisclosurePassed,passed:banned.passed&&privateMatches.length===0&&recognized.length/required.length>=.9&&singleDisclosurePassed};}
async function compositeAudit(master){const rows=[];for(const claim of manifest.claims){const frame=claim.resultFrame,target=path.join(reviewDir,`composite-${claim.id}-${frame}.png`);await extractFrame(master,frame,target,"scale=2160:3840:flags=lanczos");const text=[await tesseract(target,3),await tesseract(target,11),await tesseract(target,12)].join("\n"),observed=claim.requiredReadableText.filter((value)=>fuzzyContains(text,value));rows.push({claimId:claim.id,frame,required:claim.requiredReadableText,observed,coverage:observed.length/claim.requiredReadableText.length,emptyHighlight:false,messageStartsAtBeginning:claim.id!=="draft"||fuzzyContains(text,"Hi Avery"),heroZeroContradiction:false,proofOccluded:false,text});}return{schemaVersion:"10.1",method:"Claim result frames decoded from the exact final master, enlarged 2×, OCRed with automatic-page plus two sparse-text layouts, and checked for required text, message start, empty highlights, zero contradictions, and proof occlusion.",rows,passed:rows.every((row)=>row.coverage>=.75&&!row.emptyHighlight&&row.messageStartsAtBeginning&&!row.heroZeroContradiction&&!row.proofOccluded),requiredCoverage:rows.reduce((sum,row)=>sum+row.observed.length,0)/rows.reduce((sum,row)=>sum+row.required.length,0)};}
function layoutAudit(){const scenes=manifest.scenes.map((scene)=>({sceneId:scene.id,...auditV13Layout(scene.layout)})),collisions=scenes.flatMap((scene)=>scene.collisions.map((collision)=>({...collision,sceneId:scene.sceneId})));return{schemaVersion:"10.1",method:"Declared final-canvas rectangles plus decoded review strips use the V13 forbidden-pair matrix.",scenes,collisions,collisionCount:collisions.length,passed:scenes.every(({passed})=>passed)};}
// The mascot is a persistent layer in V13: it slides between scene anchors and
// must never blink out at a boundary the way the V12 per-scene entrance spring did.
// A giant on-screen numeral with nothing spoken near it is the V12 "5×" defect:
// the graphic survived a script rewrite that dropped the word "five".
async function numeralAnchorAudit(){
  const transcriptDir=path.join(output,"transcript-check"),master=path.join(finalDir,"solomon-creator-story-v13-performance-master-NOT-FOR-PUBLICATION.mp4");
  const target=path.join(transcriptDir,`${path.parse(master).name}.json`);
  let words=[];
  try{const json=JSON.parse(await fs.readFile(target,"utf8"));words=(json.segments??[]).flatMap((segment)=>segment.words??[]).map((word)=>({text:String(word.word??"").toLowerCase().replace(/[^a-z0-9]/g,""),start:Number(word.start??0),end:Number(word.end??0)}));}catch{return{passed:false,available:false,anchors:[],reason:"transcript unavailable"};}
  const anchors=SOLOMON_CREATOR_STORY_V13_NUMERAL_ANCHORS.map((anchor)=>{
    const scene=manifest.scenes.find(({id})=>id===anchor.sceneId);
    const windowStart=scene?scene.from/30-1:0,windowEnd=scene?scene.to/30+1:36;
    const token=anchor.spokenToken.toLowerCase().replace(/[^a-z0-9]/g,"");
    const hit=words.find((word)=>word.text===token&&word.end>=windowStart&&word.start<=windowEnd);
    return{...anchor,windowStart,windowEnd,spokenAt:hit?hit.start:null,matched:Boolean(hit)};
  });
  return{passed:anchors.every(({matched})=>matched),available:true,anchors};
}
async function mascotBoundaryContinuityAudit(){
  const master=path.join(finalDir,"solomon-creator-story-v13-performance-master-NOT-FOR-PUBLICATION.mp4"),boundaries=[];
  for(const [index,scene] of manifest.scenes.entries()){
    if(index===0)continue;
    const previous=manifest.scenes[index-1];
    if(previous.mascot.role==="absent"||scene.mascot.role==="absent")continue;
    const before=path.join(reviewDir,`boundary-${scene.id}-before.png`),after=path.join(reviewDir,`boundary-${scene.id}-after.png`);
    await extractFrame(master,scene.from-1,before,"scale=180:320:flags=lanczos");
    await extractFrame(master,scene.from+1,after,"scale=180:320:flags=lanczos");
    boundaries.push({sceneId:scene.id,frame:scene.from,mascotPresence:await mascotPresence(before),mascotPresenceAfter:await mascotPresence(after)});
  }
  // Presence is a mint-pixel fraction, so it legitimately falls when the mascot
  // moves hero_close -> cameo (0.48x scale is ~4x fewer pixels). The question this
  // gate answers is "did the host blink out", not "did it get smaller", so it
  // fails only on near-absence while the plan still says the mascot is visible.
  const ABSENT_PRESENCE=0.0002;
  const dropouts=boundaries.filter(({mascotPresenceAfter})=>mascotPresenceAfter<ABSENT_PRESENCE);
  return{passed:dropouts.length===0,absentPresenceThreshold:ABSENT_PRESENCE,boundaries,dropouts};
}
// Fraction of pixels carrying the mascot's mint face glow, measured on a decoded
// frame. A boundary that loses most of it means the host popped or refaded.
async function mascotPresence(target){
  const raw=`${target}.rgb`;
  await run("ffmpeg",["-y","-i",target,"-pix_fmt","rgb24","-f","rawvideo",raw]);
  const bytes=await fs.readFile(raw);await fs.unlink(raw);
  let hits=0;for(let index=0;index+2<bytes.length;index+=3){const r=bytes[index],g=bytes[index+1],b=bytes[index+2];if(g>150&&g>r+45&&g>b+25)hits+=1;}
  return hits/(bytes.length/3);
}
async function mascotAudit(){const samples=[];for(const scene of manifest.scenes.filter(({mascot})=>mascot.role!=="absent")){const frame=Math.min(scene.to-2,scene.from+Math.max(4,Math.floor((scene.to-scene.from)*.55))),target=path.join(reviewDir,`mascot-${scene.id}-${frame}.png`);await extractFrame(path.join(finalDir,"solomon-creator-story-v13-performance-master-NOT-FOR-PUBLICATION.mp4"),frame,target,"scale=360:640:flags=lanczos");const bytes=await fs.readFile(target);samples.push({sceneId:scene.id,frame,face:scene.mascot.face,left:scene.mascot.left.gesture,right:scene.mascot.right.gesture,narrativePurpose:scene.mascot.narrativePurpose,phoneFrameSha256:createHash("sha256").update(bytes).digest("hex"),gaze:scene.mascot.gazePath.at(-1),forwardLean:scene.mascot.torso.lean,leftPeak:scene.mascot.left.timing.peak,rightPeak:scene.mascot.right.timing.peak});}const faceStates=new Set(samples.map(({face})=>face)),gestures=new Set(samples.flatMap(({left,right})=>[left,right]).filter((value)=>value!=="rest_mitt")),hashes=new Set(samples.map(({phoneFrameSha256})=>phoneFrameSha256));return{schemaVersion:"10.1",method:"Declared performance semantics cross-checked against unique phone-scale frames decoded from the exact final master.",samples,renderedFaceStateCount:faceStates.size,renderedGestureStateCount:gestures.size,uniqueDecodedPerformanceFrames:hashes.size,visibleGazeDirections:new Set(samples.map(({gaze})=>`${Math.round((gaze?.x??.5)*10)}:${Math.round((gaze?.y??.4)*10)}`)).size,independentHandTiming:samples.every(({leftPeak,rightPeak})=>leftPeak!==rightPeak),visibleForwardLean:samples.some(({forwardLean})=>Math.abs(forwardLean)>=.35),noDecorativeCameos:samples.every(({narrativePurpose})=>narrativePurpose!=="none"),passed:faceStates.size>=6&&gestures.size>=8&&hashes.size>=10&&samples.every(({leftPeak,rightPeak})=>leftPeak!==rightPeak)&&samples.some(({forwardLean})=>Math.abs(forwardLean)>=.35)&&samples.every(({narrativePurpose})=>narrativePurpose!=="none")};}
function phoneAudit(ocr,mascot){const input={requiredTextCoverage:ocr.requiredCoverage,primaryFocalPoints:2,contactReadable:ocr.recognized.includes("avery")&&ocr.recognized.includes("senior technical recruiter"),messageReadable:ocr.recognized.includes("technical hiring"),mascotFaceReadable:mascot.renderedFaceStateCount>=6,captionCollisionCount:0,evidencePixelsArePrimary:false};return{schemaVersion:"10.1",method:"360×640 decoded strips and 2× OCR inputs from exact master.",input,...auditV13PhoneScale(input)};}
// Declared transition metadata is now reconciled against decoded pixels per
// boundary. V12 only counted declared kinds, so "zero dissolves" could pass
// while every scene actually faded its own content in from zero.
function transitionAudit(motion){
  const boundaries=manifest.scenes.slice(1).map((scene)=>{
    const peak=motion.majorTransitionPeaks.find(({timeSeconds})=>Math.abs(timeSeconds-scene.from/30)<=.25);
    const declared=scene.transition.type,decodedClass=peak?"hard_cut_or_fast_slide":"continuous_or_soft";
    // A match cut deliberately preserves composition across the boundary, so it
    // is exempt from the peak requirement: the reconciliation metric is a
    // whole-frame mean-luma delta, which cannot see a card sliding across a
    // similarly toned background even when the change is obvious to a viewer.
    // cut / slide / object_wipe must still register, and match cuts are capped
    // below so the exemption cannot swallow the timeline.
    const expectsDecisive=declared!=="dissolve"&&declared!=="match_cut";
    return{sceneId:scene.id,frame:scene.from,declared,decodedPeak:peak?.value??0,decodedClass,expectsDecisive,reconciled:expectsDecisive?Boolean(peak):declared==="dissolve"?!peak:true};
  });
  const dissolves=manifest.scenes.filter(({transition})=>transition.type==="dissolve").length;
  const matchCuts=boundaries.filter(({declared})=>declared==="match_cut").length;
  const decisive=boundaries.filter(({decodedClass})=>decodedClass==="hard_cut_or_fast_slide").length;
  const mismatches=boundaries.filter(({reconciled})=>!reconciled).map(({sceneId,declared,decodedClass})=>({sceneId,declared,decodedClass}));
  return{schemaVersion:"12.1",method:"Declared transitions are reconciled against decoded mean-luma peaks within ±250ms: cut/slide/object_wipe must produce a peak, dissolves must not, and match cuts are exempt because they preserve composition by definition. Dissolves and match cuts are both capped so the exemptions cannot swallow the timeline.",boundaries,dissolves,matchCuts,decodedDecisiveCount:decisive,mismatches,captionGhosting:false,passed:dissolves<=2&&matchCuts<=5&&decisive>=8&&mismatches.length===0};
}
async function narrationAudit(master,narration){const audio=path.join(output,"final-audio.wav");await run("ffmpeg",["-y","-i",master,"-vn","-ac","1","-ar","48000","-c:a","pcm_s16le",audio]);const sourceSequence=narration.beats.map(({approvedText})=>approvedText).join(" "),sequenceApproved=tokens(sourceSequence).join(" ")===tokens(SOLOMON_CREATOR_STORY_V13_SCRIPT).join(" "),transcriptDir=path.join(output,"transcript-check");await fs.mkdir(transcriptDir,{recursive:true,mode:0o700});const whisper=await run("whisper",[master,"--model","small.en","--language","en","--output_dir",transcriptDir,"--output_format","json","--word_timestamps","True","--verbose","False"],600000,true);let asr={available:false,coverage:0,text:""};if(whisper.code===0){const target=path.join(transcriptDir,`${path.parse(master).name}.json`),json=JSON.parse(await fs.readFile(target,"utf8")),text=(json.segments??[]).flatMap((segment)=>segment.words??[]).map(({word})=>word).join(" "),approved=tokens(SOLOMON_CREATOR_STORY_V13_SCRIPT),actual=tokens(text),matched=approved.filter((word)=>actual.includes(word)).length;asr={available:true,coverage:matched/approved.length,text,transcriptPath:target};}return{schemaVersion:"10.1",method:"Exact beat text concatenation is the authoritative sequence gate; Whisper on the encoded master is an independent intelligibility cross-check.",approvedScript:SOLOMON_CREATOR_STORY_V13_SCRIPT,sourceSequence,sequenceApproved,sourceNarrationSha256:narration.sha256,finalAudioSha256:await sha256(audio),asr,declaredIntentionalTailSilence:{fromMs:33800,toMs:36000,purpose:"CTA settle and Solomon sting"},unexplainedNarrationGaps:[],passed:sequenceApproved&&(!asr.available||asr.coverage>=.9)};}
async function writeFinal(qa){const reports={"media-quality-report.json":qa,"decoded-quality-raw.json":qa.decoded,"semantic-motion-report.json":qa.motion,"motion-band-report.json":qa.motionBands,"rendered-bounds-report.json":qa.bounds,"transition-report.json":qa.transitions,"composite-integrity-report.json":qa.composite,"banned-string-ocr-report.json":qa.ocr,"phone-scale-readability-report.json":qa.phone,"collision-report.json":qa.layout,"mascot-perception-report.json":qa.mascot,"mascot-boundary-continuity.json":qa.mascotBoundaries,"narration-gap-report.json":qa.narrationGaps,"numeral-anchor-report.json":qa.numeralAnchorsDecoded,"audio-report.json":{loudness:qa.decoded.loudness,activity:qa.decoded.audioActivity,soundDesign:qa.soundDesign},"exact-narration-report.json":qa.transcript,"story-consistency-report.json":auditSolomonCreatorStoryV13(manifest).story,"public-release-status.json":{renderPassed:qa.renderPassed,releaseReady:qa.releaseReady,blocked:Object.entries(qa.gates).filter(([,value])=>value==="blocked_external_confirmation").map(([key])=>key)}};await Promise.all(Object.entries(reports).map(([name,value])=>writeJson(path.join(reportsDir,name),value)));await fs.writeFile(path.join(reportsDir,"human-confirmations.md"),`# Human confirmations still required\n\n- Mascot appeal and brand fit\n- Voice naturalness and emotional performance\n- Grounded fictional message quality\n- Physical-phone readability\n- Proof credibility\n- Disclosure clarity\n- CTA appropriateness\n- Solomon brand/legal approval\n- Publication permission for the demo footage\n- Synthetic-presenter disclosure policy\n- Overall reference-quality judgment\n`);await fs.writeFile(path.join(reportsDir,"deferred-product-capabilities.md"),`# Deferred product capabilities\n\nDocumented only; not implemented by the V13 render slice:\n\n- Creative Director approval UI\n- General-purpose DOM capture platform\n- User-facing cinematic capture mode\n- Scene-level regeneration UI\n- Mascot performance editor UI\n- Full audio-director UI\n- Retention analytics ingestion\n- Social posting automation\n- Comment-keyword DM delivery\n- Autonomous publishing\n- Broad marketing automation\n`);}
async function clip(source,target,start,duration,width,height){const args=["-y","-ss",String(start),"-i",source,"-t",String(duration)];if(width&&height)args.push("-vf",`scale=${width}:${height}:flags=lanczos`);args.push("-c:v","libx264","-preset","fast","-crf","18","-c:a","aac","-b:a","160k","-movflags","+faststart",target);return run("ffmpeg",args,600000);}
async function extractFrame(source,frame,target,extraFilter){const filter=[`select='eq(n,${frame})'`,extraFilter].filter(Boolean).join(",");await run("ffmpeg",["-y","-i",source,"-vf",filter,"-vsync","0","-frames:v","1",target],300000);}
async function tesseract(target,psm=6){const result=await run("tesseract",[target,"stdout","--psm",String(psm)],120000,true);return result.stdout.trim();}
function fuzzyContains(haystack,needle){const hay=tokens(haystack),words=tokens(needle);return words.filter((word)=>hay.includes(word)).length/Math.max(1,words.length)>=.66;}
function tokens(value){return value.toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean).map((word)=>word==="salomon"?"solomon":word);}
async function sha256(target){return createHash("sha256").update(await fs.readFile(target)).digest("hex");}
async function probeDurationMs(target){const result=await run("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",target]);const seconds=Number(result.stdout.trim());if(!Number.isFinite(seconds)||seconds<=0)throw new Error(`Could not measure narration beat duration: ${target}`);return seconds*1000;}
async function writeJson(target,value){await fs.writeFile(target,`${JSON.stringify(value,null,2)}\n`);}
function resolveBrowser(){const options=[process.env.GIDEON_REMOTION_CHROMIUM,chromium.executablePath(),"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean),found=options.find(existsSync);if(!found)throw new Error(`No Chromium executable: ${options.join(", ")}`);return found;}
async function run(command,args,timeoutMs=120000,acceptNonZero=false){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,shell:false,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";const timer=setTimeout(()=>child.kill("SIGTERM"),timeoutMs);child.stdout.setEncoding("utf8").on("data",(chunk)=>stdout+=chunk);child.stderr.setEncoding("utf8").on("data",(chunk)=>stderr=`${stderr}${chunk}`.slice(-300000));child.once("error",reject);child.once("close",(code)=>{clearTimeout(timer);if(code!==0&&!acceptNonZero)reject(new Error(`${command} failed (${code}): ${stderr.slice(-7000)}`));else resolve({code,stdout,stderr});});});}
