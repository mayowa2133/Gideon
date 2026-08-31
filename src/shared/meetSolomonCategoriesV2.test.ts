import { describe, expect, it } from "vitest";
import finance from "../../fixtures/meet-solomon/finance-internships-v2.json";
import software from "../../fixtures/meet-solomon/software-internships-v2.json";
import law from "../../fixtures/meet-solomon/law-internships-v2.json";
import { meetEvidenceSchema } from "./meetSolomon";
import { meetStorySchema as v1Schema } from "./meetSolomonCategories";
import { assertInteraction, assertMeetStoryEvidence, auditMeetFilm, categoryCta, interactionSchema, meetFilmSchema, meetStorySchema, type InternshipCategory } from "./meetSolomonCategoriesV2";
const boxes: Record<InternshipCategory, Record<string, [number, number, number, number, number]>> = {
  finance: { role: [91,315,185,22,10], company: [91,338,185,21,9], "role-card": [78,302,211,91,9], stage: [94,274,52,24,10], "detail-role": [994,289,111,25,12], "category-detail": [994,520,194,22,10] },
  software: { role: [314,314,146,40,10], company: [314,356,143,20,9], "role-card": [301,302,211,129,9], stage: [317,275,82,22,10], "detail-role": [994,290,352,24,12], "category-detail": [1007,572,161,32,9] },
  law: { role: [91,314,82,23,10], company: [91,338,121,20,9], "role-card": [78,302,211,91,9], stage: [94,275,52,22,10], "detail-role": [994,289,93,25,12], "category-detail": [994,520,268,22,10] },
};
function fixture(raw: unknown) {
  const story = meetStorySchema.parse(raw), c = story.category;
  const evidence = Object.entries({ ...boxes[c], "tracker-view": [73,70,894,374,10], "open-before": [0,304,207,125,9], "open-after": [900,276,380,325,10] }).map(([id, [x,y,width,height,textHeight]]) => {
    const isOpen = id.startsWith("open-"), after = id === "open-after", detail = id.includes("detail");
    return meetEvidenceSchema.parse({ id, file: isOpen ? `${id}.png` : detail ? "detail.png" : "tracker.png", sha256: (isOpen ? after ? "d" : "c" : detail ? "b" : "a").repeat(64),
      capturedAt: after ? "2026-08-31T04:01:00.000Z" : "2026-08-31T04:00:00.000Z", source: "current-product-capture", approved: true, sourceWidth: isOpen ? 1280 : 1440, sourceHeight: isOpen ? 720 : 900,
      crop: { x,y,width,height }, textHeight, kind: ["tracker-view","open-after"].includes(id) ? "establishing" : "proof", text: story.requiredEvidence[id] ?? (id === "open-before" ? story.requiredEvidence["role-card"] : "Offline demo context") });
  });
  const interaction = interactionSchema.parse({ category:c,action:"select-sample-role",mode:"offline-component-demo",beforeSha256:"c".repeat(64),afterSha256:"d".repeat(64),beforeCapturedAt:"2026-08-31T04:00:00.000Z",afterCapturedAt:"2026-08-31T04:01:00.000Z",edit:"before-after-hard-cut",continuousRecording:false });
  const film = meetFilmSchema.parse({ ...story, fps:30,durationInFrames:930,narrationSrc:"narration.wav",reviewOnly:true,alignment:{source:"aligned",coverage:.98},evidence,interaction,
    scenes:story.scenes.map((s,i)=>({...s,from:i*75,to:i===11?930:(i+1)*75,phrases:[],actionFrame:40})) });
  return { story, evidence, interaction, film };
}
describe.each([finance,software,law])("category V2 $category", raw => {
  it("keeps V1 closed and accepts the shorter evidenced format", () => {
    const {story,evidence,film}=fixture(raw);
    expect(v1Schema.safeParse(raw).success).toBe(false);
    expect(assertMeetStoryEvidence(story,evidence).length).toBeGreaterThan(8);
    expect(auditMeetFilm(film).durationSeconds).toBe(31);
    expect(meetStorySchema.safeParse({...story,sampleData:false}).success).toBe(false);
  });
  it("binds the real state change to both sources and its category",()=>{
    const {story,evidence,interaction,film}=fixture(raw);
    expect(assertInteraction(story.category,evidence,interaction)).toEqual(interaction);
    const wrong={...interaction,afterSha256:"e".repeat(64)};
    expect(()=>assertInteraction(story.category,evidence,wrong)).toThrow("both source captures");
    expect(meetFilmSchema.safeParse({...film,interaction:wrong}).success).toBe(false);
    expect(interactionSchema.safeParse({...interaction,continuousRecording:true}).success).toBe(false);
    expect(interactionSchema.safeParse({...interaction,afterCapturedAt:interaction.beforeCapturedAt}).success).toBe(false);
  });
  it("requires the before card, after panel and enough time to see each",()=>{
    const {story,evidence,film}=fixture(raw);const action=story.scenes.find(s=>s.layout==='open-detail')!;
    action.proofs[1]!.phase='before';
    expect(()=>assertMeetStoryEvidence(story,evidence)).toThrow("distinct establishing detail panel");
    const compiled=film.scenes.find(s=>s.layout==='open-detail')!;compiled.actionFrame=50;
    expect(meetFilmSchema.safeParse(film).success).toBe(false);
  });
  it("preserves category grounding and rejects hidden or unreadable proof",()=>{
    const {story,evidence}=fixture(raw);
    const swapped=evidence.map(e=>e.id==='open-before'?{...e,text:'Other role'}:e);
    expect(()=>assertMeetStoryEvidence(story,swapped)).toThrow("another category");
    const hidden=structuredClone(story);hidden.scenes.find(s=>s.layout==='stage')!.proofs[0]!.phase='after';
    expect(()=>assertMeetStoryEvidence(hidden,evidence)).toThrow("Only the captured interaction");
    const tiny=evidence.map(e=>e.id==='role-card'?{...e,textHeight:4.5}:e);
    expect(()=>assertMeetStoryEvidence(story,tiny)).toThrow(/28px/);
  });
  it("replaces the search CTA with the final organisation CTA and enforces its hold",()=>{
    const {story,evidence,film}=fixture(raw);
    expect(story.scenes.at(-1)!.vo).toBe(categoryCta(story.category));
    story.scenes.at(-1)!.vo='Start your internship search with Solomon.';
    expect(()=>assertMeetStoryEvidence(story,evidence)).toThrow("application-organisation CTA");
    film.scenes.at(-1)!.from=film.durationInFrames-60;
    expect(()=>auditMeetFilm(film)).toThrow('CTA/shot hold');
  });
  it("rejects slow introductions, rushed hooks and excessive presenter time",()=>{
    const {film}=fixture(raw);const slow=structuredClone(film);slow.scenes.find(s=>s.layout==='role-reveal')!.from=120;
    expect(()=>auditMeetFilm(slow)).toThrow('opening timing');
    const rushed=structuredClone(film);rushed.scenes.find(s=>s.layout==='role-reveal')!.from=25;
    expect(()=>auditMeetFilm(rushed)).toThrow('opening timing');
    const crowded=structuredClone(film);crowded.scenes.forEach(s=>s.presenter='center');
    expect(()=>auditMeetFilm(crowded)).toThrow('presenter share');
    expect(meetFilmSchema.safeParse({...film,alignment:{source:'estimated',coverage:1}}).success).toBe(false);
  });
});
