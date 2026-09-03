import { describe, expect, it } from "vitest";
import storyJson from "../../fixtures/meet-solomon/nontech-v1.json";
import { meetEvidenceSchema, meetStorySchema as v1StorySchema } from "./meetSolomon";
import { meetStorySchema as v2StorySchema } from "./meetSolomonV2";
import { assertMeetStoryEvidence, auditMeetFilm, meetFilmSchema, meetSceneSchema, meetStorySchema } from "./meetSolomonNontech";

const story = meetStorySchema.parse(storyJson);
const evidence = [...new Set(story.scenes.flatMap(s => s.evidence))].map(id => meetEvidenceSchema.parse({
  id, file: "company-feed.png", sha256: "a".repeat(64), capturedAt: "2026-08-25T01:09:59.579Z", source: "archived-product-capture", approved: true,
  sourceWidth: 1440, sourceHeight: 900, kind: id === "company-view" ? "establishing" : "proof",
  text: story.requiredEvidence[id] ?? "Solomon company view", textHeight: 11,
  crop: { x: 153, y: id.endsWith("employer") ? 220 : 200, width: id.endsWith("employer") ? 60 : id === "legal-category" ? 120 : 240, height: 20 },
}));
const filmFixture = () => meetFilmSchema.parse({ version: story.version, id: story.id, title: story.title, fps: 30,
  durationInFrames: story.scenes.length * 60, narrationSrc: "narration.wav", reviewOnly: true, alignment: { source: "aligned", coverage: .99 }, evidence,
  scenes: story.scenes.map((s, i) => ({ ...s, from: i * 60, to: (i + 1) * 60, phrases: [], actionFrame: 20 })),
});

describe("Meet Solomon #5 evidence and version boundaries", () => {
  it("supports the new narrative without widening V1 or V2", () => {
    expect(v1StorySchema.safeParse(storyJson).success).toBe(false);
    expect(v2StorySchema.safeParse(storyJson).success).toBe(false);
    expect(assertMeetStoryEvidence(story, evidence).length).toBeGreaterThan(10);
    expect(auditMeetFilm(filmFixture()).firstProofSeconds).toBe(4);
  });
  it("rejects an employer taken from another image or another card", () => {
    const mismatchedImage = evidence.map(e => e.id === "legal-employer" ? { ...e, sha256: "b".repeat(64) } : e);
    expect(() => assertMeetStoryEvidence(story, mismatchedImage)).toThrow("same captured card");
    const mismatchedCard = evidence.map(e => e.id === "legal-employer" ? { ...e, crop: { ...e.crop, y: 600 } } : e);
    expect(() => assertMeetStoryEvidence(story, mismatchedCard)).toThrow("same captured card");
  });
  it("rejects a same-company claim if the employers disagree", () => {
    const changedStory = structuredClone(story); changedStory.requiredEvidence["partners-employer"] = "another company";
    const changed = evidence.map(e => e.id === "partners-employer" ? { ...e, text: "another company" } : e);
    expect(() => assertMeetStoryEvidence(changedStory, changed)).toThrow("matching employers");
  });
  it("requires the title and employer to be visible on each role reveal", () => {
    const changed = structuredClone(story), reveal = changed.scenes.find(s => s.layout === "legal-reveal")!;
    reveal.proofs = reveal.proofs.filter(p => p.id !== "legal-employer"); reveal.evidence = reveal.evidence.filter(id => id !== "legal-employer");
    expect(() => assertMeetStoryEvidence(changed, evidence)).toThrow("title and employer");
  });
  it("rejects unreadable details and clipped or invented claim text", () => {
    const tall = evidence.map(e => e.id === "legal-category" ? { ...e, crop: { ...e.crop, y: 0, height: 890 } } : e);
    expect(() => assertMeetStoryEvidence(story, tall)).toThrow("20px");
    const marginal = evidence.map(e => e.id === "legal-category" ? { ...e, textHeight: 5 } : e);
    expect(() => assertMeetStoryEvidence(story, marginal)).toThrow("28px");
    const changed = evidence.map(e => e.id === "partners-title" ? { ...e, text: "Economic Mobility Partnerships" } : e);
    expect(() => assertMeetStoryEvidence(story, changed)).toThrow("Required evidence");
  });
  it("rejects unsupported phased proofs, action times and unaligned captions", () => {
    const scene = filmFixture().scenes.find(s => s.layout === "legal-reveal")!;
    expect(meetSceneSchema.safeParse({ ...scene, proofs: scene.proofs.map(p => ({ ...p, phase: "after" })) }).success).toBe(false);
    const late = filmFixture(); late.scenes[0]!.actionFrame = 61;
    expect(meetFilmSchema.safeParse(late).success).toBe(false);
    expect(meetFilmSchema.safeParse({ ...filmFixture(), alignment: { source: "estimated", coverage: 1 } }).success).toBe(false);
  });
  it("blocks a delayed introduction or a presenter that covers the entire film", () => {
    const late = filmFixture(); late.scenes.find(s => s.layout === "meet")!.from = 270;
    expect(() => auditMeetFilm(late)).toThrow("pacing");
    const crowded = filmFixture(); crowded.scenes.forEach(s => { s.presenter = "center"; });
    expect(() => auditMeetFilm(crowded)).toThrow("50–70%");
  });
});
