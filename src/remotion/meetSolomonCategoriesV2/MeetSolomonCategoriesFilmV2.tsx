import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { CATEGORY_DATA, categoryCta, asBaseScene, type InternshipCategory, type MeetFilm, type MeetScene } from "../../shared/meetSolomonCategoriesV2";
import { InternshipProof } from "../meetSolomonInternships/MeetSolomonInternshipsFilm";
import { presenterPlanV2 } from "../meetSolomonV2/MeetSolomonFilmV2";
import { proofIsVisible } from "../../shared/meetSolomonV2";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const COLORS = { ivory: "#f4efe5", clay: "#cd7862", charcoal: "#171b1a", sage: "#d8dfce" };
const INK = "#182320", GREEN = "#176b50", MINT = "#aeebc9";
const ACCENT = { finance: "#93611a", software: GREEN, law: "#2a4554" };
const SANS = '"Manrope Variable", Arial, sans-serif', SERIF = '"Fraunces Variable", Georgia, serif';
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const ease = (frame: number, at = 0, length = 12) => 1 - (1 - Math.max(0, Math.min(1, (frame - at) / length))) ** 3;
export const presenterPlan = (scene: MeetScene) => ({ ...presenterPlanV2(asBaseScene(scene)), sceneId: `category-v2-${scene.id}` });
export function presenterPosition(scene: MeetScene, frame: number) {
  const close = scene.presenter === "close", center = scene.presenter === "center";
  const scale = close ? 1.18 : center ? 1.02 : .87;
  const baseX = close ? 130 : scene.presenter === "left" ? 55 : scene.presenter === "right" ? 470 : 204;
  const pulse = ease(frame, Math.max(0, scene.actionFrame - 3)) * (1 - ease(frame, Math.max(scene.actionFrame + 15, scene.to - scene.from - 12)));
  return { scale, x: Math.round(baseX + (scene.action === "inspect" ? 12 : scene.action === "push" ? -35 : 0) * pulse),
    y: Math.round((close ? 1090 : 1220) + (scene.layout === "meet" ? (1 - ease(frame, 0, 10)) * 170 : 0)) };
}
const Presenter: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (scene.presenter === "absent") return null;
  const p = presenterPosition(scene, frame);
  return <div data-category-v2-presenter={scene.action} style={{ ...abs(p.x, p.y, 660, 940), transform: `scale(${p.scale})`, transformOrigin: "0 0" }}>
    <RobotMascotV22Rig plan={presenterPlan(scene)} frame={frame} positioning="external" pixelScale={p.scale} enterOverride={1} mouthless />
  </div>;
};
const Label: React.FC<{ top: number; children: React.ReactNode; dark?: boolean }> = ({ top, children, dark }) => <div style={{ ...abs(65, top, 950), fontSize: 25, fontWeight: 650, textAlign: "center", letterSpacing: .6, color: dark ? "#c3ccc4" : "#46544c" }}>{children}</div>;
const Tile: React.FC<{ text: string; x: number; y: number; w?: number; h?: number; fontSize?: number; style?: CSSProperties }> = ({ text, x, y, w = 850, h = 150, fontSize = 60, style }) => <div style={{ ...abs(x, y, w, h), boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, borderRadius: 18, background: "#fffdf6", color: INK, border: "2px solid #d8decd", fontSize, fontWeight: 800, textAlign: "center", lineHeight: 1.1, letterSpacing: -1.8, ...style }}>{text}</div>;
const Caption: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (["role-reveal", "cta"].includes(scene.layout)) return null;
  const phrase = scene.phrases.find(p => frame >= p.from && frame < p.to), serif = phrase?.style === "serif";
  return <div data-category-v2-caption={phrase?.text ?? scene.headline} style={{ ...abs(65, scene.layout === "meet" ? 300 : 230, 950), zIndex: 4, fontFamily: serif ? SERIF : SANS,
    fontSize: scene.layout === "meet" ? 146 : serif ? 107 : 97, fontWeight: serif ? 600 : 800, fontStyle: serif ? "italic" : "normal", letterSpacing: -4,
    textAlign: "center", lineHeight: 1.06, textWrap: "balance" }}>{phrase?.text ?? scene.headline}</div>;
};
export const CategoryCTA: React.FC<{ category: InternshipCategory }> = ({ category }) => <div data-category-v2-cta={categoryCta(category)}>
  <div style={{ ...abs(75, 205, 930), textAlign: "center", fontSize: 36, fontWeight: 700 }}>YOUR NEXT STEP</div>
  <div style={{ ...abs(55, 300, 970), textAlign: "center", fontSize: 88, lineHeight: 1.11, fontWeight: 800, letterSpacing: -4 }}>Organise your<br />{category} internship<br />applications.</div>
  <div style={{ ...abs(75, 665, 930), textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 66 }}>with</div>
  <div style={{ ...abs(65, 775, 950), textAlign: "center", fontWeight: 800, fontSize: 151, letterSpacing: -7, color: GREEN }}>Solomon.</div>
</div>;
const Hook: React.FC<{ category: InternshipCategory; frame: number; cue: number; payoff?: boolean }> = ({ category, frame, cue, payoff }) => {
  const p = ease(frame, Math.max(0, cue - 3)), accent = ACCENT[category];
  if (category === "finance") return <>
    <Tile text={payoff ? "FIRM" : "WHICH FIRM?"} x={85} y={570} w={payoff ? 435 : 740} h={150} style={{ borderColor: accent, transform: `rotate(${payoff ? 0 : -4 + 2 * p}deg)` }} />
    <Tile text={payoff ? "STAGE" : "WHICH STAGE?"} x={payoff ? 560 : 230} y={payoff ? 570 : 790} w={payoff ? 435 : 740} h={150} style={{ borderColor: accent, transform: `rotate(${payoff ? 0 : 4 - 2 * p}deg)` }} />
    {payoff && <div style={{ ...abs(95, 785, 890), textAlign: "center", fontSize: 78, fontWeight: 800, color: INK }}>THE CONTEXT STAYS.</div>}
    <Label top={1000}>ILLUSTRATION · {payoff ? "KEEP THE CONTEXT" : "THE THREAD OF YOUR APPLICATIONS"}</Label>
  </>;
  if (category === "software") return <>
    <div style={{ ...abs(65, 550, 950), fontSize: 64, fontWeight: 800, color: accent, letterSpacing: -3 }}>{"{"}</div>
    <Tile text="APPLICATIONS" x={Math.round(120 - 15 * p)} y={590} w={800} h={135} fontSize={64} style={{ borderColor: accent }} />
    <Tile text={payoff ? "ROOM TO PRACTISE" : "INTERVIEW PREP"} x={Math.round(165 + 15 * p)} y={790} w={800} h={135} fontSize={payoff ? 55 : 60} style={{ borderColor: accent }} />
    <div style={{ ...abs(990, 860, 65), fontSize: 64, fontWeight: 800, color: accent }}>{"}"}</div>
    <Label top={1000}>ILLUSTRATION · YOUR APPLICATIONS AND PREPARATION</Label>
  </>;
  return <>
    <div style={{ ...abs(115, 575, 850, 365), borderRadius: 15, background: "#fffdf6", border: `3px solid ${accent}`, transform: `rotate(${-2 + 2 * p}deg)` }}>
      <div style={{ ...abs(45, 40, 760), fontSize: 56, fontWeight: 800, color: accent }}>{payoff ? "YOUR NEXT STEP" : "ROLE TITLE"}</div>
      <div style={{ ...abs(45, 145, 760), fontSize: 46, fontWeight: 750, color: accent }}>{payoff ? "CONTEXT → ACTION" : "READ THE REQUIREMENTS"}</div>
      <div style={{ ...abs(45, 224, Math.round(665 * ease(frame, 0, 15)), 16), background: "#c6ddc8" }} />
    </div><Label top={1000}>ILLUSTRATION · {payoff ? "CHOOSE WHAT COMES NEXT" : "LOOK BEYOND THE TITLE"}</Label>
  </>;
};
const Criteria: React.FC<{ category: InternshipCategory; frame: number }> = ({ category, frame }) => {
  const accent = ACCENT[category];
  if (category === "software") return <>
    <Tile text="THE ROLE" x={65} y={650} w={430} h={460} fontSize={67} style={{ borderColor: accent }} />
    <Tile text="YOUR PROJECTS" x={585} y={650} w={430} h={460} fontSize={65} style={{ borderColor: accent, transform: `translateX(${(1 - ease(frame)) * 40}px)` }} />
    <svg style={abs(480, 830, 120, 100)} viewBox="0 0 120 100"><path d="M5 50 H115 M90 25 L115 50 L90 75" fill="none" stroke={accent} strokeWidth="7" /></svg>
    <Label top={1250}>ILLUSTRATION · MATCH YOUR PROJECTS TO THE ROLE</Label>
  </>;
  const labels = category === "finance" ? ["DATES", "SKILLS", "YOUR FIT"] : ["ELIGIBILITY", "DOCUMENTS", "DATES"];
  return <>
    {labels.map((text, i) => <div key={text} style={{ ...abs(95, 600 + i * 225, 890, 180), display: "flex", alignItems: "center", gap: 35, boxSizing: "border-box", padding: "25px 35px", borderBottom: `3px solid ${accent}`, background: category === "law" ? "#fffdf6" : "transparent", opacity: ease(frame, i * 3, 7) }}><span style={{ fontFamily: SERIF, fontSize: 76, color: accent }}>{category === "finance" ? "—" : "○"}</span><span style={{ fontSize: 75, fontWeight: 800, letterSpacing: -3 }}>{text}</span></div>)}
    <Label top={1410}>ILLUSTRATION · CHECK THE ACTUAL LISTING</Label>
  </>;
};
export const InteractionArt: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => <>
  <div data-capture-state={frame < scene.actionFrame ? "before" : "after"} style={{ ...abs(120, 470, 840), display: "flex", gap: 30, justifyContent: "center", fontSize: 28, fontWeight: 800, letterSpacing: 2 }}>
    <span style={{ color: frame < scene.actionFrame ? GREEN : "#788079" }}>CARD</span><span>→</span><span style={{ color: frame >= scene.actionFrame ? GREEN : "#788079" }}>DETAILS</span>
  </div>
  <Label top={1740}>CAPTURED SELECTION · EDITORIAL BEFORE / AFTER CUT</Label>
</>;
const Art: React.FC<{ category: InternshipCategory; scene: MeetScene; frame: number }> = ({ category, scene, frame }) => {
  switch (scene.layout) {
    case "category-hook": case "category-payoff": return <Hook category={category} frame={frame} cue={scene.actionFrame} payoff={scene.layout === "category-payoff"} />;
    case "role-reveal": return <>
      <div style={{ ...abs(65, 230, 950), textAlign: "center", fontSize: category === "software" ? 101 : 143, lineHeight: 1.03, fontWeight: 800, letterSpacing: -6, color: MINT }}>{category === "software" ? <>Software<br />Engineering<br />Intern.</> : <>{category === "law" ? "Legal" : "Finance"}<br />Intern.</>}</div>
      <Label top={560} dark>SAMPLE APPLICATION IN SOLOMON</Label>
      <div style={{ ...abs(65, 1460, 950), textAlign: "center", fontSize: 36, fontWeight: 750, color: MINT }}>THE APPLICATION TRACKER</div>
    </>;
    case "open-detail": return <InteractionArt scene={scene} frame={frame} />;
    case "criteria": return <Criteria category={category} frame={frame} />;
    case "reset": return <><Tile text={category === "software" ? "YOU CHOOSE THE PREP" : "READ THE ACTUAL LISTING"} x={80} y={665} w={920} h={175} fontSize={54} /><Label top={955}>ILLUSTRATION · YOUR NEXT ACTION</Label></>;
    case "category-detail": return <Label top={1470}>{category === "software" ? "SAMPLE INTERVIEW ROUND" : "SAMPLE APPLICATION NOTE"}</Label>;
    case "tracker-view": return <><div style={{ ...abs(100, 1320, 880), textAlign: "center", fontSize: 58, fontWeight: 800, letterSpacing: -2 }}>Your application.<br />Still in view.</div><Label top={1525}>SOLOMON TRACKER · OFFLINE DEMO</Label></>;
    case "cta": return <CategoryCTA category={category} />;
    default: return null;
  }
};
export const MeetSolomonCategoriesFrameV2: React.FC<{ film: MeetFilm; frame: number }> = ({ film, frame }) => {
  const scene = film.scenes.find(s => frame >= s.from && frame < s.to) ?? film.scenes.at(-1)!;
  const local = frame - scene.from, dark = scene.background === "charcoal";
  const visible = scene.proofs.filter(p => proofIsVisible(p, asBaseScene(scene), local));
  const labelY = Math.max(0, ...visible.map(p => p.y + p.h)) + 26;
  return <AbsoluteFill data-category-v2={film.category} data-category-v2-scene={scene.id} style={{ background: COLORS[scene.background], color: dark ? "#f4efe5" : INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(65, 80, 950), display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 750, letterSpacing: 1.5 }}><span>MEET SOLOMON</span><span>{CATEGORY_DATA[film.category].label.toUpperCase()} INTERNSHIPS</span></div>
    <div style={{ ...abs(65, 128, 950), fontSize: 21, letterSpacing: 1.1, opacity: .72 }}>OFFLINE DEMO · FICTIONAL SAMPLE DATA</div>
    <Art category={film.category} scene={scene} frame={local} />
    {visible.map(p => <InternshipProof key={p.id} evidence={film.evidence.find(e => e.id === p.id)!} placement={p} />)}
    {visible.length > 0 && <Label top={labelY} dark={dark}>PRODUCT DEMO · SAMPLE DATA</Label>}
    <Presenter scene={scene} frame={local} /><Caption scene={scene} frame={frame} />
  </AbsoluteFill>;
};
export const MeetSolomonCategoriesFilmV2: React.FC<{ film: MeetFilm }> = ({ film }) => <>
  <MeetSolomonCategoriesFrameV2 film={film} frame={useCurrentFrame()} />
  <Audio src={staticFile(film.narrationSrc)} />{film.soundDesignSrc && <Audio src={staticFile(film.soundDesignSrc)} />}
</>;
