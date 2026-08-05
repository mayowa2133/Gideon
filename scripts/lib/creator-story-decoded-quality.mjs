import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

export async function measureDecodedMedia(target, options = {}) {
  const probe = JSON.parse((await run("ffprobe", ["-v","error","-show_streams","-show_format","-of","json",target])).stdout);
  const video = probe.streams.find(({ codec_type }) => codec_type === "video");
  const audio = probe.streams.find(({ codec_type }) => codec_type === "audio");
  const durationSeconds = Number(video?.duration ?? probe.format.duration);
  const [loudness, cuts, differences, silence, pcm, canvas] = await Promise.all([
    loudnessScan(target), cutScan(target, durationSeconds), visualDifferenceScan(target), silenceScan(target), decodeMonoPcm(target), canvasScan(target)
  ]);
  const staticWindows = contiguousIntervals(differences.samples, ({ value }) => value < differences.staticThreshold, .2);
  const shotLengths = [0, ...cuts.times, durationSeconds].slice(1).map((end, index) => end - [0, ...cuts.times][index]);
  const audioAnalysis = analyzePcm(pcm, 48_000);
  return {
    sourcePath: target, sourceSha256: await sha256(target), measurementVersion: "decoded-quality-v1",
    methods: {
      static: `Decoded at 5 fps, 180x320, BT.709 luma absolute frame difference; static when mean difference < ${differences.staticThreshold}; caption-only movement is not subtracted in this baseline and therefore makes the result conservative.`,
      silence: "Decoded mixed soundtrack, FFmpeg silencedetect at -40 dB for >=50 ms; narration word gaps are reported separately when word timestamps are available.",
      clicks: "Decoded 48 kHz mono PCM; 5 ms RMS windows; candidate transient when adjacent RMS rises >18 dB and crest factor exceeds 8 dB, with a 60 ms refractory period.",
      audioEvents: "Decoded 48 kHz mono PCM; count positive 10 ms RMS rises >=6 dB separated by >=60 ms.",
      canvas: "Decoded at 2 fps and 180x320; dark pixels have luma <40, bright-neutral product candidates have luma >185 and channel spread <42."
    },
    metadata: { durationSeconds, width: video?.width, height: video?.height, frameRate: video?.avg_frame_rate, frameCount: Number(video?.nb_frames ?? 0), videoBitrate: Number(video?.bit_rate ?? probe.format.bit_rate ?? 0), pixelFormat: video?.pix_fmt, colorRange: video?.color_range, colorSpace: video?.color_space, audioSampleRate: Number(audio?.sample_rate ?? 0), audioBitrate: Number(audio?.bit_rate ?? 0) },
    loudness,
    shots: { cutThreshold: cuts.threshold, cutTimesSeconds: cuts.times, count: shotLengths.length, meanSeconds: average(shotLengths), medianSeconds: median(shotLengths), distributionSeconds: shotLengths },
    motion: { cadenceHz: 5, sampleCount: differences.samples.length, meanDifference: average(differences.samples.map(({ value }) => value)), medianDifference: median(differences.samples.map(({ value }) => value)), staticThreshold: differences.staticThreshold, staticWindows, longestStaticSeconds: Math.max(0, ...staticWindows.map(({ startSeconds, endSeconds }) => endSeconds - startSeconds)) },
    mixedAudioSilence: { thresholdDb: -40, intervals: silence, longestGapMs: Math.round(Math.max(0, ...silence.map(({ startSeconds, endSeconds }) => (endSeconds - startSeconds) * 1_000))) },
    audioActivity: audioAnalysis,
    canvas
  };
}

export function wordGapsFromTranscript(transcript, outroStartsAtSeconds) {
  const words = (transcript.segments ?? []).flatMap(({ words = [] }) => words).filter(({ word, start, end }) => word?.trim() && Number.isFinite(start) && Number.isFinite(end));
  const intervals = words.slice(1).map((word, index) => ({ startSeconds: words[index].end, endSeconds: word.start })).filter(({ startSeconds, endSeconds }) => endSeconds > startSeconds && startSeconds < outroStartsAtSeconds);
  return { method: "Whisper word-timestamp deltas on the exact final encoded master; model and transcript provenance remain in the transcript artifact.", wordCount: words.length, intervals, longestGapMs: Math.round(Math.max(0, ...intervals.map(({ startSeconds, endSeconds }) => (endSeconds - startSeconds) * 1_000))) };
}

async function loudnessScan(target) {
  const result = await run("ffmpeg", ["-hide_banner","-i",target,"-af","loudnorm=I=-14:LRA=3:TP=-1:print_format=json","-vn","-f","null","-"], true);
  const raw = [...result.stderr.matchAll(/\{[\s\S]*?"target_offset"\s*:\s*"[^"]+"\s*\}/g)].at(-1)?.[0];
  const value = raw ? JSON.parse(raw) : {};
  return { integratedLufs: Number(value.input_i), truePeakDbtp: Number(value.input_tp), loudnessRangeLu: Number(value.input_lra), thresholdLufs: Number(value.input_thresh) };
}

const CUT_CLUSTER_SECONDS = .15;
async function cutScan(target, durationSeconds) {
  // A 0.10 scene score captures real cuts between Gideon's intentionally bright
  // editorial/product layouts. The previous 0.22 threshold detected only
  // high-contrast cuts and under-counted pale-to-pale composition changes.
  const threshold = .10;
  const result = await run("ffmpeg", ["-hide_banner","-i",target,"-vf",`select='gt(scene,${threshold})',showinfo`,"-an","-f","null","-"], true);
    // A transition that changes backdrop and slides content takes 2-3 frames, and
  // the scene detector fires on each one. Detections 33ms apart are one cut, not
  // three, so cluster them: without this a hard 3-frame cut inflates the shot
  // count by 200% and a film measured as "28 shots" is really 20.
  const raw = [...result.stderr.matchAll(/pts_time:([0-9.]+)/g)].map((match) => Number(match[1])).filter((time) => time > .03 && time < durationSeconds - .03);
  const times = raw.filter((time, index) => index === 0 || time - raw[index - 1] > CUT_CLUSTER_SECONDS);
  return { threshold, times, rawDetectionCount: raw.length, clusterWindowSeconds: CUT_CLUSTER_SECONDS };
}

async function visualDifferenceScan(target) {
  const staticThreshold = .5;
  const result = await run("ffmpeg", ["-hide_banner","-i",target,"-vf","fps=5,scale=180:320:flags=bilinear,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG","-an","-f","null","-"], true);
  const values = [...result.stderr.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((match) => Number(match[1]));
  return { staticThreshold, samples: values.map((value, index) => ({ timeSeconds: index / 5, value })) };
}

async function silenceScan(target) {
  const result = await run("ffmpeg", ["-hide_banner","-i",target,"-af","silencedetect=n=-40dB:d=.05","-vn","-f","null","-"], true);
  const starts = [...result.stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const ends = [...result.stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  return starts.map((startSeconds, index) => ({ startSeconds, endSeconds: ends[index] ?? startSeconds }));
}

async function decodeMonoPcm(target) {
  const result = await run("ffmpeg", ["-v","error","-i",target,"-vn","-ac","1","-ar","48000","-f","s16le","pipe:1"], false, true);
  return result.stdoutBuffer;
}

function analyzePcm(buffer, sampleRate) {
  const samples = new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 2));
  const rms10 = windowStats(samples, Math.round(sampleRate * .01));
  const rms5 = windowStats(samples, Math.round(sampleRate * .005));
  const lowEnergyProportion = rms10.filter(({ db }) => db < -40).length / Math.max(1, rms10.length);
  const events = onsetEvents(rms10, 6, .06);
  const clicks = [];
  let lastClickSample = -Infinity;
  for (let index = 2; index < samples.length - 2; index += 1) {
    const jump = Math.abs(samples[index] - samples[index - 1]) / 32768;
    const previousJump = Math.abs(samples[index - 1] - samples[index - 2]) / 32768;
    const nextJump = Math.abs(samples[index + 1] - samples[index]) / 32768;
    if (jump > .42 && previousJump < .12 && nextJump < .12 && index - lastClickSample > sampleRate * .06) { clicks.push({ timeSeconds: index / sampleRate, normalizedDiscontinuity: jump }); lastClickSample = index; }
  }
  const onsetCandidates=rms5.slice(1).flatMap((current,index)=>{const previous=rms5[index],jumpDb=current.db-previous.db,crestDb=20*Math.log10(Math.max(current.peak,1e-6)/Math.max(current.rms,1e-6));return jumpDb>18&&crestDb>8?[{timeSeconds:current.timeSeconds,jumpDb,crestDb}]:[];});
  return { lowEnergyThresholdDbfs: -40, lowEnergyProportion, lowEnergyPercent: lowEnergyProportion * 100, eventDefinitionDbRise: 6, eventCount: events.length, eventDensityPerSecond: events.length / Math.max(.001, samples.length / sampleRate), clickDefinition: "isolated adjacent-sample discontinuity >0.42 full scale with both neighboring discontinuities <0.12", clickCount: clicks.length, clickCandidates: clicks, onsetCandidates };
}

function windowStats(samples, width) {
  const rows = [];
  for (let start = 0; start < samples.length; start += width) {
    let sumSquares = 0, peak = 0, count = 0;
    for (let index = start; index < Math.min(samples.length, start + width); index += 1) { const value = Math.abs(samples[index] / 32768); sumSquares += value * value; peak = Math.max(peak, value); count += 1; }
    const rms = Math.sqrt(sumSquares / Math.max(1, count));
    rows.push({ timeSeconds: start / 48_000, rms, peak, db: 20 * Math.log10(Math.max(rms, 1e-8)) });
  }
  return rows;
}

function onsetEvents(rows, riseDb, refractorySeconds) { const result=[];let last=-Infinity;for(let index=1;index<rows.length;index+=1){const row=rows[index];if(row.db-rows[index-1].db>=riseDb&&row.timeSeconds-last>=refractorySeconds){result.push(row.timeSeconds);last=row.timeSeconds;}}return result; }

async function canvasScan(target) {
  const result = await run("ffmpeg", ["-v","error","-i",target,"-vf","fps=2,scale=180:320:flags=bilinear","-pix_fmt","rgb24","-f","rawvideo","pipe:1"], false, true);
  let dark=0,brightNeutral=0,total=0;
  for(let index=0;index+2<result.stdoutBuffer.length;index+=3){const r=result.stdoutBuffer[index],g=result.stdoutBuffer[index+1],b=result.stdoutBuffer[index+2];const y=.2126*r+.7152*g+.0722*b;dark+=y<40?1:0;brightNeutral+=y>185&&Math.max(r,g,b)-Math.min(r,g,b)<42?1:0;total+=1;}
  return { sampleCadenceHz:2, darkCanvasRatio:dark/Math.max(1,total), decodedBrightNeutralOccupancy:brightNeutral/Math.max(1,total) };
}

function contiguousIntervals(samples, predicate, cadenceSeconds) { const rows=[];let start;for(const sample of samples){if(predicate(sample)&&start===undefined)start=sample.timeSeconds;if(!predicate(sample)&&start!==undefined){rows.push({startSeconds:start,endSeconds:sample.timeSeconds});start=undefined;}}if(start!==undefined)rows.push({startSeconds:start,endSeconds:(samples.at(-1)?.timeSeconds??start)+cadenceSeconds});return rows; }
function average(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;}
function median(values){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
async function sha256(target){return createHash("sha256").update(await fs.readFile(target)).digest("hex");}

export async function run(command,args,acceptNonZero=false,binaryStdout=false){return await new Promise((resolve,reject)=>{const child=spawn(command,args,{shell:false,stdio:["ignore","pipe","pipe"]});const stdoutChunks=[];let stdout="",stderr="";if(binaryStdout)child.stdout.on("data",chunk=>stdoutChunks.push(chunk));else child.stdout.setEncoding("utf8").on("data",chunk=>stdout+=chunk);child.stderr.setEncoding("utf8").on("data",chunk=>stderr=`${stderr}${chunk}`.slice(-500000));child.once("error",reject);child.once("close",code=>{const result={code,stdout,stdoutBuffer:binaryStdout?Buffer.concat(stdoutChunks):Buffer.from(stdout),stderr};if(code!==0&&!acceptNonZero)reject(new Error(`${command} failed (${code}): ${stderr.slice(-5000)}`));else resolve(result);});});}
