// The bundled sound-effect library: assets/sfx/manifest.json and the files it
// names. A render asks for a cue by kind ("click", "whoosh"); this module
// decides which file that is, checks the file is the one the manifest was
// built from, and hands back a path the ffmpeg command can take as an input.
//
// There is deliberately no fallback. Before this module the renderer produced
// a sine tone per cue, and a missing library quietly producing tones again is
// the one regression a listener would not report -- it would just sound like
// the old build. A library that is missing, tampered with, or short a kind is
// a render error.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { RenderSfxCue, RenderSfxKind } from "../shared/types";

export const SFX_KINDS = ["click", "pop", "whoosh", "card", "impact", "success", "sting"] as const satisfies readonly RenderSfxKind[];

const sfxManifestSchema = z.object({
  schemaVersion: z.literal(1),
  license: z.literal("CC0-1.0"),
  source: z.string().min(1),
  referencePeakDbfs: z.number().max(0),
  entries: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    file: z.string().regex(/^[A-Za-z0-9_.-]+\.(ogg|wav)$/),
    kind: z.enum(SFX_KINDS),
    pack: z.string().min(1),
    hfRisk: z.enum(["low", "medium", "high"]),
    brightness: z.enum(["warm", "balanced", "bright"]),
    envelope: z.enum(["transient", "textured", "continuous"]),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    durationMs: z.number().int().positive(),
    peakDbfs: z.number(),
    gainTrimDb: z.number()
  })).min(1)
});

export type SfxManifest = z.infer<typeof sfxManifestSchema>;
export type SfxLibraryEntry = SfxManifest["entries"][number] & { filePath: string };

export interface SfxLibrary {
  dir: string;
  // Over every entry's id and content hash, in manifest order. It is part of
  // the scene-cache key: a segment rendered against one library must not be
  // reused under another.
  hash: string;
  entries: SfxLibraryEntry[];
  byKind: Record<RenderSfxKind, SfxLibraryEntry[]>;
}

export interface ResolvedSfxCue extends RenderSfxCue {
  asset: { id: string; sha256: string };
  filePath: string;
  gainTrimDb: number;
}

// Mirrors catalogAvatarPath in media.ts: an env override for tests and
// operators, the packaged app's resources directory, else the repository.
export function resolveSfxLibraryDir(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return process.env.GIDEON_SFX_LIBRARY_DIR
    ?? (resourcesPath ? path.join(resourcesPath, "assets", "sfx") : path.join(process.cwd(), "assets", "sfx"));
}

export async function loadSfxLibrary(dir = resolveSfxLibraryDir()): Promise<SfxLibrary> {
  const manifestPath = path.join(dir, "manifest.json");
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch {
    throw new Error(`SFX library manifest is missing at ${manifestPath}.`);
  }
  const parsed = sfxManifestSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`SFX library manifest at ${manifestPath} is invalid: ${parsed.error.issues[0]?.message ?? "schema mismatch"}.`);
  }

  const entries: SfxLibraryEntry[] = [];
  const seenIds = new Set<string>();
  for (const entry of parsed.data.entries) {
    if (seenIds.has(entry.id)) throw new Error(`SFX library manifest lists ${entry.id} twice.`);
    seenIds.add(entry.id);
    const filePath = path.join(dir, entry.file);
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(filePath);
    } catch {
      throw new Error(`SFX library file ${entry.file} is missing.`);
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== entry.sha256) {
      throw new Error(`SFX library file ${entry.file} does not match its manifest hash.`);
    }
    entries.push({ ...entry, filePath });
  }

  const byKind = Object.fromEntries(SFX_KINDS.map((kind) => [kind, entries.filter((entry) => entry.kind === kind)])) as SfxLibrary["byKind"];
  for (const kind of SFX_KINDS) {
    if (byKind[kind].length === 0) throw new Error(`SFX library has no entry for kind "${kind}".`);
  }
  const hash = createHash("sha256").update(entries.map((entry) => `${entry.id}:${entry.sha256}`).join("\n")).digest("hex");
  return { dir, hash, entries, byKind };
}

// Picks a file for each cue. Kinds with more than one entry alternate by
// the cue's ordinal within its kind, so five callouts in a row do not play
// the same click five times; the alternation is by position, not random, so
// the same manifest resolves the same way every render.
//
// A cue that already names an asset (a re-render of a stored manifest) keeps
// it, provided the library still has that id at that hash. If it does not,
// the render cannot reproduce what the manifest says it mixed, and says so.
export function resolveSfxCues(cues: RenderSfxCue[], library: SfxLibrary): ResolvedSfxCue[] {
  const ordinals = new Map<RenderSfxKind, number>();
  return cues.map((cue) => {
    const candidates = library.byKind[cue.kind];
    if (!candidates || candidates.length === 0) {
      throw new Error(`SFX cue ${cue.id} asks for unknown kind "${String(cue.kind)}".`);
    }
    let entry: SfxLibraryEntry | undefined;
    if (cue.asset) {
      entry = library.entries.find((candidate) => candidate.id === cue.asset!.id);
      if (!entry || entry.sha256 !== cue.asset.sha256) {
        throw new Error(`SFX cue ${cue.id} names asset ${cue.asset.id}, which the library no longer has at that hash.`);
      }
    } else {
      const ordinal = ordinals.get(cue.kind) ?? 0;
      ordinals.set(cue.kind, ordinal + 1);
      entry = candidates[ordinal % candidates.length]!;
    }
    return {
      ...cue,
      asset: { id: entry.id, sha256: entry.sha256 },
      filePath: entry.filePath,
      gainTrimDb: entry.gainTrimDb
    };
  });
}
