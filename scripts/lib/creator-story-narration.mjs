import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export async function spliceApprovedNarrationSegments(energetic, credible, target, problemAlternate) {
  await run("ffmpeg", ["-y", "-i", energetic, "-i", credible, "-i", problemAlternate, "-filter_complex", "[0:a]atrim=0:3.4,asetpts=PTS-STARTPTS[a0];[2:a]atrim=0:4.6,asetpts=PTS-STARTPTS,adelay=3400|3400[a1];[0:a]atrim=8:32.2,asetpts=PTS-STARTPTS,adelay=8000|8000[a2];[1:a]atrim=32.2:35.2,asetpts=PTS-STARTPTS,adelay=32200|32200[a3];[a0][a1][a2][a3]amix=inputs=4:normalize=0,apad,atrim=duration=36[a]", "-map", "[a]", "-c:a", "pcm_s16le", target]);
}

export async function tightenNarration(source, target, beats) {
  const directory = path.dirname(target);
  const clean = [];
  for (const item of beats) {
    const filename = path.join(directory, `tight-${item.id}.wav`);
    const start = item.startMs / 1_000;
    const duration = (item.endMs - item.startMs) / 1_000;
    await run("ffmpeg", ["-y", "-ss", String(start), "-i", source, "-t", String(duration), "-af", "silenceremove=stop_periods=-1:stop_duration=0.25:stop_threshold=-42dB:stop_silence=0.16", "-c:a", "pcm_s16le", filename]);
    const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", filename])).stdout);
    const cleanDuration = Number(probe.format.duration);
    const targetDuration = duration - .04;
    const tempo = cleanDuration / targetDuration;
    if (tempo < .5 || tempo > 2.1) throw new Error(`Tightened narration beat ${item.id} requires unsupported tempo ${tempo}`);
    clean.push({ item, filename, tempo, targetDuration });
  }
  const args = ["-y"];
  const filters = [];
  clean.forEach(({ item, filename, tempo, targetDuration }, index) => {
    args.push("-i", filename);
    filters.push(`[${index}:a]atempo=${tempo.toFixed(6)},atrim=duration=${targetDuration.toFixed(3)},afade=t=in:st=0:d=0.02,afade=t=out:st=${Math.max(0, targetDuration - .03).toFixed(3)}:d=0.03,adelay=${item.startMs}|${item.startMs}[b${index}]`);
  });
  filters.push(`${clean.map((_, index) => `[b${index}]`).join("")}amix=inputs=${clean.length}:normalize=0,apad,atrim=duration=36[a]`);
  args.push("-filter_complex", filters.join(";"), "-map", "[a]", "-c:a", "pcm_s16le", target);
  await run("ffmpeg", args);
  await Promise.all(clean.map(({ filename }) => fs.unlink(filename).catch(() => undefined)));
}

async function run(command, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => stdout += chunk);
    child.stderr.setEncoding("utf8").on("data", (chunk) => stderr = `${stderr}${chunk}`.slice(-100_000));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} failed (${code}): ${stderr.slice(-4_000)}`)));
  });
}
