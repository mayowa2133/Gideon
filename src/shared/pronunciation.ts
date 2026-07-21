import { createHash } from "node:crypto";
import type { PronunciationEntry } from "./types";

export const PRONUNCIATION_DICTIONARY_VERSION = "pronunciation-v1";
export const MAX_PRONUNCIATION_ENTRIES = 64;

export function normalizePronunciationDictionary(value: Record<string, string> | undefined): PronunciationEntry[] {
  const entries = Object.entries(value ?? {}).map(([rawTerm, rawPronunciation]) => ({
    term: normalizeField(rawTerm, "term"),
    pronunciation: normalizeField(rawPronunciation, "pronunciation")
  }));
  if (entries.length > MAX_PRONUNCIATION_ENTRIES) throw new Error(`Pronunciation dictionary may contain at most ${MAX_PRONUNCIATION_ENTRIES} entries.`);
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const key = entry.term.toLocaleLowerCase("en-US");
    const previous = seen.get(key);
    if (previous !== undefined && previous !== entry.pronunciation) throw new Error(`Conflicting pronunciation entries exist for ${entry.term}.`);
    seen.set(key, entry.pronunciation);
  }
  return [...seen.entries()].map(([key, pronunciation]) => ({
    term: entries.find((entry) => entry.term.toLocaleLowerCase("en-US") === key)!.term,
    pronunciation
  })).sort((left, right) => right.term.length - left.term.length || left.term.localeCompare(right.term));
}

export function pronunciationDictionaryHash(entries: PronunciationEntry[]): string {
  const normalized = entries.map(({ term, pronunciation }) => [term.toLocaleLowerCase("en-US"), pronunciation]);
  return createHash("sha256").update(`${PRONUNCIATION_DICTIONARY_VERSION}:${JSON.stringify(normalized)}`).digest("hex");
}

export function applyPronunciationFallback(text: string, entries: PronunciationEntry[]): string {
  let output = text;
  for (const entry of entries) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(entry.term)}(?![\\p{L}\\p{N}_])`, "giu");
    output = output.replace(pattern, entry.pronunciation);
  }
  return output;
}

function normalizeField(value: string, field: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`Pronunciation ${field} must contain 1–80 printable characters.`);
  }
  return normalized;
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
