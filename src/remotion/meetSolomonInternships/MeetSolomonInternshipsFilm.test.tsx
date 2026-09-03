import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import storyJson from "../../../fixtures/meet-solomon/internships-v1.json";
import { INTERNSHIP_CTA, meetSceneSchema } from "../../shared/meetSolomonInternships";
import { meetEvidenceSchema } from "../../shared/meetSolomon";
import { InternshipCTA, InternshipProof, internshipPresenterPlan, internshipPresenterPosition } from "./MeetSolomonInternshipsFilm";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

vi.mock("remotion", () => ({ AbsoluteFill: "div", Audio: "audio", Img: "img", staticFile: (file: string) => `/${file}`, useCurrentFrame: () => 0 }));

describe("Internship visual contract", () => {
  const scenes = storyJson.scenes.map(s => meetSceneSchema.parse({ ...s, from: 0, to: 100, actionFrame: 25, phrases: [] }));
  it("holds a complete action CTA with no invented link or fake button", () => {
    const html = renderToStaticMarkup(<InternshipCTA />);
    expect(html).toContain(`data-internship-cta="${INTERNSHIP_CTA}"`);
    expect(html).toContain("internship<br/>search."); expect(html).toContain("Solomon.");
    expect(html).not.toMatch(/href=|<button|comment|subscribe/i);
  });
  it("keeps the presenter mouthless and clears it from major proof shots", () => {
    for (const scene of scenes) {
      const plan = internshipPresenterPlan(scene), html = renderToStaticMarkup(<RobotMascotV22Rig plan={plan} frame={35} mouthless />);
      expect(plan.audioFrames.every(f => !f.speaking)).toBe(true);
      expect(html).not.toContain('d="M286 365 H374"');
      if (["intern-reveal", "tracker-view"].includes(scene.layout)) expect(html).toBe("");
    }
    const push = scenes.find(s => s.layout === "tabs")!;
    expect(internshipPresenterPosition(push, 35).x).toBeLessThan(internshipPresenterPosition(push, 0).x);
  });
  it("uses original source pixels and refuses unreadable internship evidence", () => {
    const e = meetEvidenceSchema.parse({ id: "intern-role", file: "sample.png", sha256: "a".repeat(64), capturedAt: "2026-08-11T03:14:16.938Z",
      source: "archived-product-capture", approved: true, sourceWidth: 1440, sourceHeight: 900,
      crop: { x: 320, y: 437, width: 121, height: 24 }, text: "Marketing Intern", textHeight: 10 });
    const p = { id: e.id, x: 70, y: 590, w: 940, h: 140, phase: "always" as const };
    const html = renderToStaticMarkup(<InternshipProof evidence={e} placement={p} />);
    expect(html).toContain('src="/sample.png"'); expect(html).not.toContain(">Marketing Intern<");
    expect(() => renderToStaticMarkup(<InternshipProof evidence={e} placement={{ ...p, h: 30 }} />)).toThrow("Unreadable");
  });
});
