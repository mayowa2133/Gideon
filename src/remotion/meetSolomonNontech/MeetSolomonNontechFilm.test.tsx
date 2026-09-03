import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import storyJson from "../../../fixtures/meet-solomon/nontech-v1.json";
import { meetSceneSchema } from "../../shared/meetSolomonNontech";
import { meetEvidenceSchema } from "../../shared/meetSolomon";
import { NontechProof, nontechPresenterPlan, nontechPresenterPosition } from "./MeetSolomonNontechFilm";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

vi.mock("remotion", () => ({ AbsoluteFill: "div", Audio: "audio", Img: "img", staticFile: (file: string) => `/${file}`, useCurrentFrame: () => 0 }));

describe("Meet Solomon #5 visual proof and performance", () => {
  const scenes = storyJson.scenes.map(s => meetSceneSchema.parse({ ...s, from: 0, to: 90, actionFrame: 25, phrases: [] }));
  it("keeps mouths absent and removes the presenter for major proof reveals", () => {
    for (const s of scenes) {
      const plan = nontechPresenterPlan(s), markup = renderToStaticMarkup(<RobotMascotV22Rig plan={plan} frame={35} mouthless />);
      expect(markup).not.toContain('d="M286 365 H374"');
      expect(plan.audioFrames.every(f => !f.speaking)).toBe(true);
      if (["legal-reveal", "partners-reveal", "company-view"].includes(s.layout)) expect(markup).toBe("");
    }
  });
  it("makes the callback a distinct two-hand payoff with independent peaks", () => {
    const scene = scenes.find(s => s.layout === "callback")!, plan = nontechPresenterPlan(scene);
    expect(plan.narrativePurpose).toBe("payoff_reaction");
    expect(plan.left.gesture).toBe("open_palm"); expect(plan.right.gesture).toBe("open_palm");
    expect(plan.left.timing.peak).not.toBe(plan.right.timing.peak);
    const push = scenes.find(s => s.layout === "only-code")!;
    expect(nontechPresenterPosition(push, 35).x).toBeLessThan(nontechPresenterPosition(push, 0).x);
  });
  it("draws original crop pixels and refuses a proof too small to read", () => {
    const evidence = meetEvidenceSchema.parse({ id: "legal-title", file: "source.png", sha256: "a".repeat(64), capturedAt: "2026-08-25T01:09:59.579Z",
      source: "archived-product-capture", approved: true, sourceWidth: 1440, sourceHeight: 900, crop: { x: 153, y: 626, width: 232, height: 24 }, text: "IP Counsel", textHeight: 11 });
    const placement = { id: evidence.id, x: 65, y: 835, w: 950, h: 155, phase: "always" as const };
    const html = renderToStaticMarkup(<NontechProof evidence={evidence} placement={placement} />);
    expect(html).toContain('src="/source.png"');
    expect(html).not.toContain(">IP Counsel<");
    expect(() => renderToStaticMarkup(<NontechProof evidence={evidence} placement={{ ...placement, h: 10 }} />)).toThrow("Unreadable");
  });
});
