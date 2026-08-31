import { describe, expect, it } from "vitest";
import { assertMeetStoryEvidence, assertVerification, auditMeetFilm, listingSchema, meetStorySchema, realCta } from "./meetSolomonRealInternships";
import type { MeetEvidence } from "./meetSolomon";

const date = "2026-08-31T12:00:00.000Z";
const listing = { employer: "Figma", role: "Software Engineer Intern", employerPageRole: "Software Engineer Intern", employerUrl: "https://boards.greenhouse.io/figma/jobs/6131089004", verifiedAt: date, verificationFile: "employer.txt", verificationSha256: "a".repeat(64), applicationControlObserved: true, productUrl: "http://localhost:5173/jobs/test", captureMode: "real-product-live-data", accountContext: "existing-local-development-session", sampleData: false };
function inputs() {
  const layouts = ["hook", "reveal", "meet", "overview", "employer", "location", "reset", "requirements", "fit", "posting", "caveat", "cta"];
  const evidence: MeetEvidence[] = [{ id: "role", file: "detail.png", sha256: "b".repeat(64), capturedAt: date, source: "current-product-capture", approved: true, sourceWidth: 1280, sourceHeight: 720, kind: "proof", crop: { x: 20, y: 30, width: 400, height: 40 }, text: "Figma Software Engineer Intern", textHeight: 18 }];
  const story = meetStorySchema.parse({ version: "meet-solomon-real-internships-v1", id: "real-software", title: "Real internship", category: "software", listing, requiredEvidence: { role: "Software Engineer Intern" }, scenes: layouts.map((layout, i) => ({ id: layout, layout, vo: layout === "cta" ? realCta("software") : layout === "caveat" ? "Listings can change." : "Explore the internship.", headline: "An internship", background: "ivory", presenter: "center", expression: "friendly", gesture: "open_palm", action: "present", evidence: i === 1 ? ["role"] : [], proofs: i === 1 ? [{ id: "role", x: 65, y: 600, w: 950, h: 200 }] : [], newInformation: "Verified role information.", visualMetaphor: "Original product capture.", transition: "Editorial cut between scenes." })) });
  return { story, evidence };
}
describe("real internship source boundary", () => {
  it("accepts current readable evidence for a verified real listing", () => {
    const { story, evidence } = inputs(); expect(assertMeetStoryEvidence(story, evidence)).toHaveLength(1);
    expect(() => assertVerification(story.listing, "Figma Software Engineer Intern Apply", "a".repeat(64))).not.toThrow();
  });
  it.each([{ sampleData: true }, { captureMode: "offline-component-demo" }, { employer: "Example Software Studio" }, { employerUrl: "http://employer.invalid/job" }, { applicationControlObserved: false }])("rejects demo/unverified metadata %j", patch => {
    expect(listingSchema.safeParse({ ...listing, ...patch }).success).toBe(false);
  });
  it("rejects altered employer verification", () => {
    const { story } = inputs(); expect(() => assertVerification(story.listing, "Figma Software Engineer Intern Apply", "c".repeat(64))).toThrow(/hash/);
  });
  it.each(["Figma Software Engineer Intern", "Different company Software Engineer Intern Apply", "Figma Senior Engineer Apply"])("rejects a verification page without matching identity and Apply: %s", text => {
    expect(() => assertVerification(inputs().story.listing, text, "a".repeat(64))).toThrow(/exact internship/);
  });
  it("rejects archived and stale product evidence", () => {
    const { story, evidence } = inputs(); evidence[0]!.source = "archived-product-capture";
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow(/current/);
    evidence[0]!.source = "current-product-capture"; evidence[0]!.capturedAt = "2026-08-25T12:00:00.000Z";
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow(/one day/);
  });
  it("does not mix another job into the proof", () => {
    const { story, evidence } = inputs(); evidence.push({ ...evidence[0]!, id: "another", sha256: "c".repeat(64) });
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow(/mix listings/);
  });
  it("requires the employer beside the internship in the reveal, not elsewhere in inventory", () => {
    const { story, evidence } = inputs();
    evidence[0]!.text = "Software Engineer Intern";
    evidence.push({ ...evidence[0]!, id: "company", text: "Figma" });
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow(/same-scene/);
    story.scenes[1]!.evidence.push("company");
    story.scenes[1]!.proofs.push({ id: "company", x: 65, y: 900, w: 950, h: 200, phase: "always" });
    expect(() => assertMeetStoryEvidence(story, evidence)).not.toThrow();
  });
  it("rejects readable-looking but too small source text", () => {
    const { story, evidence } = inputs(); evidence[0]!.textHeight = 10;
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow(/readability/);
  });
  it("rejects unrecorded interactions and missing final CTA", () => {
    const { story, evidence } = inputs(); story.scenes[1]!.proofs[0]!.phase = "after";
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow();
    story.scenes[1]!.proofs[0]!.phase = "always"; story.scenes[11]!.vo = "Thanks for watching.";
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow(/CTA/);
  });
  it("requires enough final CTA reading time", () => {
    const { story, evidence } = inputs(); const film = { ...story, fps: 30 as const, durationInFrames: 1080, evidence, narrationSrc: "narration.wav" as const, alignment: { source: "aligned" as const, coverage: 1 }, reviewOnly: true as const, scenes: story.scenes.map((s, i) => ({ ...s, from: i * 90, to: (i + 1) * 90, phrases: [], actionFrame: 0 })) };
    expect(auditMeetFilm(film).ctaSeconds).toBe(3);
    film.scenes[11]!.from = 1050; expect(() => auditMeetFilm(film)).toThrow(/CTA/);
  });
});
