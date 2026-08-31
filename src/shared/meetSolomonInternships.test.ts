import { describe, expect, it } from "vitest";
import storyJson from "../../fixtures/meet-solomon/internships-v1.json";
import { meetEvidenceSchema } from "./meetSolomon";
import { meetStorySchema as v2StorySchema } from "./meetSolomonV2";
import { meetStorySchema as nontechStorySchema } from "./meetSolomonNontech";
import { assertMeetStoryEvidence, auditMeetFilm, INTERNSHIP_CTA, meetFilmSchema, meetSceneSchema, meetStorySchema } from "./meetSolomonInternships";

const story = meetStorySchema.parse(storyJson);
const boxes: Record<string, [number, number, number, number, number]> = {
  "intern-role": [320, 437, 121, 24, 10], "intern-company": [320, 460, 96, 22, 9], "intern-card": [309, 425, 204, 89, 7],
  "intern-stage": [325, 275, 88, 24, 12], "tracker-title": [93, 82, 278, 37, 22], "tracker-view": [85, 70, 860, 450, 11],
};
const evidence = Object.entries(boxes).map(([id, [x, y, width, height, textHeight]]) => meetEvidenceSchema.parse({
  id, file: "sample.png", sha256: "a".repeat(64), capturedAt: "2026-08-11T03:14:16.938Z", source: "archived-product-capture", approved: true,
  sourceWidth: 1440, sourceHeight: 900, crop: { x, y, width, height }, textHeight,
  text: story.requiredEvidence[id] ?? "Sample tracker view", kind: id === "tracker-view" ? "establishing" : "proof",
}));
const filmFixture = () => meetFilmSchema.parse({ ...story, fps: 30, durationInFrames: 16 * 72, narrationSrc: "narration.wav", reviewOnly: true,
  alignment: { source: "aligned", coverage: .99 }, evidence,
  scenes: story.scenes.map((s, i) => ({ ...s, from: i * 72, to: (i + 1) * 72, phrases: [], actionFrame: 20 })),
});

describe("Internship story evidence and CTA", () => {
  it("keeps earlier formats closed and requires an explicit sample-data declaration", () => {
    expect(v2StorySchema.safeParse(storyJson).success).toBe(false);
    expect(nontechStorySchema.safeParse(storyJson).success).toBe(false);
    expect(meetStorySchema.safeParse({ ...storyJson, sampleData: false }).success).toBe(false);
    expect(assertMeetStoryEvidence(story, evidence).length).toBeGreaterThan(8);
    expect(auditMeetFilm(filmFixture()).ctaSeconds).toBe(2.4);
  });
  it("rejects role/company/source mismatches, including the compiled film boundary", () => {
    const wrongSource = evidence.map(e => e.id === "intern-company" ? { ...e, sha256: "b".repeat(64) } : e);
    expect(() => assertMeetStoryEvidence(story, wrongSource)).toThrow("share the captured source");
    expect(meetFilmSchema.safeParse({ ...filmFixture(), evidence: wrongSource }).success).toBe(false);
    const wrongCard = evidence.map(e => e.id === "intern-company" ? { ...e, crop: { ...e.crop, y: 530 } } : e);
    expect(() => assertMeetStoryEvidence(story, wrongCard)).toThrow("same internship card");
  });
  it("will not borrow a stage heading from a neighboring column", () => {
    const wrong = evidence.map(e => e.id === "intern-stage" ? { ...e, crop: { ...e.crop, x: 540 } } : e);
    expect(() => assertMeetStoryEvidence(story, wrong)).toThrow("same captured column");
  });
  it("requires the demo disclosure and internship proof to remain visible", () => {
    const missing = structuredClone(story), reveal = missing.scenes.find(s => s.layout === "intern-reveal")!;
    reveal.vo = "Marketing Intern. In Solomon's tracker.";
    expect(() => assertMeetStoryEvidence(missing, evidence)).toThrow("say demo");
    const hidden = structuredClone(story), stage = hidden.scenes.find(s => s.layout === "stage")!;
    stage.proofs = stage.proofs.filter(p => p.id !== "intern-role"); stage.evidence = stage.evidence.filter(id => id !== "intern-role");
    expect(() => assertMeetStoryEvidence(hidden, evidence)).toThrow("show its internship role");
  });
  it("rejects unreadable proof and generic roles substituted for internships", () => {
    const tiny = evidence.map(e => e.id === "intern-card" ? { ...e, textHeight: 5 } : e);
    expect(() => assertMeetStoryEvidence(story, tiny)).toThrow("28px");
    const changed = structuredClone(story); changed.requiredEvidence["intern-role"] = "Product Engineer";
    expect(() => assertMeetStoryEvidence(changed, evidence.map(e => e.id === "intern-role" ? { ...e, text: "Product Engineer" } : e))).toThrow("name an internship");
  });
  it("requires the final informational CTA, without adding delivery or URL promises", () => {
    expect(story.scenes.at(-1)?.vo).toBe(INTERNSHIP_CTA);
    const changed = structuredClone(story); changed.scenes.at(-1)!.vo = "Comment INTERN and we will send you jobs.";
    expect(() => assertMeetStoryEvidence(changed, evidence)).toThrow("explicit internship CTA");
    const rushed = filmFixture(); rushed.scenes.at(-1)!.from = rushed.durationInFrames - 45;
    expect(() => auditMeetFilm(rushed)).toThrow("2.3–4.5");
  });
  it("rejects phased proof, estimated captions and action times outside the shot", () => {
    const film = filmFixture(), scene = film.scenes.find(s => s.layout === "stage")!;
    expect(meetSceneSchema.safeParse({ ...scene, proofs: scene.proofs.map(p => ({ ...p, phase: "after" })) }).success).toBe(false);
    expect(meetFilmSchema.safeParse({ ...film, alignment: { source: "estimated", coverage: 1 } }).success).toBe(false);
    film.scenes[0]!.actionFrame = 73;
    expect(meetFilmSchema.safeParse(film).success).toBe(false);
  });
});
