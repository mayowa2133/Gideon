// Regenerates assets/sfx/manifest.json from the files on disk.
//
// The manifest is never hand-edited: every hash, duration and gain trim in it
// was measured by this script, so a mismatch between the manifest and a file
// means the file changed, not that somebody mistyped a digest. The curation
// table below is the one hand-written part -- which files ship, what each is
// for, and the spectral labels carried over from the analysis the files were
// chosen with (see assets/sfx/README.md).
//
//   node scripts/build-sfx-manifest.mjs            # rewrite the manifest
//   node scripts/build-sfx-manifest.mjs --check    # exit 1 if it would change
//
// Gain trim is measured against sample peak, not integrated loudness: these
// are 10ms-650ms one-shots, and EBU R128 gating makes an integrated value on
// a clip that short mostly noise. Peak-matching every entry to REFERENCE_PEAK_DB
// means a cue's gainDb keeps one meaning across files.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const libraryDir = path.join(root, "assets", "sfx");
const manifestPath = path.join(libraryDir, "manifest.json");
const REFERENCE_PEAK_DB = -6;

// Labels are from brag's sfx-analysis.json (spectral centroid, high-frequency
// energy, envelope shape), kept here so the selection rule -- low/medium
// high-frequency risk for anything repeated -- is data a reviewer can read.
const curation = [
  { id: "click_soft", file: "click_003.ogg", kind: "click", pack: "Kenney Interface Sounds", hfRisk: "low", brightness: "balanced", envelope: "continuous" },
  { id: "click_ui", file: "click2.ogg", kind: "click", pack: "Kenney UI Audio", hfRisk: "low", brightness: "balanced", envelope: "continuous" },
  { id: "pop_soft", file: "drop_001.ogg", kind: "pop", pack: "Kenney Interface Sounds", hfRisk: "medium", brightness: "balanced", envelope: "transient" },
  { id: "pop_warm", file: "drop_002.ogg", kind: "pop", pack: "Kenney Interface Sounds", hfRisk: "medium", brightness: "warm", envelope: "transient" },
  { id: "whoosh_soft", file: "impactSoft_medium_001.ogg", kind: "whoosh", pack: "Kenney Impact Sounds", hfRisk: "low", brightness: "warm", envelope: "transient" },
  { id: "whoosh_soft_2", file: "impactSoft_medium_002.ogg", kind: "whoosh", pack: "Kenney Impact Sounds", hfRisk: "low", brightness: "warm", envelope: "transient" },
  { id: "card_slide", file: "card-slide-1.ogg", kind: "card", pack: "Kenney Casino Audio", hfRisk: "medium", brightness: "balanced", envelope: "transient" },
  { id: "impact_warm", file: "bong_001.ogg", kind: "impact", pack: "Kenney Interface Sounds", hfRisk: "low", brightness: "warm", envelope: "textured" },
  { id: "success_glass", file: "impactGlass_light_001.ogg", kind: "success", pack: "Kenney Impact Sounds", hfRisk: "medium", brightness: "warm", envelope: "transient" },
  { id: "sting_bell", file: "impactBell_heavy_003.ogg", kind: "sting", pack: "Kenney Impact Sounds", hfRisk: "medium", brightness: "warm", envelope: "transient" }
];

async function measure(file) {
  const bytes = await fs.readFile(file);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const durationMs = Math.round(Number(stdout.trim()) * 1000);
  // volumedetect reports on stderr; ffmpeg -f null discards the audio.
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const peak = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  if (!peak) throw new Error(`volumedetect reported no peak for ${path.basename(file)}`);
  const gainTrimDb = Number((REFERENCE_PEAK_DB - Number(peak[1])).toFixed(2));
  return { sha256, durationMs, peakDbfs: Number(peak[1]), gainTrimDb };
}

const entries = [];
for (const item of curation) {
  const file = path.join(libraryDir, item.file);
  const measured = await measure(file);
  entries.push({ ...item, ...measured });
}

const manifest = {
  schemaVersion: 1,
  license: "CC0-1.0",
  source: "Kenney.nl asset packs (Interface Sounds, UI Audio, Impact Sounds, Casino Audio), curated via latent-spaces/brag sfx-analysis",
  referencePeakDbfs: REFERENCE_PEAK_DB,
  entries
};
const next = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await fs.readFile(manifestPath, "utf8").catch(() => "");
  if (current !== next) {
    process.stderr.write("assets/sfx/manifest.json is out of date; run node scripts/build-sfx-manifest.mjs\n");
    process.exit(1);
  }
  process.stdout.write("assets/sfx/manifest.json matches the files on disk\n");
} else {
  await fs.writeFile(manifestPath, next);
  for (const entry of entries) process.stdout.write(`${entry.id.padEnd(16)} ${entry.file.padEnd(28)} ${String(entry.durationMs).padStart(4)}ms  peak ${entry.peakDbfs}dB  trim ${entry.gainTrimDb >= 0 ? "+" : ""}${entry.gainTrimDb}dB\n`);
  process.stdout.write(`wrote ${path.relative(root, manifestPath)}\n`);
}
