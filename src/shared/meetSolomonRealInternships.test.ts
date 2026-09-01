import { describe, expect, it } from "vitest";
import { assertMeetStoryEvidence, assertVerification, auditMeetFilm, isMotionLedRealInternship, listingSchema, meetStorySchema, realCta, realOpportunityMotionProfile } from "./meetSolomonRealInternships";
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
  it("grounds benefit-led V2 in resume-tailoring and checklist product proof", () => {
    const { story, evidence } = inputs(); story.version = "meet-solomon-real-internships-v2";
    story.scenes[7]!.vo = "Upload your resume and Solomon helps tailor it to the role.";
    story.scenes[8]!.vo = "Keep your application organised with Solomon's checklist.";
    for (const [index, id, text] of [[7, "tailoring", "Resume-backed scoring and tailoring"], [8, "checklist", "Resume uploaded Resume tailored Applied"]] as const) {
      evidence.push({ ...evidence[0]!, id, text });
      story.scenes[index]!.evidence.push(id); story.scenes[index]!.proofs.push({ id, x: 65, y: 600, w: 950, h: 200, phase: "always" });
    }
    expect(() => assertMeetStoryEvidence(story, evidence)).not.toThrow();
    story.scenes[7]!.vo = "Solomon will make sure your resume matches.";
    expect(() => assertMeetStoryEvidence(story, evidence)).toThrow(/guarantees/);
  });
  it("supports motion-led V3 and the new-grad audience CTA", () => {
    const { story, evidence } = inputs(); story.version = "meet-solomon-real-internships-v3";
    story.scenes[7]!.vo = "Upload your resume and Solomon helps tailor it to the role.";
    story.scenes[8]!.vo = "Keep your application organised with Solomon's checklist.";
    for (const [index, id, text] of [[7, "tailoring", "Resume-backed scoring and tailoring"], [8, "checklist", "Workflow Checklist"]] as const) {
      evidence.push({ ...evidence[0]!, id, text }); story.scenes[index]!.evidence.push(id); story.scenes[index]!.proofs.push({ id, x: 65, y: 600, w: 950, h: 200, phase: "always" });
    }
    expect(() => assertMeetStoryEvidence(story, evidence)).not.toThrow();
    expect(isMotionLedRealInternship(story.version)).toBe(true);
    expect(isMotionLedRealInternship("meet-solomon-real-internships-v2")).toBe(false);
    expect(realOpportunityMotionProfile(story.version)).toBe("continuous");
    expect(realOpportunityMotionProfile("meet-solomon-real-opportunities-v4")).toBe("settled");
    expect(realCta("new_grad")).toBe("Start your first job search with Solomon.");
  });
  it("grounds the new-grad angle in the automatic feed and opportunity stages", () => {
    const { story, evidence } = inputs();
    story.version = "meet-solomon-real-internships-v3";
    story.category = "new_grad";
    story.listing = listingSchema.parse({ ...listing, employer: "Cerebras", role: "Software Engineer - New Grad 2026", employerPageRole: "Software Engineer - New Grad 2026" });
    story.requiredEvidence.role = "Software Engineer - New Grad 2026";
    evidence[0]!.text = "Cerebras Software Engineer - New Grad 2026";
    for (const [index, id, text, vo] of [
      [7, "auto-populate", "Jobs populate automatically from your profile", "Jobs populate automatically from your profile."],
      [8, "workflow", "Stage: Interested Applied Interviewing", "Use Solomon's stages to track every opportunity."],
    ] as const) {
      evidence.push({ ...evidence[0]!, id, text });
      story.scenes[index]!.vo = vo;
      story.scenes[index]!.evidence.push(id);
      story.scenes[index]!.proofs.push({ id, x: 65, y: 600, w: 950, h: 200, phase: "always" });
    }
    story.scenes.at(-1)!.vo = realCta("new_grad");
    expect(() => assertMeetStoryEvidence(story, evidence)).not.toThrow();
    expect(() => assertVerification(story.listing, "Cerebras Software Engineer - New Grad 2026 Apply", "a".repeat(64))).not.toThrow();
  });
  it("supports a settled career-switcher cut grounded in a customer-success opportunity", () => {
    const { story, evidence } = inputs();
    story.version = "meet-solomon-real-opportunities-v4";
    story.category = "career_switcher";
    story.listing = listingSchema.parse({ ...listing, employer: "Recharge", role: "Customer Success Manager (Toronto)", employerPageRole: "Customer Success Manager (Toronto)" });
    story.requiredEvidence.role = "Customer Success Manager (Toronto)";
    evidence[0]!.text = "Recharge Customer Success Manager (Toronto)";
    for (const [index, id, text, vo] of [
      [7, "auto-populate", "Jobs populate automatically from your profile", "Jobs populate automatically from your profile."],
      [8, "workflow", "Stage: Discovered Interested Applied Interviewing", "Track the opportunity through Solomon's stages."],
    ] as const) {
      evidence.push({ ...evidence[0]!, id, text });
      story.scenes[index]!.vo = vo;
      story.scenes[index]!.evidence.push(id);
      story.scenes[index]!.proofs.push({ id, x: 65, y: 600, w: 950, h: 200, phase: "always" });
    }
    story.scenes.at(-1)!.vo = realCta("career_switcher");
    expect(() => assertMeetStoryEvidence(story, evidence)).not.toThrow();
    expect(realCta("career_switcher")).toBe("Make your next career move with Solomon.");
  });
});
