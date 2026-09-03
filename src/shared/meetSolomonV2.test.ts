import { describe, expect, it } from "vitest";
import storyJson from "../../fixtures/meet-solomon/what-changed-v2.json";
import oldStoryJson from "../../fixtures/meet-solomon/too-late.json";
import { meetEvidenceSchema, meetStorySchema as legacyStorySchema, type MeetEvidence } from "./meetSolomon";
import { assertMeetStoryEvidence, auditMeetFilm, meetFilmSchema, meetStorySchema, proofIsVisible, proofOffsetX } from "./meetSolomonV2";

const story = meetStorySchema.parse(storyJson);
const evidence: MeetEvidence[] = [...new Set(story.scenes.flatMap(s => s.evidence))].map(id => meetEvidenceSchema.parse({
  id, text: story.requiredEvidence[id] ?? (id === "recent-role" ? "Staff Software Engineer, Traffic 13 hours ago" : "Solomon Jobs"),
  file: `${id}.png`, sha256: "a".repeat(64), capturedAt: "2026-08-27T11:18:28.788Z", source: "archived-product-capture", approved: true,
  sourceWidth: 1440, sourceHeight: 900, kind: id === "feed-context" ? "establishing" : "proof",
  crop: { x: 100, y: 200, width: 320, height: 24 }, textHeight: 11,
}));
const validFilm = () => meetFilmSchema.parse({ version: story.version, id: story.id, title: story.title, fps: 30, durationInFrames: 960,
  narrationSrc: "narration.wav", reviewOnly: true, evidence, alignment: { source: "aligned", coverage: .99 },
  scenes: story.scenes.map((s, i) => ({ ...s, from: i * 60, to: (i + 1) * 60, actionFrame: 30, phrases: [] })),
});

describe("Meet V2 grounding, motion and timing", () => {
  it("keeps version selection explicit without broadening V1", () => {
    expect(legacyStorySchema.safeParse(oldStoryJson).success).toBe(true);
    expect(legacyStorySchema.safeParse(storyJson).success).toBe(false);
    expect(meetStorySchema.safeParse(oldStoryJson).success).toBe(false);
  });
  it("verifies every displayed before and after proof at the actual contain scale", () => {
    const checks = assertMeetStoryEvidence(story, evidence);
    expect(checks.filter(c => c.scene === "filter").map(c => c.evidence)).toEqual(["filter-00", "filter-02", "count-00", "count-02"]);
    const unreadable = evidence.map(e => e.id === "count-02" ? { ...e, crop: { x: 100, y: 0, width: 320, height: 890 } } : e);
    expect(() => assertMeetStoryEvidence(story, unreadable)).toThrow("20px");
  });
  it("rejects proof that is declared but never actually displayed", () => {
    const changed = structuredClone(story);
    changed.scenes.find(s => s.id === "filter")!.proofs.pop();
    expect(() => assertMeetStoryEvidence(changed, evidence)).toThrow("never shown");
  });
  it("rejects altered ages in the source or narration", () => {
    const changed = structuredClone(story);
    changed.scenes.find(s => s.layout === "age")!.vo = "Posted twelve days ago.";
    expect(() => assertMeetStoryEvidence(changed, evidence)).toThrow("Spoken figure");
    expect(() => assertMeetStoryEvidence(story, evidence.map(e => e.id === "recent-age" ? { ...e, text: "2 days ago" } : e))).toThrow("recent-age");
  });
  it("switches both control and count at precisely the same spoken cue", () => {
    const scene = validFilm().scenes.find(s => s.layout === "filter")!;
    expect(scene.proofs.filter(p => proofIsVisible(p, scene, 29)).map(p => p.id)).toEqual(["filter-00", "count-00"]);
    expect(scene.proofs.filter(p => proofIsVisible(p, scene, 30)).map(p => p.id)).toEqual(["filter-02", "count-02"]);
    expect(scene.proofs.every(p => proofOffsetX(p, scene, 30) === 0)).toBe(true);
  });
  it("holds whole proof cards still for reading on both sides of the exchange", () => {
    const scene = validFilm().scenes.find(s => s.layout === "compare")!;
    const [before, after] = scene.proofs;
    expect(Array.from({ length: 24 }, (_, f) => proofOffsetX(before!, scene, f)).every(x => x === 0)).toBe(true);
    expect(Array.from({ length: 24 }, (_, f) => proofOffsetX(after!, scene, f + 36)).every(x => x === 0)).toBe(true);
    const film = validFilm(); film.scenes.find(s => s.layout === "compare")!.actionFrame = 10;
    expect(meetFilmSchema.safeParse(film).success).toBe(false);
  });
  it("rejects rushed state changes, unsafe placement, timing gaps and estimated captions", () => {
    const film = validFilm();
    film.scenes.find(s => s.layout === "filter")!.actionFrame = 55;
    expect(meetFilmSchema.safeParse(film).success).toBe(false);
    const offscreen = validFilm(); offscreen.scenes.find(s => s.layout === "role")!.proofs[0]!.x = 1000;
    expect(meetFilmSchema.safeParse(offscreen).success).toBe(false);
    const gap = validFilm(); gap.scenes[1]!.from += 1;
    expect(meetFilmSchema.safeParse(gap).success).toBe(false);
    expect(meetFilmSchema.safeParse({ ...validFilm(), alignment: { source: "estimated", coverage: 1 } }).success).toBe(false);
  });
  it("blocks a return to the late reveal or an overlong end card", () => {
    expect(auditMeetFilm(validFilm()).introSeconds).toBe(8);
    const late = validFilm(); late.scenes.find(s => s.layout === "meet")!.from = 241;
    expect(() => auditMeetFilm(late)).toThrow("pacing");
    const longEnd = validFilm(); longEnd.scenes.at(-1)!.from = 860;
    expect(() => auditMeetFilm(longEnd)).toThrow("pacing");
  });
});
