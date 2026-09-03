// Puts each caption word where it is actually spoken.
//
// The captions were timed by spreading a line's word groups across its clip in
// proportion to how many characters each group has. That is a model of speech,
// not a measurement of it, and it is wrong in the direction that shows: "Gmail
// or Outlook" takes longer to say than four characters of weight suggest, so a
// group lands early, the next lands late, and by the end of a line the words on
// screen are ahead of the voice. Nobody notices one group. Everybody notices the
// last one.
//
// So the clip is transcribed with word timestamps and the script's words are
// aligned to the transcript's. Two properties this has to keep:
//
// **The words on screen stay the script's words.** Whisper is a source of
// timings, never of text. It hears "Solomon" as "Solomon," and "Northstar" as
// "North Star", and a caption that quietly follows the transcript would print
// something no one approved and nothing validated. The alignment maps timings
// onto the authored sequence; unmatched words are interpolated between their
// neighbours rather than replaced.
//
// **A failed alignment says so.** The estimate is still there as a fallback,
// because a missing Python runtime should not stop a film rendering. What it
// must not do is fall back silently: a caption track that is quietly estimated
// looks exactly like one that is aligned, which is the shape of a gate that
// cannot fail. `alignClip` reports its own coverage and the caller records it.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Below this share of matched words the timings are being interpolated more than
// measured, and an interpolation over a bad match is worse than an honest
// estimate -- it drifts unpredictably instead of evenly.
export const MIN_COVERAGE = 0.6;

const normalise = (word) => {
  const token = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Whisper commonly renders the product name's identical spoken form with the
  // alternate Salomon spelling. This only affects timing alignment; captions
  // continue to use the approved script's spelling.
  return token === "salomon" ? "solomon" : token;
};

// Longest common subsequence over normalised words, then the timings of the
// matched transcript words are carried onto the authored ones.
//
// A subsequence rather than a nearest-neighbour walk because the failure it
// guards against is insertion: the transcriber hears an article the speaker
// swallowed, and every word after it shifts by one. LCS is O(n*m) on lines of
// under thirty words, which is free.
export function alignWordSequences(authored, heard) {
  const left = authored.map(normalise), right = heard.map((word) => normalise(word.text));
  const table = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let index = left.length - 1; index >= 0; index -= 1) {
    for (let other = right.length - 1; other >= 0; other -= 1) {
      table[index][other] = left[index] && left[index] === right[other]
        ? table[index + 1][other + 1] + 1
        : Math.max(table[index + 1][other], table[index][other + 1]);
    }
  }
  const matched = new Array(authored.length).fill(null);
  let index = 0, other = 0;
  while (index < left.length && other < right.length) {
    if (left[index] && left[index] === right[other]) { matched[index] = heard[other]; index += 1; other += 1; }
    else if (table[index + 1][other] >= table[index][other + 1]) index += 1;
    else other += 1;
  }
  return matched;
}

// Fill the gaps between matched words by spreading them evenly across the space
// their neighbours leave. A run of unmatched words at either end is anchored to
// the clip's own bounds, which is the only thing known about it.
export function fillUnmatched(matched, clipSeconds) {
  const times = matched.map((word) => (word ? { from: word.start, to: word.end } : null));
  const anchors = times.flatMap((time, index) => (time ? [index] : []));
  if (!anchors.length) return null;
  for (let index = 0; index < times.length; index += 1) {
    if (times[index]) continue;
    const before = anchors.filter((anchor) => anchor < index).at(-1);
    const after = anchors.find((anchor) => anchor > index);
    const start = before === undefined ? 0 : times[before].to;
    const end = after === undefined ? clipSeconds : times[after].from;
    const gap = times.slice(before === undefined ? 0 : before + 1, after === undefined ? times.length : after).length;
    const step = Math.max(0, (end - start) / Math.max(1, gap));
    const offset = index - (before === undefined ? 0 : before + 1);
    times[index] = { from: start + step * offset, to: start + step * (offset + 1) };
  }
  // Monotonic by construction above, but assert it: a caption that steps
  // backwards is a rendering bug that only shows up on one frame in a hundred.
  for (let index = 1; index < times.length; index += 1) {
    times[index].from = Math.max(times[index].from, times[index - 1].from);
    times[index].to = Math.max(times[index].to, times[index].from);
  }
  return times;
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
    child.once("error", reject);
    child.once("close", (code) => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-400)}`)); });
  });
}

// Word timestamps for one clip. `--word_timestamps True` is the whole reason
// this uses whisper rather than the transcription adapter: the film needs when,
// not what.
export async function transcribeWords(wav, { model = "base.en", binary = "whisper" } = {}) {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "creator-story-align-"));
  try {
    await run(binary, [wav, "--model", model, "--language", "en", "--word_timestamps", "True",
      "--output_format", "json", "--output_dir", outDir, "--verbose", "False"], 180_000);
    const file = path.join(outDir, `${path.basename(wav, path.extname(wav))}.json`);
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return (parsed.segments ?? []).flatMap((segment) => segment.words ?? [])
      .map((word) => ({ text: String(word.word ?? "").trim(), start: Number(word.start), end: Number(word.end) }))
      .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
}

/**
 * Per-word timings for one beat, in seconds from the start of its clip.
 *
 * Returns `{ words, coverage, source }`. `source` is "aligned" or "estimated"
 * and the caller is expected to report it: the estimate is a legitimate
 * fallback and an unannounced one is not.
 */
export async function alignClip(wav, line, clipSeconds, options = {}) {
  const authored = line.split(/\s+/).filter(Boolean);
  const estimate = () => {
    // The previous behaviour, kept as the floor: weight by characters so a long
    // word holds longer than a short one, which is closer than an even split.
    const weight = (word) => word.replace(/[^A-Za-z0-9]/g, "").length + 1;
    const total = authored.reduce((sum, word) => sum + weight(word), 0);
    let spent = 0;
    return authored.map((word) => {
      const from = (clipSeconds * spent) / total;
      spent += weight(word);
      return { from, to: (clipSeconds * spent) / total };
    });
  };
  if (!authored.length) return { words: [], coverage: 1, source: "aligned" };
  try {
    const heard = await transcribeWords(wav, options);
    const matched = alignWordSequences(authored, heard);
    const coverage = matched.filter(Boolean).length / authored.length;
    const times = coverage >= MIN_COVERAGE ? fillUnmatched(matched, clipSeconds) : null;
    if (!times) return { words: estimate(), coverage, source: "estimated", reason: `coverage ${coverage.toFixed(2)} below ${MIN_COVERAGE}` };
    // Clamped to the clip. Whisper occasionally returns an end past the audio on
    // the last word, and a caption that outlives its scene is drawn over the cut.
    return {
      words: times.map(({ from, to }) => ({ from: Math.max(0, Math.min(clipSeconds, from)), to: Math.max(0, Math.min(clipSeconds, to)) })),
      coverage, source: "aligned"
    };
  } catch (error) {
    return { words: estimate(), coverage: 0, source: "estimated", reason: error instanceof Error ? error.message.split("\n")[0] : String(error) };
  }
}
