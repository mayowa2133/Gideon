import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import storyJson from "../../../fixtures/meet-solomon/too-late.json";
import { meetSceneSchema } from "../../shared/meetSolomon";
import { presenterPlan } from "./MeetSolomonFilm";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

describe("Meet presenter direction", () => {
  const scenes = storyJson.scenes.map(s => meetSceneSchema.parse({ ...s, from: 0, to: 75, phrases: [] }));
  it("gives every visible presenter a valid performance and attention target", () => {
    for (const s of scenes) {
      const p = presenterPlan(s);
      expect(p.interactionTarget).toBeDefined();
      expect(p.left.timing.peak).not.toBe(p.right.timing.peak);
      expect(p.audioFrames.every(a => !a.speaking)).toBe(true);
    }
  });
  it("removes the mouth without changing the default V22 rig", () => {
    const plan = presenterPlan(scenes[0]!);
    const legacy = renderToStaticMarkup(<RobotMascotV22Rig plan={plan} frame={30} />);
    const mouthless = renderToStaticMarkup(<RobotMascotV22Rig plan={plan} frame={30} mouthless />);
    expect(legacy).toContain('d="M286 365 H374"');
    expect(mouthless).not.toContain('d="M286 365 H374"');
    expect(mouthless).toContain("data-v22-face");
  });
  it("makes full-screen reveals genuinely presenter-free", () => {
    for (const s of scenes.filter(s => ["stale", "fresh", "compare", "question"].includes(s.layout))) {
      const plan = presenterPlan(s);
      expect(renderToStaticMarkup(<RobotMascotV22Rig plan={plan} frame={30} mouthless />)).toBe("");
    }
  });
});
