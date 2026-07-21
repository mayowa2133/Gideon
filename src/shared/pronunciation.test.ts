import { describe, expect, it } from "vitest";
import { applyPronunciationFallback, normalizePronunciationDictionary, pronunciationDictionaryHash } from "./pronunciation";

describe("pronunciation dictionary", () => {
  it("normalizes deterministically and applies longest terms without changing the source", () => {
    const source = "Use Gideon Code, then Gideon.";
    const entries = normalizePronunciationDictionary({ " Gideon ": "GID-ee-un", "Gideon Code": "GID-ee-un code" });
    expect(applyPronunciationFallback(source, entries)).toBe("Use GID-ee-un code, then GID-ee-un.");
    expect(source).toBe("Use Gideon Code, then Gideon.");
    expect(pronunciationDictionaryHash(entries)).toHaveLength(64);
  });

  it("rejects controls, empty values, conflicts, and excessive entries", () => {
    expect(() => normalizePronunciationDictionary({ Gideon: "bad\u0000value" })).toThrow(/printable/);
    expect(() => normalizePronunciationDictionary({ Gideon: "" })).toThrow(/printable/);
    expect(() => normalizePronunciationDictionary({ API: "A P I", api: "appy" })).toThrow(/Conflicting/);
    const many = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`term-${index}`, "say"]));
    expect(() => normalizePronunciationDictionary(many)).toThrow(/at most/);
  });

  it("changes the provenance hash when pronunciation settings change", () => {
    const first = pronunciationDictionaryHash(normalizePronunciationDictionary({ PostgreSQL: "post-gres-Q-L" }));
    const second = pronunciationDictionaryHash(normalizePronunciationDictionary({ PostgreSQL: "post-gres-cue-ell" }));
    expect(first).not.toBe(second);
  });
});
