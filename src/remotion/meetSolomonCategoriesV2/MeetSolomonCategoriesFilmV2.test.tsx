import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import finance from "../../../fixtures/meet-solomon/finance-internships-v2.json";
import software from "../../../fixtures/meet-solomon/software-internships-v2.json";
import law from "../../../fixtures/meet-solomon/law-internships-v2.json";
import { asBaseScene, categoryCta, meetSceneSchema, meetStorySchema } from "../../shared/meetSolomonCategoriesV2";
import { proofIsVisible } from "../../shared/meetSolomonV2";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";
import { CategoryCTA, InteractionArt, presenterPlan, presenterPosition } from "./MeetSolomonCategoriesFilmV2";
describe.each([finance,software,law])("V2 compositor $category", raw=>{
  const story=meetStorySchema.parse(raw),scenes=story.scenes.map((s,i)=>meetSceneSchema.parse({...s,from:i*75,to:(i+1)*75,actionFrame:35,phrases:[]}));
  it("renders the full tracking CTA with no unverified destination",()=>{
    const html=renderToStaticMarkup(<CategoryCTA category={story.category}/>);
    expect(html).toContain(`data-category-v2-cta="${categoryCta(story.category)}"`);
    expect(html).toContain('Organise your');expect(html).toContain(`${story.category} internship<br/>applications.`);
    expect(html).not.toMatch(/search|href=|<button|comment/i);
  });
  it("switches actual source states exactly at the cut and discloses the edit",()=>{
    const s=scenes.find(s=>s.layout==='open-detail')!;
    expect(s.proofs.filter(p=>proofIsVisible(p,asBaseScene(s),34)).map(p=>p.id)).toEqual(['open-before']);
    expect(s.proofs.filter(p=>proofIsVisible(p,asBaseScene(s),35)).map(p=>p.id)).toEqual(['open-after']);
    const html=renderToStaticMarkup(<InteractionArt scene={s} frame={35}/>);
    expect(html).toContain('data-capture-state="after"');expect(html).toContain('EDITORIAL BEFORE / AFTER CUT');
  });
  it("makes room for the product while retaining a mouthless presenter",()=>{
    for(const s of scenes){const p=presenterPlan(s);expect(p.audioFrames.every(f=>!f.speaking)).toBe(true);
      const html=renderToStaticMarkup(<RobotMascotV22Rig plan={p} frame={35} mouthless/>);
      expect(html).not.toContain('d="M286 365 H374"');
      if(['role-reveal','open-detail','category-detail','tracker-view','criteria'].includes(s.layout))expect(html).toBe('');
    }
    expect(presenterPosition(scenes[0]!,20).scale).toBeLessThan(1.47);
  });
});
