import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import finance from "../../../fixtures/meet-solomon/finance-internships-v1.json";
import software from "../../../fixtures/meet-solomon/software-internships-v1.json";
import law from "../../../fixtures/meet-solomon/law-internships-v1.json";
import { categoryCta, meetSceneSchema, meetStorySchema } from "../../shared/meetSolomonCategories";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";
import { CategoryCTA, categoryPresenterPlan, categoryPresenterPosition } from "./MeetSolomonCategoriesFilm";

describe.each([finance, software, law])("category compositor $category", raw => {
  const story = meetStorySchema.parse(raw);
  const scenes = story.scenes.map((s, i) => meetSceneSchema.parse({ ...s, from: i * 72, to: (i + 1) * 72, actionFrame: 20, phrases: [] }));
  it("shows the complete category CTA without a false link or delivery promise", () => {
    const html = renderToStaticMarkup(<CategoryCTA category={story.category} />);
    expect(html).toContain(`data-category-cta="${categoryCta(story.category)}"`);
    expect(html).toContain(`${story.category} internship<br/>search.`);
    expect(html).toContain("Solomon.");
    expect(html).not.toMatch(/href=|<button|comment|subscribe/i);
  });
  it("keeps the robot mouthless and clears it from full product proof", () => {
    for (const scene of scenes) {
      const plan = categoryPresenterPlan(scene), html = renderToStaticMarkup(<RobotMascotV22Rig plan={plan} frame={35} mouthless />);
      expect(plan.audioFrames.every(f => !f.speaking)).toBe(true);
      expect(html).not.toContain('d="M286 365 H374"');
      if (["role-reveal", "category-detail", "tracker-view", "recap"].includes(scene.layout)) expect(html).toBe("");
    }
    const close = scenes.find(s => s.presenter === "close")!;
    expect(categoryPresenterPosition(close, 20).scale).toBeGreaterThan(categoryPresenterPosition(scenes[0]!, 20).scale);
  });
});
