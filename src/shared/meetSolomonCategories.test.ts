import { describe, expect, it } from "vitest";
import finance from "../../fixtures/meet-solomon/finance-internships-v1.json";
import software from "../../fixtures/meet-solomon/software-internships-v1.json";
import law from "../../fixtures/meet-solomon/law-internships-v1.json";
import { meetEvidenceSchema } from "./meetSolomon";
import { meetStorySchema as v2StorySchema } from "./meetSolomonV2";
import { meetStorySchema as internshipStorySchema } from "./meetSolomonInternships";
import { assertMeetStoryEvidence, auditMeetFilm, categoryCta, meetFilmSchema, meetSceneSchema, meetStorySchema, type InternshipCategory } from "./meetSolomonCategories";

const stories = [finance, software, law].map(s => meetStorySchema.parse(s));
const boxes: Record<InternshipCategory, Record<string, [number, number, number, number, number]>> = {
  finance: { role: [91,315,185,22,10], company: [91,338,185,21,9], "role-card": [78,302,211,91,9], stage: [94,274,52,24,10], "detail-role": [994,289,111,25,12], "category-detail": [994,520,194,22,10] },
  software: { role: [314,314,146,40,10], company: [314,356,143,20,9], "role-card": [301,302,211,129,9], stage: [317,275,82,22,10], "detail-role": [994,290,352,24,12], "category-detail": [1007,572,161,32,9] },
  law: { role: [91,314,82,23,10], company: [91,338,121,20,9], "role-card": [78,302,211,91,9], stage: [94,275,52,22,10], "detail-role": [994,289,93,25,12], "category-detail": [994,520,268,22,10] },
};
function fixture(category: InternshipCategory) {
  const story = stories.find(s => s.category === category)!;
  const evidence = Object.entries({ ...boxes[category], "tracker-view": [73,70,894,374,10] }).map(([id, [x, y, width, height, textHeight]]) => meetEvidenceSchema.parse({
    id, file: id.includes("detail") ? "detail.png" : "tracker.png", sha256: (id.includes("detail") ? "b" : "a").repeat(64), capturedAt: "2026-08-31T02:00:00.000Z",
    source: "current-product-capture", approved: true, sourceWidth: 1440, sourceHeight: 900, crop: { x, y, width, height }, textHeight,
    text: story.requiredEvidence[id] ?? "Offline tracker demo", kind: id === "tracker-view" ? "establishing" : "proof",
  }));
  const film = meetFilmSchema.parse({ ...story, fps: 30, durationInFrames: 1170, narrationSrc: "narration.wav", reviewOnly: true,
    alignment: { source: "aligned", coverage: .99 }, evidence,
    scenes: story.scenes.map((s, i) => ({ ...s, from: i * 72, to: i === 15 ? 1170 : (i + 1) * 72, phrases: [], actionFrame: 20 })),
  });
  return { story: structuredClone(story), evidence, film };
}

describe.each(["finance", "software", "law"] as const)("%s internship boundary", category => {
  it("accepts category-specific cards, including wrapped software titles, without changing older formats", () => {
    const { story, evidence } = fixture(category);
    expect(assertMeetStoryEvidence(story, evidence).length).toBeGreaterThan(8);
    expect(v2StorySchema.safeParse(story).success).toBe(false);
    expect(internshipStorySchema.safeParse(story).success).toBe(false);
    expect(meetStorySchema.safeParse({ ...story, sampleData: false }).success).toBe(false);
    expect(meetStorySchema.safeParse({ ...story, captureMode: "authenticated" }).success).toBe(false);
  });
  it("rejects another category's proof even when requiredEvidence is empty", () => {
    const { story, evidence, film } = fixture(category);
    for (const id of ["role", "company", "stage", "detail-role", "category-detail"]) {
      const changed = evidence.map(e => e.id === id ? { ...e, text: "Other role or claim" } : e);
      expect(() => assertMeetStoryEvidence({ ...story, requiredEvidence: {} }, changed)).toThrow("wrong internship category");
      expect(meetFilmSchema.safeParse({ ...film, evidence: changed }).success).toBe(false);
    }
  });
  it("rejects mixed captures and detached role, employer, stage or detail", () => {
    const { story, evidence } = fixture(category);
    const wrongSource = evidence.map(e => e.id === "company" ? { ...e, sha256: "c".repeat(64) } : e);
    expect(() => assertMeetStoryEvidence(story, wrongSource)).toThrow("share a source");
    const outside = evidence.map(e => e.id === "company" ? { ...e, crop: { ...e.crop, y: 700 } } : e);
    expect(() => assertMeetStoryEvidence(story, outside)).toThrow("same captured card");
    const column = evidence.map(e => e.id === "stage" ? { ...e, crop: { ...e.crop, x: 700 } } : e);
    expect(() => assertMeetStoryEvidence(story, column)).toThrow("same original column");
    const panel = evidence.map(e => e.id === "category-detail" ? { ...e, file: "tracker.png" } : e);
    expect(() => assertMeetStoryEvidence(story, panel)).toThrow("selected role's source panel");
  });
  it("requires visible evidence, a spoken demo disclosure and legible text", () => {
    const { story, evidence } = fixture(category);
    const hidden = structuredClone(story), detail = hidden.scenes.find(s => s.layout === "category-detail")!;
    detail.proofs = []; detail.evidence = [];
    expect(() => assertMeetStoryEvidence(hidden, evidence)).toThrow("selected role with its category detail");
    story.scenes.find(s => s.layout === "role-reveal")!.vo = "Here is an internship.";
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow("spoken demo disclosure");
    const tiny = evidence.map(e => e.id === "role-card" ? { ...e, textHeight: 5 } : e);
    expect(() => assertMeetStoryEvidence(fixture(category).story, tiny)).toThrow("28px");
  });
  it("requires its category CTA as the final scene and holds it long enough", () => {
    const { story, evidence, film } = fixture(category);
    expect(story.scenes.at(-1)!.vo).toBe(categoryCta(category));
    const wrong = structuredClone(story); wrong.scenes.at(-1)!.vo = "Comment INTERN for a list of jobs.";
    expect(() => assertMeetStoryEvidence(wrong, evidence)).toThrow("category-specific CTA");
    const rushed = structuredClone(film); rushed.scenes.at(-1)!.from = rushed.durationInFrames - 45;
    expect(() => auditMeetFilm(rushed)).toThrow("2.8–4.8");
    // Presenter time is a duration-weighted editorial gate, independent of count.
    const balanced = structuredClone(film); balanced.scenes.find(s => s.layout === "criteria")!.presenter = "absent";
    expect(auditMeetFilm(balanced).ctaSeconds).toBe(3);
  });
  it("fails closed on hidden proof phases, estimated captions and invalid action times", () => {
    const { film } = fixture(category), scene = film.scenes.find(s => s.layout === "stage")!;
    expect(meetSceneSchema.safeParse({ ...scene, proofs: scene.proofs.map(p => ({ ...p, phase: "after" })) }).success).toBe(false);
    expect(meetFilmSchema.safeParse({ ...film, alignment: { source: "estimated", coverage: 1 } }).success).toBe(false);
    expect(meetFilmSchema.safeParse({ ...film, captureMode: "authenticated" }).success).toBe(false);
    film.scenes[0]!.actionFrame = 73;
    expect(meetFilmSchema.safeParse(film).success).toBe(false);
  });
});
