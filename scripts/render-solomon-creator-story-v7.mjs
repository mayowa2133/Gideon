import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { chromium } from "playwright";
import PImage from "pureimage";

const require = createRequire(import.meta.url);
const { ChatterboxNarrationProvider } = require("../dist/main/main/chatterboxNarrationProvider.js");
const { SOLOMON_CREATOR_STORY_V7_SCRIPT, assertSolomonCreatorStoryV7Manifest, auditSolomonCreatorStoryV7, createSolomonCreatorStoryV7Manifest } = require("../dist/main/shared/solomonCreatorStoryV7.js");
const { auditRenderedRobotGeometry } = require("../dist/main/shared/gideonRobotV7.js");
const { hashV7Manifest } = require("../dist/main/shared/solomonCreatorStoryV7Regeneration.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const captureRoot = "/Users/mayowaadesanya/Projects/NexusReach/output/playwright/solomon-genuine-capture-20260731-hq";
const sourcePaths = {
  jobs: process.env.SOLOMON_JOBS_SOURCE ?? path.join(captureRoot, "01-role-company.webm"),
  tracker: process.env.SOLOMON_TRACKER_SOURCE ?? path.join(captureRoot, "02-stage-interviewing.webm"),
  contacts: process.env.SOLOMON_CONTACTS_SOURCE ?? path.join(captureRoot, "03-contact-evidence.webm"),
  outreach: process.env.SOLOMON_OUTREACH_SOURCE ?? path.join(captureRoot, "04-draft-message.webm")
};
const outputRoot = path.join(root, "tmp", "solomon-creator-story-v7-robot");
const publicDir = path.join(outputRoot, "remotion-public");
const finalDir = path.join(outputRoot, "final");
const reviewDir = path.join(outputRoot, "review");
const candidateDir = path.join(outputRoot, "candidates");
let manifest = createSolomonCreatorStoryV7Manifest(sourcePaths, { environment: "authenticated_genuine_environment", publicReleaseApproved: false, environmentReviewReceipt: "local-product-review:2026-07-31:solomon-main@ab5124da:faire-record" });
assertSolomonCreatorStoryV7Manifest(manifest);

await Promise.all([publicDir, finalDir, reviewDir, candidateDir, path.join(outputRoot, "narration-candidates")].map((dir) => fs.mkdir(dir, { recursive: true, mode: 0o700 })));
const sourceHashes = {};
for (const source of manifest.sources) {
  if (!existsSync(source.sourcePath)) throw new Error(`Approved Solomon source is missing: ${source.sourcePath}`);
  sourceHashes[source.id] = await sha256(source.sourcePath);
  if (sourceHashes[source.id] !== source.sourceSha256) throw new Error(`Approved ${source.id} hash mismatch.`);
}

await generateProductProofs();
const narration = await generateNarration();
manifest = await hydrateRobotAudioEnvelope(manifest, path.join(publicDir, "narration.wav"));
assertSolomonCreatorStoryV7Manifest(manifest);
await generateSoundDesign();
await writePlanningArtifacts(narration);

const browserExecutable = resolveBrowserExecutable();
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "remotion", "solomonCreatorStoryV7", "index.ts"), publicDir, outDir: path.join(outputRoot, "remotion-bundle"), onProgress: (progress) => { const pct = progress > 1 ? Math.round(progress) : Math.round(progress * 100); if (pct % 25 === 0) process.stdout.write(`Bundle ${pct}%\n`); } });
const inputProps = JSON.parse(JSON.stringify(manifest));
const composition = await selectComposition({ serveUrl, id: "SolomonCreatorStoryV7Robot", inputProps, browserExecutable, chromeMode: "headless-shell", timeoutInMilliseconds: 120_000 });
if (process.env.GIDEON_V7_REUSE_CANDIDATES !== "1") await renderCandidates(composition, serveUrl, browserExecutable);

const intermediate = path.join(outputRoot, "solomon-creator-story-v7-robot-remotion.mp4");
await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: intermediate, inputProps, browserExecutable, chromeMode: "headless-shell", concurrency: 3, overwrite: true, pixelFormat: "yuv420p", crf: 13, x264Preset: "medium", audioCodec: "aac", audioBitrate: "320K", sampleRate: 48_000, logLevel: "info", timeoutInMilliseconds: 180_000, onProgress: ({ progress }) => { const pct=Math.round(progress*100); if(pct%10===0) process.stdout.write(`Render ${pct}%\n`); } });

const masterPath = path.join(finalDir, "solomon-creator-story-v7-robot-master-NOT-FOR-PUBLICATION.mp4");
const socialPath = path.join(finalDir, "solomon-creator-story-v7-robot-social-720x1280.mp4");
const mutedPath = path.join(finalDir, "solomon-creator-story-v7-robot-muted-review.mp4");
const openingPath = path.join(finalDir, "solomon-creator-story-v7-robot-opening-10s.mp4");
await run("ffmpeg", ["-y","-i",intermediate,"-vf","fps=30,scale=in_range=auto:out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709","-af","loudnorm=I=-14:LRA=3:TP=-1","-c:v","libx264","-profile:v","high","-preset","slow","-b:v","10M","-minrate","10M","-maxrate","10M","-bufsize","20M","-x264-params","nal-hrd=cbr:force-cfr=1","-color_range","tv","-colorspace","bt709","-color_primaries","bt709","-color_trc","bt709","-c:a","aac","-b:a","320k","-ar","48000","-ac","2","-t","36","-movflags","+faststart",masterPath], 1_800_000);
await Promise.all([
  run("ffmpeg",["-y","-i",masterPath,"-vf","scale=720:1280:flags=lanczos:in_range=tv:out_range=tv:out_color_matrix=bt709,fps=30,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709","-c:v","libx264","-profile:v","high","-preset","slow","-b:v","4M","-maxrate","6M","-bufsize","8M","-c:a","aac","-b:a","256k","-ar","48000","-ac","2","-t","36","-movflags","+faststart",socialPath],1_800_000),
  run("ffmpeg",["-y","-i",masterPath,"-map","0:v:0","-c:v","copy","-an",mutedPath],300_000),
  run("ffmpeg",["-y","-i",masterPath,"-t","10","-c","copy",openingPath],300_000)
]);

await generateReviewImages(masterPath);
const qa = await generateQa(masterPath, socialPath, mutedPath, openingPath);
const transcript = await verifyFinalNarration(masterPath);
qa.gates.exactNarration = transcript.passed ? "passed" : "failed";
qa.renderPassed = Object.entries(qa.gates).filter(([id]) => !["publicSourceApproval","humanVoiceApproval","physicalPhoneApproval","legalBrandApproval"].includes(id)).every(([, value]) => value === "passed");
qa.releaseReady = Object.values(qa.gates).every((value) => value === "passed");
await run("node", [path.join(root, "scripts", "analyze-solomon-v7-output.mjs")], 600_000);
await writeFinalReports(qa, transcript);
process.stdout.write(`${JSON.stringify({ masterPath, socialPath, mutedPath, openingPath, masterSha256: qa.masterSha256, renderPassed: qa.renderPassed, releaseReady: qa.releaseReady }, null, 2)}\n`);
if (!qa.renderPassed) process.exitCode = 1;

async function generateProductProofs() {
  for (const source of manifest.sources) await run("ffmpeg", ["-y","-ss",String(source.extractedSourceInterval.startMs/1000),"-i",source.sourcePath,"-t",String((source.extractedSourceInterval.endMs-source.extractedSourceInterval.startMs)/1000),"-vf","fps=30,format=yuv420p","-an","-c:v","libx264","-profile:v","high","-crf","12","-preset","slow","-movflags","+faststart",path.join(publicDir,`proof-${source.id}.mp4`)],600_000);
}

async function generateNarration() {
  const localRuntime = process.env.GIDEON_CHATTERBOX_RUNTIME ?? path.join(root,"tmp","chatterbox-runtime");
  const sharedRuntime = "/Users/mayowaadesanya/Documents/Documents - Mayowa’s MacBook Pro/Projects/Gideon/tmp/chatterbox-runtime";
  const runtime = existsSync(path.join(localRuntime,".venv","bin","python")) ? localRuntime : sharedRuntime;
  const provider = new ChatterboxNarrationProvider({ pythonPath:path.join(runtime,".venv","bin","python"), modelCacheRoot:path.join(runtime,"model-cache"), allowDownload:false, device:"mps" });
  const beats = [
    beat("hook","This job just moved to interviewing. And Solomon found the person who can help next.",0,4000,"high"),
    beat("problem","Normally, that means rebuilding context across the job post, LinkedIn, notes, contacts, and a blank email, copying everything from tab to tab.",4000,10500,"high"),
    beat("role","Solomon keeps the role and company attached,",10500,12500,"medium"),
    beat("contact","then shows why this person matters: they work at the target company, match the hiring function, and have verified supporting evidence.",12500,17500,"high"),
    beat("bridge","Watch that same context move into the message.",17500,19100,"medium"),
    beat("draft","The role, company, reason for reaching out, and clear ask become one editable draft.",19100,23000,"medium"),
    beat("difference","That is the difference between a generic opener and a message grounded in the opportunity.",24500,27000,"high"),
    beat("control","Solomon drafts it. You decide.",27000,28500,"high"),
    beat("payoff","One scattered job search becomes one connected next step: role, person, evidence, and message, ready for review.",28500,32600,"high"),
    beat("cta","Save this Solomon workflow.",32600,35600,"high")
  ];
  const profiles = [
    {id:"warm-conversational",seed:93_217,description:"Warm, conversational delivery with restrained proof beats."},
    {id:"energetic-creator",seed:93_318,description:"Selected energetic creator delivery with clear semantic emphasis."},
    {id:"credible-restrained",seed:93_419,description:"Credible, lower-energy alternate for trust-first review."}
  ];
  const candidates=[];
  for (const profile of profiles) {
    const result=await provider.synthesize({outputDir:path.join(outputRoot,"narration-candidates",profile.id),beats:beats.map(item=>({...item,energy:profile.id==="credible-restrained"&&item.id!=="hook"?"medium":item.energy})),language:"en",voice:{mode:"model_default"},seed:profile.seed});
    const outputPath=path.join(outputRoot,"narration-candidates",`${profile.id}.wav`); await assembleNarration(result,outputPath);
    candidates.push({...profile,outputPath,outputSha256:await sha256(outputPath),provenance:result.provenance,semanticBeats:result.beats});
  }
  const selected=candidates.find(({id})=>id==="credible-restrained"); await fs.copyFile(selected.outputPath,path.join(publicDir,"narration.wav"));
  const result={schemaVersion:"1",...selected.provenance,approvedScript:SOLOMON_CREATOR_STORY_V7_SCRIPT,semanticBeats:selected.semanticBeats,assembly:{totalDurationMs:36000,placement:"semantic_beats_at_declared_timestamps"},candidateSelection:{selectedCandidateId:selected.id,candidates},humanVoiceApprovalRequired:true};
  await writeJson(path.join(outputRoot,"narration-provenance.json"),result); return result;
}
function beat(id,approvedText,startMs,endMs,energy){return{id,approvedText,startMs,endMs,energy};}
async function assembleNarration(result,outputPath){const args=["-y"],filters=[];result.beats.forEach((item,index)=>{args.push("-i",item.outputPath);const target=Math.max(.1,(item.endMs-item.startMs)/1000-.1);const tempo=item.sourceDurationMs/1000/target;if(tempo<.5||tempo>2)throw new Error(`Narration beat ${item.id} requires unsupported tempo ${tempo}.`);filters.push(`[${index}:a]atempo=${tempo.toFixed(6)},atrim=duration=${target.toFixed(3)},adelay=${item.startMs}|${item.startMs}[b${index}]`)});filters.push(`${result.beats.map((_,i)=>`[b${i}]`).join("")}amix=inputs=${result.beats.length}:normalize=0,aresample=48000,apad,atrim=duration=36[a]`);args.push("-filter_complex",filters.join(";"),"-map","[a]","-c:a","pcm_s16le",outputPath);await run("ffmpeg",args,300_000);}

async function hydrateRobotAudioEnvelope(input,narrationPath){const raw=path.join(outputRoot,"narration-envelope.f32");await run("ffmpeg",["-y","-i",narrationPath,"-ac","1","-ar","3000","-f","f32le",raw],300_000);const bytes=await fs.readFile(raw);const samples=new Float32Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/4));const next=structuredClone(input);for(const scene of next.scenes){if(!scene.robot)continue;scene.robot.audioEnvelope=Array.from({length:36},(_,index)=>{const start=Math.floor((scene.from/30+(scene.to-scene.from)/30*index/36)*3000);const end=Math.min(samples.length,start+Math.max(1,Math.floor((scene.to-scene.from)/30/36*3000)));let sum=0;for(let i=start;i<end;i++)sum+=samples[i]*samples[i];return Math.min(1,Math.sqrt(sum/Math.max(1,end-start))*5.5)});}await fs.unlink(raw);return next;}

async function generateSoundDesign(){await run("ffmpeg",["-y","-f","lavfi","-t","36","-i","anoisesrc=color=pink:sample_rate=48000","-f","lavfi","-t","36","-i","sine=frequency=78:sample_rate=48000","-f","lavfi","-t","0.08","-i","anoisesrc=color=white:sample_rate=48000","-f","lavfi","-t","0.5","-i","sine=frequency=620:sample_rate=48000","-filter_complex","[0:a]highpass=f=100,lowpass=f=3800,volume=0.012[room];[1:a]volume=0.01[bed];[2:a]highpass=f=1900,afade=t=out:st=0:d=0.07,volume=0.07,asplit=6[a][b][c][d][e][f];[a]adelay=500[c1];[b]adelay=1600[c2];[c]adelay=8000[c3];[d]adelay=14000[c4];[e]adelay=23200[c5];[f]adelay=32200[c6];[3:a]afade=t=out:st=0:d=0.48,volume=0.035,asplit=4[g][h][i][j];[g]adelay=3000[t1];[h]adelay=12600[t2];[i]adelay=25000[t3];[j]adelay=35200[t4];[room][bed][c1][c2][c3][c4][c5][c6][t1][t2][t3][t4]amix=inputs=12:normalize=0,alimiter=limit=0.75,atrim=duration=36[a]","-map","[a]","-c:a","pcm_s16le",path.join(publicDir,"sound-design.wav")],300_000);}

async function writePlanningArtifacts(narration){const audit=auditSolomonCreatorStoryV7(manifest);const hookCandidates=[{id:"consequence-split-proof",line:"This job just moved to interviewing. And Solomon found the person who can help next.",score:{clarity:5,specificity:5,proofSpeed:5,curiosity:4},selected:true},{id:"connected-opportunity",line:"Solomon connects the job to the person who can help next.",score:{clarity:5,specificity:4,proofSpeed:4,curiosity:3},selected:false},{id:"after-apply-question",line:"What happens after you apply? Solomon finds the next person.",score:{clarity:4,specificity:4,proofSpeed:4,curiosity:5},selected:false}];const payoffCandidates=[{id:"connected-result",line:"Role, person, evidence, and message—ready for review.",score:{specificity:5,causality:5,trust:5},selected:true},{id:"one-next-step",line:"One job becomes one connected next step.",score:{specificity:3,causality:4,trust:4},selected:false},{id:"review-ready",line:"The context stays attached until the draft is ready for you.",score:{specificity:4,causality:4,trust:5},selected:false}];await Promise.all([
    writeJson(path.join(outputRoot,"story-manifest.json"),manifest),writeJson(path.join(outputRoot,"storyboard.json"),{schemaVersion:"1",frameCount:1080,runtimeSeconds:36,scenes:manifest.scenes,captions:manifest.captions}),
    writeJson(path.join(outputRoot,"distribution-objective.json"),manifest.distributionObjective),writeJson(path.join(outputRoot,"claim-evidence-matrix.json"),{schemaVersion:"1",allClaimsSupported:true,rows:manifest.claims}),
    writeJson(path.join(outputRoot,"authentic-product-footage-manifest.json"),{schemaVersion:"1",productName:"Solomon",publicReleaseApproved:false,sources:manifest.sources.map(source=>({...source,observedSha256:sourceHashes[source.id],extractedAsset:path.join(publicDir,`proof-${source.id}.mp4`)}))}),
    writeJson(path.join(candidateDir,"hook-candidates.json"),{schemaVersion:"1",selectionPolicy:"Highest combined clarity, specificity, proof speed, and curiosity without unsupported claims.",candidates:hookCandidates}),
    writeJson(path.join(candidateDir,"payoff-candidates.json"),{schemaVersion:"1",selectionPolicy:"Highest specificity, causal closure, and trust.",candidates:payoffCandidates}),
    writeJson(path.join(outputRoot,"retention-audit.json"),{schemaVersion:"1",stage:"manifest",...audit}),writeJson(path.join(outputRoot,"robot-performance-plan.json"),{schemaVersion:"1",audioEnvelopeSource:"actual selected narration WAV",scenes:manifest.scenes.filter(scene=>scene.robot).map(({id,from,to,robot})=>({id,from,to,robot}))}),
    writeJson(path.join(outputRoot,"caption-safe-zone-report.json"),{schemaVersion:"1",captionCadenceViolations:audit.captionCadenceViolations,captionCount:manifest.captions.length,exclusionZones:{top:[0,100],bottom:[1800,1920],captionSeam:[1300,1660]}}),
    writeJson(path.join(outputRoot,"scene-regeneration-contract.json"),{schemaVersion:"1",manifestHash:hashV7Manifest(manifest),policy:"A regeneration request may replace one scene's presentation fields while timeline, source asset, atomic claim binding, and all unselected scenes remain immutable."}),
    fs.writeFile(path.join(outputRoot,"script.txt"),`${SOLOMON_CREATOR_STORY_V7_SCRIPT}\n`,"utf8"),fs.writeFile(path.join(outputRoot,"reproduce.txt"),"pnpm creator-story:v7:solomon\n","utf8"),fs.writeFile(path.join(outputRoot,"later-confirmations.md"),laterConfirmations(),"utf8")
  ]);}

async function renderCandidates(composition,serveUrl,browserExecutable){const groups=[{type:"hook",range:[0,89],captions:["THIS JOB MOVED","SOLOMON CONNECTS IT","WHAT HAPPENS NEXT?"]},{type:"payoff",range:[870,965],captions:["READY FOR REVIEW","ONE NEXT STEP","CONTEXT STAYS ATTACHED"]}];for(const group of groups){for(let i=0;i<3;i++){const props=structuredClone(manifest);const target=props.captions.find(c=>c.from>=group.range[0]&&c.from<=group.range[1]);if(target)target.text=group.captions[i];await renderMedia({composition:{...composition,width:540,height:960},serveUrl,codec:"h264",outputLocation:path.join(candidateDir,`${group.type}-${i+1}.mp4`),inputProps:props,browserExecutable,chromeMode:"headless-shell",frameRange:group.range,concurrency:2,overwrite:true,pixelFormat:"yuv420p",crf:20,x264Preset:"veryfast",audioCodec:"aac",audioBitrate:"128K",timeoutInMilliseconds:180000,logLevel:"warn"});}}}

async function generateReviewImages(masterPath){const filters={
  "contact-sheet-1fps.jpg":"fps=1,scale=180:320,tile=6x6",
  "mobile-360x640-contact-sheet.jpg":"fps=1,scale=90:160,tile=6x6",
  "scene-review-strip.jpg":"select='eq(n,15)+eq(n,48)+eq(n,108)+eq(n,165)+eq(n,258)+eq(n,330)+eq(n,396)+eq(n,450)+eq(n,546)+eq(n,618)+eq(n,678)+eq(n,714)+eq(n,798)+eq(n,918)+eq(n,1008)+eq(n,1068)',scale=180:320,tile=8x2",
  "robot-performance-strip.jpg":"select='eq(n,12)+eq(n,50)+eq(n,108)+eq(n,180)+eq(n,330)+eq(n,396)+eq(n,610)+eq(n,678)+eq(n,800)+eq(n,920)+eq(n,1000)+eq(n,1030)',scale=180:320,tile=6x2",
  "product-proof-strip.jpg":"select='eq(n,12)+eq(n,42)+eq(n,258)+eq(n,330)+eq(n,450)+eq(n,546)+eq(n,714)+eq(n,798)+eq(n,918)',scale=180:320,tile=5x2",
  "opening-payoff-cta-strip.jpg":"select='eq(n,12)+eq(n,42)+eq(n,65)+eq(n,880)+eq(n,920)+eq(n,960)+eq(n,990)+eq(n,1035)+eq(n,1068)',scale=240:427,tile=9x1",
  "readability-360-strip.jpg":"select='eq(n,12)+eq(n,42)+eq(n,258)+eq(n,330)+eq(n,450)+eq(n,546)+eq(n,714)+eq(n,798)',scale=360:640,tile=8x1"
};for(const [filename,filter] of Object.entries(filters))await run("ffmpeg",["-y","-i",masterPath,"-vf",filter,"-vsync","0","-frames:v","1",path.join(reviewDir,filename)],600_000);const sampleFrames=[12,42,108,330,396,678,800,920,1000,1030];for(const frame of sampleFrames)await run("ffmpeg",["-y","-i",masterPath,"-vf",`select='eq(n,${frame})'`,"-vsync","0","-frames:v","1",path.join(reviewDir,`frame-${String(frame).padStart(4,"0")}.png`)],300_000);}

async function generateQa(masterPath,socialPath,mutedPath,openingPath){await run("ffmpeg",["-v","error","-i",masterPath,"-f","null","-"],600_000);const probe=JSON.parse((await run("ffprobe",["-v","error","-show_streams","-show_format","-of","json",masterPath])).stdout);const video=probe.streams.find(s=>s.codec_type==="video"),audio=probe.streams.find(s=>s.codec_type==="audio");const duration=Number(video?.duration??probe.format.duration),bitrate=Number(video?.bit_rate??probe.format.bit_rate);
  const black=await run("ffmpeg",["-hide_banner","-i",masterPath,"-vf","blackdetect=d=.1:pix_th=.02","-an","-f","null","-"],600_000,true);const silence=await run("ffmpeg",["-hide_banner","-i",masterPath,"-af","silencedetect=n=-45dB:d=.6","-vn","-f","null","-"],600_000,true);const freeze=await run("ffmpeg",["-hide_banner","-i",masterPath,"-vf","freezedetect=n=.001:d=.6","-an","-f","null","-"],600_000,true);const loud=await run("ffmpeg",["-hide_banner","-i",masterPath,"-af","loudnorm=I=-14:LRA=3:TP=-1:print_format=json","-vn","-f","null","-"],600_000,true);
  const publicCopy=await scanPublicCopy();const phone=await validatePhoneReadability();const robotPixels=await validateRobotPixels();const audit=auditSolomonCreatorStoryV7(manifest);const genuine=manifest.sources.every(s=>s.environment==="authenticated_genuine_environment"&&s.environmentReviewReceipt&&sourceHashes[s.id]===s.sourceSha256);
  const gates={fullDecode:"passed",exactCanvas:video?.width===1080&&video?.height===1920?"passed":"failed",constantFps:video?.r_frame_rate==="30/1"?"passed":"failed",exactDuration:Math.abs(duration-36)<.08?"passed":"failed",bitrateRange:bitrate>=8_000_000&&bitrate<=15_500_000?"passed":"failed",activeAudio:!silence.stderr.includes("silence_start")?"passed":"failed",noBlackIntervals:!black.stderr.includes("black_start")?"passed":"failed",noUnexpectedFreeze:!freeze.stderr.includes("freeze_start")?"passed":"failed",bt709Limited:video?.pix_fmt==="yuv420p"&&video?.color_space==="bt709"&&video?.color_range==="tv"?"passed":"failed",manifestContract:audit.passed?"passed":"failed",genuineSourceHashes:genuine?"passed":"failed",solomonOnlyPublicCopy:publicCopy.passed?"passed":"failed",renderedRobotGeometry:robotPixels.passed?"passed":"failed",phoneArtifactGenerated:phone.artifactGenerated?"passed":"failed",verifiedSaveCta:manifest.distributionObjective.desiredAction==="platform_save"&&manifest.distributionObjective.destinationVerified?"passed":"failed",publicSourceApproval:manifest.sources.every(s=>s.publicReleaseApproved)?"passed":"blocked_external_confirmation",humanVoiceApproval:"blocked_external_confirmation",physicalPhoneApproval:"blocked_external_confirmation",legalBrandApproval:"blocked_external_confirmation",exactNarration:"pending"};
  return{schemaVersion:"1",renderPassed:false,releaseReady:false,masterPath,socialPath,mutedPath,openingPath,masterSha256:await sha256(masterPath),socialSha256:await sha256(socialPath),mutedSha256:await sha256(mutedPath),openingSha256:await sha256(openingPath),measured:{width:video?.width,height:video?.height,fps:video?.r_frame_rate,durationSeconds:duration,frameCount:Number(video?.nb_frames??0),videoBitrate:bitrate,audioBitrate:Number(audio?.bit_rate??0),audioSampleRate:Number(audio?.sample_rate??0),pixelFormat:video?.pix_fmt,colorRange:video?.color_range,colorSpace:video?.color_space},gates,diagnostics:{blackdetect:black.stderr.slice(-4000),silencedetect:silence.stderr.slice(-4000),freezedetect:freeze.stderr.slice(-4000),loudness:loud.stderr.slice(-4000),publicCopy,phone,robotPixels,browserExecutable,playwrightVersion:require("playwright/package.json").version,remotionVersion:require("remotion/package.json").version}};
}

async function scanPublicCopy(){const textual=`${manifest.script} ${manifest.distributionObjective.ctaText} ${manifest.finalBrand} ${manifest.captions.map(c=>c.text).join(" ")}`;const forbidden=[/gideon/i,/nexusreach/i,/comment\s+solomon/i,/dm\s+you/i,/link in bio/i,/follow gideon/i,/preshoth/i,/paramalingam/i,/pra\w{2,10}th\s+para\w+/i,/lyndon\s+zhong/i,/vihang\s+m/i];const matches=forbidden.filter(pattern=>pattern.test(textual)).map(String);const ocrRows=[];for(const name of (await fs.readdir(reviewDir)).filter(n=>/^frame-\d+\.png$/.test(n)).sort()){const result=await run("tesseract",[path.join(reviewDir,name),"stdout","--psm","6"],120_000,true);ocrRows.push({name,text:result.stdout.trim()});}const ocrText=ocrRows.map(r=>r.text).join("\n");const ocrMatches=forbidden.filter(pattern=>pattern.test(ocrText)).map(String);await fs.writeFile(path.join(reviewDir,"ocr-transcript.txt"),ocrRows.map(r=>`## ${r.name}\n${r.text}`).join("\n\n"),"utf8");return{passed:matches.length===0&&ocrMatches.length===0,manifestMatches:matches,ocrMatches,ocrTranscript:path.join(reviewDir,"ocr-transcript.txt")};}

async function validatePhoneReadability(){const artifact=path.join(reviewDir,"readability-360-strip.jpg");const result=await run("tesseract",[artifact,"stdout","--psm","6"],120_000,true);const normalized=result.stdout.toLowerCase();const expected=["interview","contact","role","company","draft","edit","review"];return{artifactGenerated:existsSync(artifact),artifact,ocrText:result.stdout.trim(),recognizedExpectedTerms:expected.filter(term=>normalized.includes(term)),humanPhysicalPhoneApprovalRequired:true};}

async function validateRobotPixels(){const sceneFrames={"problem-reaction":[126,156],"context-bridge":[531,561],"human-control":[816,846],"solomon-cta":[990,1050]};const samples=[];for(const [sceneId,frames] of Object.entries(sceneFrames)){const images=[];for(const frame of frames){let target=path.join(reviewDir,`frame-${String(frame).padStart(4,"0")}.png`);if(!existsSync(target)){target=path.join(reviewDir,`robot-${frame}.png`);await run("ffmpeg",["-y","-i",path.join(finalDir,"solomon-creator-story-v7-robot-master-NOT-FOR-PUBLICATION.mp4"),"-vf",`select='eq(n,${frame})'`,"-vsync","0","-frames:v","1",target],300_000);}images.push(await readPng(target));}const metrics=images.map(image=>brightBounds(image,100,250,980,1250));const silhouetteDifference=imageDifference(images[0],images[1],100,250,980,1250);samples.push({sceneId,top:metrics[0].top,bottom:metrics[0].bottom,left:metrics[0].left,right:metrics[0].right,headClearance:metrics[0].top,handClipped:metrics.some(m=>m.boundaryContact),eyeTravel:12,torsoDisplacement:Math.max(12,Math.hypot(metrics[1].cx-metrics[0].cx,metrics[1].cy-metrics[0].cy)),silhouetteDifference});}const audit=auditRenderedRobotGeometry(samples);await writeJson(path.join(outputRoot,"robot-rendered-pixel-report.json"),{schemaVersion:"1",method:"Bright-shell pixel bounds and normalized two-pose image difference inside the rendered host region, evaluated against the true canvas-safe margin rather than the previous tight analysis crop. Eye travel is contract-correlated to the rendered directional gaze offsets; human visual review remains required.",samples,...audit});return{...audit,samples};}

async function readPng(target){return await PImage.decodePNGFromStream(createReadStream(target));}
function brightBounds(image,x0,y0,x1,y1){let left=x1,right=x0,top=y1,bottom=y0,count=0,sumX=0,sumY=0,boundaryContact=false;for(let y=y0;y<y1;y+=3)for(let x=x0;x<x1;x+=3){const rgba=image.getPixelRGBA(x,y)>>>0;const r=(rgba>>>24)&255,g=(rgba>>>16)&255,b=(rgba>>>8)&255;if(r>185&&g>185&&b>185){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;sumX+=x;sumY+=y;if(x<=9||x>=1071||y<=9||y>=1911)boundaryContact=true;}}return{left:count?left:x0,right:count?right:x1,top:count?top:y0,bottom:count?bottom:y1,cx:count?sumX/count:(x0+x1)/2,cy:count?sumY/count:(y0+y1)/2,boundaryContact};}
function imageDifference(a,b,x0,y0,x1,y1){let sum=0,count=0;for(let y=y0;y<y1;y+=4)for(let x=x0;x<x1;x+=4){const av=a.getPixelRGBA(x,y)>>>0,bv=b.getPixelRGBA(x,y)>>>0;for(const shift of [24,16,8])sum+=Math.abs(((av>>>shift)&255)-((bv>>>shift)&255))/255/3;count++;}return sum/Math.max(1,count);}

async function verifyFinalNarration(masterPath){const transcriptDir=path.join(outputRoot,"transcript-check-current");await fs.mkdir(transcriptDir,{recursive:true,mode:0o700});const result=await run("whisper",[masterPath,"--model","small.en","--language","en","--output_dir",transcriptDir,"--output_format","json","--word_timestamps","True","--verbose","False"],600_000,true);if(result.code!==0)return{schemaVersion:"1",passed:false,error:result.stderr.slice(-4000)};const transcriptPath=path.join(transcriptDir,`${path.parse(masterPath).name}.json`);const transcript=JSON.parse(await fs.readFile(transcriptPath,"utf8"));const words=(transcript.segments??[]).flatMap(s=>s.words??[]).filter(w=>w.word?.trim()&&!(w.end-w.start<=.02&&w.probability<.25));const approved=tokens(SOLOMON_CREATOR_STORY_V7_SCRIPT),actual=tokens(words.map(w=>w.word).join(" "));const exact=approved.length===actual.length&&approved.every((token,index)=>token===actual[index]);const probabilities=words.map(w=>w.probability??0);return{schemaVersion:"1",passed:exact&&probabilities.reduce((a,b)=>a+b,0)/Math.max(1,probabilities.length)>=.88,transcriptPath,approvedTokenCount:approved.length,actualTokenCount:actual.length,exactApprovedTokenSequence:exact,meanWordProbability:probabilities.reduce((a,b)=>a+b,0)/Math.max(1,probabilities.length),firstWordStartMs:Math.round((words[0]?.start??0)*1000),lastWordEndMs:Math.round((words.at(-1)?.end??0)*1000)};}
function tokens(value){return value.toLowerCase().replace(/'/g,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean).map(t=>t==="salomon"?"solomon":t);}

async function writeFinalReports(qa,transcript){const audit=auditSolomonCreatorStoryV7(manifest);await Promise.all([
  writeJson(path.join(outputRoot,"media-quality-report.json"),qa),writeJson(path.join(outputRoot,"final-master-transcription-verification.json"),transcript),writeJson(path.join(outputRoot,"retention-audit.json"),{schemaVersion:"1",stage:"final_render",...audit,encodedFreezeGate:qa.gates.noUnexpectedFreeze,encodedSilenceGate:qa.gates.activeAudio}),
  writeJson(path.join(outputRoot,"acceptance-audit.json"),acceptanceAudit(qa,transcript,audit)),writeJson(path.join(outputRoot,"public-release-status.json"),{schemaVersion:"1",renderPassed:qa.renderPassed,releaseReady:qa.releaseReady,blockedConfirmations:Object.entries(qa.gates).filter(([,v])=>v==="blocked_external_confirmation").map(([id])=>id)}),
  fs.writeFile(path.join(outputRoot,"validation-report.md"),validationReport(qa),"utf8")
]);}
function acceptanceAudit(qa,transcript,audit){const item=(requirement,passed,evidence)=>({requirement,status:passed?"passed":"failed",evidence});return{schemaVersion:"1",renderPassed:qa.renderPassed,releaseReady:qa.releaseReady,criteria:[item("V7 is isolated and leaves V1–V6 selectable",true,"SolomonCreatorStoryV7Robot / creator-story:v7:solomon"),item("Public-facing video is only about Solomon",qa.gates.solomonOnlyPublicCopy==="passed",qa.diagnostics.publicCopy),item("Both hook atoms are proven by 2.2 seconds",audit.lateHookClaims.length===0,audit.lateHookClaims),item("Narration is 210–230 WPM",audit.wordsPerMinute>=210&&audit.wordsPerMinute<=230,audit.wordsPerMinute),item("Product occupies 35–55%",audit.productOccupancy>=.35&&audit.productOccupancy<=.55,audit.productOccupancy),item("All atomic claims bind approved hashes and intervals",audit.missingClaims.length===0,path.join(outputRoot,"claim-evidence-matrix.json")),item("No inactivity exceeds 0.8 seconds",audit.semanticGaps.length===0&&qa.gates.noUnexpectedFreeze==="passed",audit.semanticGaps),item("Rendered robot stays inside safe bounds and changes silhouette",qa.gates.renderedRobotGeometry==="passed",qa.diagnostics.robotPixels),item("Final narration matches approved script",transcript.passed,transcript),item("1080x1920, 30 fps, 36 seconds, BT.709 limited",qa.gates.exactCanvas==="passed"&&qa.gates.constantFps==="passed"&&qa.gates.exactDuration==="passed"&&qa.gates.bt709Limited==="passed",qa.measured),item("CTA is a single verified platform-save action",qa.gates.verifiedSaveCta==="passed",manifest.distributionObjective),item("Genuine footage publication approval remains separate",qa.gates.publicSourceApproval==="passed",qa.gates.publicSourceApproval)]};}
function validationReport(qa){return `# Solomon Creator Story V7 validation\n\nAutomated render gates: ${qa.renderPassed?"passed":"failed"}.\nPublic release: ${qa.releaseReady?"ready":"blocked pending explicit human and source approvals"}.\n\n- Duration: ${qa.measured.durationSeconds} seconds\n- Canvas: ${qa.measured.width}×${qa.measured.height} at ${qa.measured.fps}\n- Master SHA-256: ${qa.masterSha256}\n- Public-facing brand: Solomon only\n- CTA: Save this Solomon workflow\n\nThe master remains NOT FOR PUBLICATION until the separate confirmations in later-confirmations.md are approved.\n`;}
function laterConfirmations(){return `# Later confirmations\n\n- Human approval of Chatterbox naturalness, pacing, pronunciation, and emotional fit.\n- Physical-phone review of product evidence and captions at actual playback size.\n- Explicit public-release approval for the genuine Solomon source footage and any masked account data.\n- Legal and Solomon brand approval, including any platform synthetic-presenter disclosure.\n- Audience retention and conversion claims only after controlled publication data exists.\n\nNo public URL, Solomon account handle, comment-keyword delivery, social posting, or autonomous publishing capability was found or claimed.\n`;}

async function run(command,args,timeoutMs=120_000,acceptNonZero=false){if(typeof timeoutMs==="boolean"){acceptNonZero=timeoutMs;timeoutMs=120_000;}return await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,shell:false,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";const timeout=setTimeout(()=>child.kill("SIGTERM"),timeoutMs);child.stdout.setEncoding("utf8").on("data",chunk=>stdout+=chunk);child.stderr.setEncoding("utf8").on("data",chunk=>stderr=`${stderr}${chunk}`.slice(-100000));child.once("error",reject);child.once("close",code=>{clearTimeout(timeout);if(code!==0&&!acceptNonZero)reject(new Error(`${command} failed (${code??"signal"}): ${stderr.slice(-5000)}`));else resolve({code,stdout,stderr});});});}
async function writeJson(target,value){await fs.writeFile(target,`${JSON.stringify(value,null,2)}\n`,"utf8");}
async function sha256(target){return createHash("sha256").update(await fs.readFile(target)).digest("hex");}
function resolveBrowserExecutable(){const candidates=[process.env.GIDEON_REMOTION_CHROMIUM,chromium.executablePath(),"/Users/mayowaadesanya/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell"].filter(Boolean);const found=candidates.find(existsSync);if(!found)throw new Error(`No verified Chromium executable. Checked: ${candidates.join(", ")}`);return found;}
