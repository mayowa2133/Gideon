import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import storyJson from "../../../fixtures/meet-solomon/what-changed-v2.json";
import { meetSceneSchema } from "../../shared/meetSolomonV2";
import { presenterDirection, presenterPlanV2 } from "./MeetSolomonFilmV2";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

vi.mock("remotion", () => ({ AbsoluteFill: "div", Audio: "audio", Img: "img", staticFile: (file: string) => `/${file}`, useCurrentFrame: () => 0 }));

describe("Meet V2 deliberate presenter actions", () => {
  const scenes = storyJson.scenes.map(s => meetSceneSchema.parse({ ...s, from: 0, to: 90, actionFrame: 30, phrases: [] }));
  it("directs gaze to the proof before the independent gesture peaks", () => {
    for (const s of scenes.filter(s => s.presenter !== "absent")) {
      const plan = presenterPlanV2(s);
      expect(plan.gazePath[1]!.frame).toBeLessThan(Math.min(plan.left.timing.peak, plan.right.timing.peak));
      expect(plan.interactionTarget!.elementId).toBe(s.proofs.find(p => p.phase !== "before")?.id ?? "question-card");
      expect(plan.left.timing.peak).not.toBe(plan.right.timing.peak);
    }
  });
  it("leans into inspection, pushes with the departing object, then settles", () => {
    const inspect = scenes.find(s => s.id === "role")!;
    expect(presenterDirection(inspect, 40).y).toBeLessThan(presenterDirection(inspect, 0).y);
    const push = scenes.find(s => s.layout === "question")!;
    expect(presenterDirection(push, 40).x).toBeLessThan(presenterDirection(push, 0).x);
    expect(presenterDirection(push, 89)).toEqual(presenterDirection(push, 90));
  });
  it("keeps no-mouth narration and full product shots free of a presenter", () => {
    for (const s of scenes) {
      const plan = presenterPlanV2(s);
      const rendered = renderToStaticMarkup(<RobotMascotV22Rig plan={plan} frame={40} mouthless />);
      expect(plan.audioFrames.every(a => !a.speaking)).toBe(true);
      expect(rendered).not.toContain('d="M286 365 H374"');
      if (["field", "filter", "feed", "age", "fresh"].includes(s.layout)) expect(rendered).toBe("");
    }
  });
});
