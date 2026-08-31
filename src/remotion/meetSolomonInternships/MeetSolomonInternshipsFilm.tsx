import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { meetEvidenceScale, type MeetEvidence } from "../../shared/meetSolomon";
import { asV2Scene, INTERNSHIP_CTA, type MeetFilm, type MeetScene } from "../../shared/meetSolomonInternships";
import type { MeetProof } from "../../shared/meetSolomonV2";
import { presenterPlanV2 } from "../meetSolomonV2/MeetSolomonFilmV2";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const COLORS = { ivory: "#f4efe5", clay: "#cd7862", charcoal: "#171b1a", sage: "#d8dfce" };
const INK = "#182320", GREEN = "#176b50", MINT = "#aeebc9";
const SANS = '"Manrope Variable", Arial, sans-serif', SERIF = '"Fraunces Variable", Georgia, serif';
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const ease = (frame: number, at = 0, length = 12) => 1 - (1 - Math.max(0, Math.min(1, (frame - at) / length))) ** 3;

export const internshipPresenterPlan = (scene: MeetScene) => ({ ...presenterPlanV2(asV2Scene(scene)), sceneId: `internships-${scene.id}` });
export function internshipPresenterPosition(scene: MeetScene, frame: number) {
  const close = scene.presenter === "close", centered = scene.presenter === "center";
  const scale = close ? 1.47 : centered ? 1.18 : 1.03;
  const baseX = close ? 40 : scene.presenter === "left" ? 22 : scene.presenter === "right" ? 391 : 150;
  const pulse = ease(frame, Math.max(0, scene.actionFrame - 4)) * (1 - ease(frame, Math.max(scene.actionFrame + 20, scene.to - scene.from - 15)));
  return { scale, x: Math.round(baseX + (scene.action === "push" ? -70 : scene.action === "inspect" ? 25 : 0) * pulse),
    y: Math.round((close ? 805 : 1105) - (scene.action === "inspect" ? 30 * pulse : 0) + (scene.layout === "meet" ? (1 - ease(frame, 0, 10)) * 220 : 0)) };
}
const Presenter: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (scene.presenter === "absent") return null;
  const p = internshipPresenterPosition(scene, frame);
  return <div data-internship-presenter={scene.action} style={{ ...abs(p.x, p.y, 660, 940), transform: `scale(${p.scale})`, transformOrigin: "0 0" }}>
    <RobotMascotV22Rig plan={internshipPresenterPlan(scene)} frame={frame} positioning="external" pixelScale={p.scale} enterOverride={1} mouthless />
  </div>;
};

export const InternshipProof: React.FC<{ evidence: MeetEvidence; placement: MeetProof }> = ({ evidence: e, placement: p }) => {
  const box = meetEvidenceScale(e, p.w, p.h);
  if (box.readablePx < (e.kind === "establishing" ? 10 : 28)) throw new Error(`Unreadable internship proof: ${e.id}`);
  return <div data-internship-proof={e.id} style={{ ...abs(Math.round(p.x + (p.w - box.width) / 2), Math.round(p.y + (p.h - box.height) / 2), box.width, box.height), overflow: "hidden", borderRadius: 12, boxShadow: "0 16px 34px #00000017" }}>
    <Img src={staticFile(e.file)} style={{ position: "absolute", maxWidth: "none", left: -e.crop.x * box.scale, top: -e.crop.y * box.scale, width: e.sourceWidth * box.scale, height: e.sourceHeight * box.scale }} />
  </div>;
};

const Label: React.FC<{ top: number; children: React.ReactNode; dark?: boolean }> = ({ top, children, dark }) => <div style={{ ...abs(65, top, 950), fontSize: 25, fontWeight: 650, textAlign: "center", letterSpacing: .5, color: dark ? "#c3ccc4" : "#46544c" }}>{children}</div>;
const Card: React.FC<{ text: string; x: number; y: number; w?: number; h?: number; dark?: boolean; fontSize?: number; style?: CSSProperties }> = ({ text, x, y, w = 850, h = 160, dark, fontSize = 57, style }) => <div style={{ ...abs(x, y, w, h), boxSizing: "border-box", display: "flex", justifyContent: "center", alignItems: "center", padding: 20, borderRadius: 24, background: dark ? "#263b32" : "#fffdf6", border: `2px solid ${dark ? "#53715e" : "#d8decd"}`, boxShadow: "0 18px 36px #00000012", color: dark ? MINT : INK, fontSize, fontWeight: 800, letterSpacing: -1.5, textAlign: "center", lineHeight: 1.08, ...style }}>{text}</div>;

const Caption: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (["intern-reveal", "cta"].includes(scene.layout)) return null;
  const phrase = scene.phrases.find(p => frame >= p.from && frame < p.to), serif = phrase?.style === "serif";
  return <div data-internship-caption={phrase?.text ?? scene.headline} style={{ ...abs(75, scene.layout === "meet" ? 275 : 205, 930), zIndex: 4, fontFamily: serif ? SERIF : SANS,
    fontSize: scene.layout === "meet" ? 146 : serif ? 116 : 94, fontWeight: serif ? 600 : 800, fontStyle: serif ? "italic" : "normal", letterSpacing: -4,
    textAlign: "center", lineHeight: 1.06, textWrap: "balance", whiteSpace: "pre-line" }}>{phrase?.text ?? scene.headline}</div>;
};

export const InternshipCTA: React.FC = () => <div data-internship-cta={INTERNSHIP_CTA}>
  <div style={{ ...abs(95, 215, 890), textAlign: "center", fontSize: 110, lineHeight: 1.07, fontWeight: 800, letterSpacing: -5 }}>Start your<br />internship<br />search.</div>
  <div style={{ ...abs(95, 615, 890), textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 70 }}>with</div>
  <div style={{ ...abs(75, 735, 930), textAlign: "center", fontWeight: 800, fontSize: 155, letterSpacing: -7, color: GREEN }}>Solomon.</div>
</div>;

const SceneArt: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  const cue = scene.actionFrame;
  switch (scene.layout) {
    case "hunt": return <>
      <div style={{ ...abs(135, 565, 300, 80), borderRadius: "22px 22px 0 0", background: GREEN }} />
      <Card text="INTERNSHIPS" x={135} y={620} w={810} h={285} fontSize={82} style={{ borderColor: GREEN, transform: `rotate(${-2 + 2 * ease(frame, cue)}deg)` }} />
      <Label top={985}>ILLUSTRATION · YOUR SEARCH IN PROGRESS</Label>
    </>;
    case "tabs": return <>
      {["ROLE?", "COMPANY?", "STATUS?"].map((text, i) => <Card key={text} text={text} x={Math.round(105 + i * 70 - 1300 * ease(frame, cue, 14))} y={530 + i * 65} w={650} h={125} fontSize={50} style={{ transform: `rotate(${(i - 1) * 7}deg)` }} />)}
      <Label top={460}>ILLUSTRATION · SCATTERED CONTEXT</Label>
    </>;
    case "intern-reveal": return <>
      <div style={{ ...abs(65, 270, 950), textAlign: "center", fontSize: 161, lineHeight: 1.02, fontWeight: 800, letterSpacing: -8, color: MINT }}>Marketing<br />Intern.</div>
      <Label top={705} dark>DEMO · SAMPLE INTERNSHIP CARD</Label>
      <Label top={1450} dark>SAMPLE DATA · NOT A LIVE VACANCY</Label>
    </>;
    case "role-company": return <svg style={abs(490, 725, 100, 105)} viewBox="0 0 100 105"><path d="M50 0 V105" stroke={GREEN} strokeWidth="5" strokeDasharray="7 9" /></svg>;
    case "tracker-view": return <Label top={1310}>SOLOMON APPLICATION TRACKER · DEMO VIEW</Label>;
    case "stage": return <svg style={abs(490, 750, 100, 105)} viewBox="0 0 100 105"><path d="M50 0 V105 M20 75 L50 105 L80 75" fill="none" stroke={GREEN} strokeWidth="5" /></svg>;
    case "status-caveat": return <><Card text="STATUS ≠ OUTCOME" x={115} y={565} w={850} h={155} fontSize={60} /><Label top={505}>ILLUSTRATION · NO HIRING GUARANTEE</Label></>;
    case "requirements": return <>
      <Card text="DATES" x={100} y={625} w={740} h={225} fontSize={100} style={{ transform: "rotate(-4deg)" }} />
      <Card text="REQUIREMENTS" x={240} y={1005} w={740} h={225} fontSize={62} style={{ transform: "rotate(4deg)", opacity: ease(frame, cue, 10) }} />
      <Label top={1480}>ILLUSTRATION · READ THE ACTUAL LISTING</Label>
    </>;
    case "fit": return <>
      <Card text="YOUR SKILLS" x={90} y={555} w={790} h={155} fontSize={58} />
      <Card text="YOUR AVAILABILITY" x={190} y={790} w={790} h={155} fontSize={46} style={{ borderColor: frame >= cue ? GREEN : "#d8decd", borderWidth: 3 }} />
      <Label top={1000}>ILLUSTRATION · CHECK YOUR FIT</Label>
    </>;
    case "next-step": return <>
      <svg style={abs(130, 570, 820, 420)} viewBox="0 0 820 420"><path d="M60 100 H350 Q420 100 420 180 V300 H765 M720 255 L765 300 L720 345 M350 100 Q420 100 420 35 V10" fill="none" stroke={MINT} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1400" strokeDashoffset={1400 * (1 - ease(frame, 0, 22))} /></svg>
      <Card text="YOUR NEXT STEP" x={80} y={1110} w={920} h={235} dark fontSize={75} />
      <Label top={1530} dark>ILLUSTRATION · YOU CHOOSE THE ACTION</Label>
    </>;
    case "return": return <>
      <svg style={abs(200, 855, 680, 120)} viewBox="0 0 720 160"><path d="M640 130 H135 Q40 130 40 65 Q40 20 95 20 H300 M260 0 L300 20 L260 45" fill="none" stroke={GREEN} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <Label top={1010}>ILLUSTRATED RETURN · ORIGINAL PRODUCT TITLE ABOVE</Label>
    </>;
    case "recap": return <>
      <Card text="YOUR NEXT STEP" x={125} y={1185} w={830} h={195} fontSize={68} />
      <Label top={1435}>ILLUSTRATED PROMPT · NOT A PRODUCT FIELD</Label>
    </>;
    case "untangle": return <>
      {["ROLE", "COMPANY", "STAGE"].map((text, i) => {
        const p = ease(frame, Math.max(0, cue - 15), 15);
        return <Card key={text} text={text} x={Math.round(95 + i * 25 + (1 - p) * (i - 1) * 80)} y={Math.round(555 + i * 185 - p * i * 55)} w={850} h={125} fontSize={48} style={{ transform: `rotate(${(1 - p) * (i - 1) * 7}deg)` }} />;
      })}<Label top={1010}>ILLUSTRATION · THE THREAD OF YOUR SEARCH</Label>
    </>;
    case "clarity": return <>
      <svg style={abs(100, 620, 880, 280)} viewBox="0 0 880 280"><path d="M55 170 H810 M695 55 L810 170 L695 270" fill="none" stroke={GREEN} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1200" strokeDashoffset={1200 * (1 - ease(frame, cue, 14))} /></svg>
      <Label top={985}>ILLUSTRATION · FIND YOUR NEXT STEP</Label>
    </>;
    case "cta": return <InternshipCTA />;
    default: return null;
  }
};

export const MeetSolomonInternshipsFrame: React.FC<{ film: MeetFilm; frame: number }> = ({ film, frame }) => {
  const scene = film.scenes.find(s => frame >= s.from && frame < s.to) ?? film.scenes.at(-1)!;
  const local = frame - scene.from, dark = scene.background === "charcoal";
  const source = scene.proofs.length ? film.evidence.find(e => e.id === scene.proofs[0]!.id)! : undefined;
  const labelY = Math.max(0, ...scene.proofs.map(p => p.y + p.h)) + 28;
  return <AbsoluteFill data-internship-scene={scene.id} style={{ background: COLORS[scene.background], color: dark ? "#f4efe5" : INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(65, 85, 950), display: "flex", justifyContent: "space-between", fontSize: 23, fontWeight: 700, letterSpacing: 1.5, opacity: .78 }}><span>MEET SOLOMON</span><span>INTERNSHIPS · DEMO</span></div>
    <SceneArt scene={scene} frame={local} />
    {scene.proofs.map(p => <InternshipProof key={p.id} evidence={film.evidence.find(e => e.id === p.id)!} placement={p} />)}
    {source && <Label top={labelY} dark={dark}>DEMO CAPTURE · {source.capturedAt.slice(0, 10)} · SAMPLE DATA</Label>}
    <Presenter scene={scene} frame={local} /><Caption scene={scene} frame={frame} />
    <div style={{ ...abs(55, 1840, 970), fontSize: 19, textAlign: "center", opacity: .75 }}>PRIVATE REVIEW · SAMPLE DATA · FICTIONAL PRESENTER</div>
  </AbsoluteFill>;
};
export const MeetSolomonInternshipsFilm: React.FC<{ film: MeetFilm }> = ({ film }) => <>
  <MeetSolomonInternshipsFrame film={film} frame={useCurrentFrame()} />
  <Audio src={staticFile(film.narrationSrc)} />{film.soundDesignSrc && <Audio src={staticFile(film.soundDesignSrc)} />}
</>;
