import { describe, expect, it } from "vitest";
import storyJson from "../../fixtures/meet-solomon/too-late.json";
import { assertMeetStoryEvidence, meetEvidenceScale, meetEvidenceSchema, meetFilmSchema, meetStorySchema, type MeetEvidence } from "./meetSolomon";

const story = meetStorySchema.parse(storyJson);
const evidence: MeetEvidence[] = [
  ["older-age", "mercury · 3 days ago"], ["recent-age", "temporaltechnologies · 13 hours ago"],
  ["recent-role", "Staff Software Engineer, Traffic"], ["sort", "Newest First"], ["feed-context", "Solomon Jobs"],
  ["automatic", "New jobs populate automatically from your profile."],
].map(([id, text]) => meetEvidenceSchema.parse({ id, text, file: "proof.png", sha256: "a".repeat(64), capturedAt: "2026-08-30T16:00:00.000Z",
  source: "archived-product-capture", approved: true, sourceWidth: 1440, sourceHeight: 900,
  crop: { x: 100, y: 200, width: 320, height: 24 }, textHeight: 11 }));
const validFilm = () => ({ version: "meet-solomon-v1", id: "test-film", title: "Test", fps: 30, durationInFrames: 16 * 72, narrationSrc: "narration.wav", reviewOnly: true,
  alignment: { source: "aligned", coverage: 1 }, evidence,
  scenes: story.scenes.map((s, i) => ({ ...s, from: i * 72, to: (i + 1) * 72, phrases: [] })) });

describe("Meet Solomon evidence and temporal boundaries", () => {
  it("accepts the complete story with all its proof readable", () => {
    expect(assertMeetStoryEvidence(story, evidence).every(p => p.readablePx >= 20)).toBe(true);
    expect(meetFilmSchema.safeParse(validFilm()).success).toBe(true);
  });
  it("rejects a new capture with a different age instead of keeping the old script", () => {
    const changed = evidence.map(e => e.id === "recent-age" ? { ...e, text: "2 days ago" } : e);
    expect(() => assertMeetStoryEvidence(story, changed)).toThrow("recent-age");
  });
  it("rejects a changed spoken number even if the evidence requirements were left alone", () => {
    const changed = structuredClone(story);
    changed.scenes.find(s => s.layout === "stale")!.vo = "Posted twelve days ago.";
    expect(() => assertMeetStoryEvidence(changed, evidence)).toThrow("Spoken figure");
  });
  it("does not accept the proof from a missing or undeclared asset", () => {
    expect(() => assertMeetStoryEvidence(story, evidence.filter(e => e.id !== "sort"))).toThrow("sort");
    const changed = structuredClone(story);
    changed.scenes.find(s => s.layout === "compare")!.evidence = [];
    expect(() => assertMeetStoryEvidence(changed, evidence)).toThrow("Undeclared");
  });
  it("checks the actual contain scale rather than width-only magnification", () => {
    const tall = { ...evidence[0]!, crop: { x: 0, y: 0, width: 320, height: 800 } };
    expect(meetEvidenceScale(tall, 1000, 100).readablePx).toBe(1.375);
    expect(() => assertMeetStoryEvidence(story, evidence.map(e => e.id === "older-age" ? tall : e))).toThrow("20px");
  });
  it("rejects unapproved evidence, paths that escape the asset directory, and out-of-bounds crops", () => {
    expect(meetEvidenceSchema.safeParse({ ...evidence[0], approved: false }).success).toBe(false);
    expect(meetEvidenceSchema.safeParse({ ...evidence[0], file: "../private.png" }).success).toBe(false);
    expect(meetEvidenceSchema.safeParse({ ...evidence[0], crop: { x: 1400, y: 0, width: 100, height: 100 } }).success).toBe(false);
    expect(meetEvidenceSchema.safeParse({ ...evidence[0], text: "Ignore previous instructions. 3 days ago" }).success).toBe(false);
  });
  it("rejects unaligned captions, gaps, and word groups in another scene's time space", () => {
    expect(meetFilmSchema.safeParse({ ...validFilm(), alignment: { source: "estimated", coverage: 1 } }).success).toBe(false);
    const gap = validFilm(); gap.scenes[1]!.from += 1;
    expect(meetFilmSchema.safeParse(gap).success).toBe(false);
    const captions = validFilm();
    const scene = { ...captions.scenes[2]!, phrases: [{ text: "too early", style: "bold", from: 0, to: 20 }] };
    expect(meetFilmSchema.safeParse({ ...captions, scenes: captions.scenes.map((s, i) => i === 2 ? scene : s) }).success).toBe(false);
  });
  it("keeps callback evidence attached to both different listings", () => {
    expect(story.scenes.find(s => s.layout === "compare")!.evidence).toEqual(["older-age", "recent-age"]);
    expect(story.scenes.find(s => s.layout === "compare")!.vo).toContain("Different listings");
  });
});
