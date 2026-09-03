import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { asV2Scene, CATEGORY_DATA, categoryCta, type InternshipCategory, type MeetFilm, type MeetScene } from "../../shared/meetSolomonCategories";
import { InternshipProof } from "../meetSolomonInternships/MeetSolomonInternshipsFilm";
import { presenterPlanV2 } from "../meetSolomonV2/MeetSolomonFilmV2";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const COLORS = { ivory: "#f4efe5", clay: "#cd7862", charcoal: "#171b1a", sage: "#d8dfce" };
const INK = "#182320", GREEN = "#176b50", MINT = "#aeebc9";
const ACCENTS = { finance: "#93611a", software: GREEN, law: "#2a4554" };
const SANS = '"Manrope Variable", Arial, sans-serif', SERIF = '"Fraunces Variable", Georgia, serif';
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const ease = (frame: number, at = 0, length = 12) => 1 - (1 - Math.max(0, Math.min(1, (frame - at) / length))) ** 3;
export const categoryPresenterPlan = (scene: MeetScene) => ({ ...presenterPlanV2(asV2Scene(scene)), sceneId: `categories-${scene.id}` });
export function categoryPresenterPosition(scene: MeetScene, frame: number) {
  const close = scene.presenter === "close", centered = scene.presenter === "center";
  const scale = close ? 1.47 : centered ? 1.18 : 1.03;
  const baseX = close ? 40 : scene.presenter === "left" ? 22 : scene.presenter === "right" ? 391 : 150;
  const pulse = ease(frame, Math.max(0, scene.actionFrame - 4)) * (1 - ease(frame, Math.max(scene.actionFrame + 20, scene.to - scene.from - 15)));
  return { scale, x: Math.round(baseX + (scene.action === "push" ? -70 : scene.action === "inspect" ? 25 : 0) * pulse),
    y: Math.round((close ? 805 : 1105) - (scene.action === "inspect" ? 30 * pulse : 0) + (scene.layout === "meet" ? (1 - ease(frame, 0, 10)) * 220 : 0)) };
}
const Presenter: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (scene.presenter === "absent") return null;
  const p = categoryPresenterPosition(scene, frame);
  return <div data-category-presenter={scene.action} style={{ ...abs(p.x, p.y, 660, 940), transform: `scale(${p.scale})`, transformOrigin: "0 0" }}>
    <RobotMascotV22Rig plan={categoryPresenterPlan(scene)} frame={frame} positioning="external" pixelScale={p.scale} enterOverride={1} mouthless />
  </div>;
};
const Label: React.FC<{ top: number; children: React.ReactNode; dark?: boolean }> = ({ top, children, dark }) => <div style={{ ...abs(65, top, 950), fontSize: 25, fontWeight: 650, textAlign: "center", letterSpacing: .5, color: dark ? "#c3ccc4" : "#46544c" }}>{children}</div>;
const Card: React.FC<{ text: string; x: number; y: number; w?: number; h?: number; dark?: boolean; fontSize?: number; style?: CSSProperties }> = ({ text, x, y, w = 850, h = 160, dark, fontSize = 57, style }) => <div style={{ ...abs(x, y, w, h), boxSizing: "border-box", display: "flex", justifyContent: "center", alignItems: "center", padding: 20, borderRadius: 24, background: dark ? "#263b32" : "#fffdf6", border: `2px solid ${dark ? "#53715e" : "#d8decd"}`, boxShadow: "0 18px 36px #00000012", color: dark ? MINT : INK, fontSize, fontWeight: 800, letterSpacing: -1.5, textAlign: "center", lineHeight: 1.08, ...style }}>{text}</div>;
const Caption: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (["role-reveal", "cta"].includes(scene.layout)) return null;
  const phrase = scene.phrases.find(p => frame >= p.from && frame < p.to), serif = phrase?.style === "serif";
  return <div data-category-caption={phrase?.text ?? scene.headline} style={{ ...abs(75, scene.layout === "meet" ? 275 : 205, 930), zIndex: 4, fontFamily: serif ? SERIF : SANS,
    fontSize: scene.layout === "meet" ? 146 : serif ? 116 : 94, fontWeight: serif ? 600 : 800, fontStyle: serif ? "italic" : "normal", letterSpacing: -4,
    textAlign: "center", lineHeight: 1.06, textWrap: "balance", whiteSpace: "pre-line" }}>{phrase?.text ?? scene.headline}</div>;
};
export const CategoryCTA: React.FC<{ category: InternshipCategory }> = ({ category }) => <div data-category-cta={categoryCta(category)}>
  <div style={{ ...abs(95, 185, 890), textAlign: "center", fontSize: 37, fontWeight: 700 }}>Ready?</div>
  <div style={{ ...abs(55, 275, 970), textAlign: "center", fontSize: 91, lineHeight: 1.09, fontWeight: 800, letterSpacing: -4 }}>Start your<br />{category} internship<br />search.</div>
  <div style={{ ...abs(95, 640, 890), textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 70 }}>with</div>
  <div style={{ ...abs(75, 755, 930), textAlign: "center", fontWeight: 800, fontSize: 155, letterSpacing: -7, color: GREEN }}>Solomon.</div>
</div>;
const Arrow: React.FC<{ frame: number; dark?: boolean }> = ({ frame, dark }) => <svg style={abs(120, 620, 840, 300)} viewBox="0 0 840 300"><path d="M45 165 H770 M660 55 L770 165 L660 275" fill="none" stroke={dark ? MINT : GREEN} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1200" strokeDashoffset={1200 * (1 - ease(frame, 0, 14))} /></svg>;
const CategoryArt: React.FC<{ category: InternshipCategory; layout: "category-hook" | "category-map" | "category-payoff"; frame: number }> = ({ category, layout, frame }) => {
  const map = layout === "category-map", payoff = layout === "category-payoff", accent = ACCENTS[category];
  if (category === "finance") return <>
    <div style={{ ...abs(90, 580, 900, map ? 700 : 340), border: `3px solid ${accent}`, borderRadius: 25, background: "#fffdf6", overflow: "hidden" }}>
      <div style={{ background: accent, color: "#fffdf6", padding: "20px 30px", fontSize: 28, fontWeight: 800, letterSpacing: 3 }}>YOUR SEARCH CONTEXT</div>
      {["ROLE", "FIRM", "STAGE"].map((text, i) => <div key={text} style={{ position: "absolute", left: map ? 30 : i * 300, top: map ? 115 + i * 175 : 140, width: map ? 840 : 300, height: map ? 130 : 145, borderLeft: !map && i ? "2px solid #d8decd" : "none", borderBottom: map ? "2px solid #d8decd" : "none", textAlign: "center", fontSize: 47, fontWeight: 800, opacity: ease(frame, i * 4, 8), transform: `translateY(${(1 - ease(frame, i * 4, 8)) * 25}px)` }}>{text}<div style={{ margin: "20px auto", width: payoff ? "62%" : "45%", height: 9, borderRadius: 10, background: accent, opacity: .4 }} /></div>)}
    </div><Label top={map ? 1370 : 980}>ILLUSTRATION · {payoff ? "KEEP THE CONTEXT TOGETHER" : "ROLE / FIRM / STAGE"}</Label>
  </>;
  if (category === "software") return <>
    <div style={{ ...abs(80, 535, 920), fontSize: 135, fontWeight: 800, color: accent, textAlign: "center", letterSpacing: 26 }}>{payoff ? "{ focus }" : "{  }"}</div>
    <Card text={payoff ? "YOUR PRACTICE" : "APPLICATIONS"} x={95} y={735} w={890} h={155} fontSize={63} style={{ borderColor: accent, borderWidth: 3 }} />
    {map && <><svg style={abs(490, 900, 100, 150)} viewBox="0 0 100 150"><path d="M50 0 V150" stroke={accent} strokeWidth="5" strokeDasharray="8 10" /></svg><Card text="YOUR PRACTICE" x={95} y={1070} w={890} h={180} fontSize={63} style={{ opacity: ease(frame, 6, 8) }} /></>}
    <Label top={map ? 1390 : 975}>ILLUSTRATION · {payoff ? "MAKE ROOM TO PREPARE" : "APPLICATIONS + PREPARATION"}</Label>
  </>;
  return <>
    <div style={{ ...abs(map ? 115 : 180, 580, map ? 850 : 720, map ? 720 : 350), background: "#fffdf6", border: `3px solid ${accent}`, borderRadius: 20, transform: map ? "none" : "rotate(-3deg)" }}>
      {(map ? ["ELIGIBILITY", "DOCUMENTS", "DATES"] : [payoff ? "YOUR NEXT STEP" : "ROLE REQUIREMENTS"]).map((text, i) => <div key={text} style={{ ...abs(45, 50 + i * 205, map ? 750 : 620), fontWeight: 800, fontSize: map ? 58 : 40, color: accent, opacity: ease(frame, i * 4, 8) }}>{text}<div style={{ marginTop: 35, width: "85%", height: 7, borderRadius: 5, background: accent, opacity: .23 }} /></div>)}
    </div>
    {!map && <svg style={abs(685, 720, 240, 245)} viewBox="0 0 275 280"><circle cx="105" cy="105" r="83" fill="#f4efe588" stroke={accent} strokeWidth="15" /><path d="M165 170 L255 265" stroke={accent} strokeWidth="24" strokeLinecap="round" /></svg>}
    <Label top={map ? 1390 : 1000}>ILLUSTRATION · READ THE ACTUAL LISTING</Label>
  </>;
};
const SceneArt: React.FC<{ category: InternshipCategory; scene: MeetScene; frame: number }> = ({ category, scene, frame }) => {
  switch (scene.layout) {
    case "category-hook": case "category-map": case "category-payoff": return <CategoryArt category={category} layout={scene.layout} frame={frame} />;
    case "noise": return <>
      {(category === "law" ? ["TITLE?", "REQUIREMENTS?"] : ["ROLE?", "FIRM?", "STAGE?"]).map((text, i) => <Card key={text} text={text} x={Math.round(115 + i * 65 - 1300 * ease(frame, scene.actionFrame, 14))} y={555 + i * 60} w={720} h={125} fontSize={49} style={{ transform: `rotate(${(i - 1) * 7}deg)` }} />)}
      <Label top={485}>ILLUSTRATION · SCATTERED CONTEXT</Label>
    </>;
    case "split": return <><Card text="APPLICATIONS" x={90} y={515} w={900} h={90} fontSize={60} /><Card text="INTERVIEW PREP" x={90} y={630} w={900} h={90} fontSize={58} /><Label top={455}>ILLUSTRATION · TWO PARTS OF YOUR SEARCH</Label></>;
    case "role-reveal": return <>
      <div style={{ ...abs(65, 255, 950), textAlign: "center", fontSize: category === "software" ? 122 : 155, lineHeight: 1.02, fontWeight: 800, letterSpacing: -7, color: MINT }}>{category === "software" ? <>Software<br />Engineering<br />Intern.</> : <>{category === "law" ? "Legal" : "Finance"}<br />Intern.</>}</div>
      <Label top={690} dark>OFFLINE DEMO · SAMPLE INTERNSHIP CARD</Label><Label top={1460} dark>FICTIONAL SAMPLE DATA · NOT A LIVE VACANCY</Label>
    </>;
    case "role-company": return <svg style={abs(490, 730, 100, 80)} viewBox="0 0 100 80"><path d="M50 0 V80" stroke={GREEN} strokeWidth="5" strokeDasharray="7 9" /></svg>;
    case "stage": case "recap": return <svg style={abs(490, scene.layout === "recap" ? 805 : 735, 100, 95)} viewBox="0 0 100 95"><path d="M50 0 V90 M20 60 L50 90 L80 60" fill="none" stroke={GREEN} strokeWidth="5" /></svg>;
    case "reset": return <><Card text={category === "law" ? "CHECK THE ACTUAL LISTING" : "STATUS ≠ OUTCOME"} x={95} y={590} w={890} h={155} fontSize={category === "law" ? 49 : 61} /><Label top={515}>ILLUSTRATION · {category === "law" ? "REQUIREMENTS VARY" : "NO HIRING GUARANTEE"}</Label></>;
    case "category-detail": return <><svg style={abs(490, 820, 100, 125)} viewBox="0 0 100 125"><path d="M50 0 V125" stroke={ACCENTS[category]} strokeWidth="5" strokeDasharray="8 10" /></svg><Label top={1450}>{category === "software" ? "SAMPLE INTERVIEW ROUND · NO INTERVIEW GUARANTEE" : "SAMPLE NOTE · CHECK THE ACTUAL LISTING"}</Label></>;
    case "criteria": return <>
      <Card text={category === "finance" ? "DATES + SKILLS" : category === "software" ? "READ THE ROLE" : "WHO CAN APPLY?"} x={100} y={565} w={880} h={160} fontSize={65} />
      <Card text={category === "law" ? "WHAT DO THEY NEED?" : "CHECK YOUR FIT"} x={190} y={815} w={790} h={150} fontSize={52} style={{ opacity: ease(frame, 6, 10) }} /><Label top={995}>ILLUSTRATION · REQUIREMENTS COME FROM THE LISTING</Label>
    </>;
    case "choose": return <><Arrow frame={frame} dark /><Label top={1015} dark>ILLUSTRATION · YOU CHOOSE THE NEXT ACTION</Label></>;
    case "tracker-view": return <Label top={1340}>SOLOMON TRACKER COMPONENT · OFFLINE DEMO</Label>;
    case "bridge": return <><Arrow frame={frame} /><Label top={1000}>ILLUSTRATION · FIND YOUR NEXT STEP</Label></>;
    case "cta": return <CategoryCTA category={category} />;
    default: return null;
  }
};
export const MeetSolomonCategoriesFrame: React.FC<{ film: MeetFilm; frame: number }> = ({ film, frame }) => {
  const scene = film.scenes.find(s => frame >= s.from && frame < s.to) ?? film.scenes.at(-1)!;
  const local = frame - scene.from, dark = scene.background === "charcoal";
  const source = scene.proofs.length ? film.evidence.find(e => e.id === scene.proofs[0]!.id)! : undefined;
  const labelY = Math.max(0, ...scene.proofs.map(p => p.y + p.h)) + 28;
  return <AbsoluteFill data-category={film.category} data-category-scene={scene.id} style={{ background: COLORS[scene.background], color: dark ? "#f4efe5" : INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(65, 85, 950), display: "flex", justifyContent: "space-between", fontSize: 23, fontWeight: 700, letterSpacing: 1.5, opacity: .78 }}><span>MEET SOLOMON</span><span>{CATEGORY_DATA[film.category].label.toUpperCase()} INTERNSHIPS · DEMO</span></div>
    <SceneArt category={film.category} scene={scene} frame={local} />
    {scene.proofs.map(p => <InternshipProof key={p.id} evidence={film.evidence.find(e => e.id === p.id)!} placement={p} />)}
    {source && <Label top={labelY} dark={dark}>OFFLINE DEMO · SAMPLE DATA · {source.capturedAt.slice(0, 10)}</Label>}
    <Presenter scene={scene} frame={local} /><Caption scene={scene} frame={frame} />
    <div style={{ ...abs(55, 1840, 970), fontSize: 18, textAlign: "center", opacity: .75 }}>PRIVATE REVIEW · OFFLINE COMPONENT DEMO · FICTIONAL PRESENTER</div>
  </AbsoluteFill>;
};
export const MeetSolomonCategoriesFilm: React.FC<{ film: MeetFilm }> = ({ film }) => <>
  <MeetSolomonCategoriesFrame film={film} frame={useCurrentFrame()} />
  <Audio src={staticFile(film.narrationSrc)} />{film.soundDesignSrc && <Audio src={staticFile(film.soundDesignSrc)} />}
</>;
