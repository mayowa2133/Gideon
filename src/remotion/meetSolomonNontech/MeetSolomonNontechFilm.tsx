import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { meetEvidenceScale, type MeetEvidence } from "../../shared/meetSolomon";
import { asV2Scene, type MeetFilm, type MeetScene } from "../../shared/meetSolomonNontech";
import { type MeetProof } from "../../shared/meetSolomonV2";
import { presenterPlanV2 } from "../meetSolomonV2/MeetSolomonFilmV2";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";
import { v22MascotPerformanceSchema } from "../../shared/solomonMascotV22";

const COLORS = { ivory: "#f4efe5", clay: "#cd7862", charcoal: "#171b1a", sage: "#d8dfce" };
const INK = "#182320", GREEN = "#176b50", MINT = "#aeebc9";
const SANS = '"Manrope Variable", Arial, sans-serif', SERIF = '"Fraunces Variable", Georgia, serif';
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const ease = (frame: number, at = 0, length = 12) => 1 - (1 - Math.max(0, Math.min(1, (frame - at) / length))) ** 3;

export function nontechPresenterPlan(scene: MeetScene) {
  const plan = presenterPlanV2(asV2Scene(scene));
  return v22MascotPerformanceSchema.parse({ ...plan, sceneId: `nontech-${scene.id}`,
    narrativePurpose: scene.layout === "callback" ? "payoff_reaction" : plan.narrativePurpose,
    head: { ...plan.head, beats: scene.layout === "only-code" ? [5, 14] : plan.head.beats },
    left: scene.layout === "callback" ? { ...plan.left, gesture: "open_palm" } : plan.left,
  });
}

export function nontechPresenterPosition(scene: MeetScene, frame: number) {
  const close = scene.presenter === "close", centered = scene.presenter === "center";
  const scale = close ? 1.47 : centered ? 1.18 : 1.03;
  const baseX = close ? 40 : scene.presenter === "left" ? 22 : scene.presenter === "right" ? 391 : 150;
  const baseY = close ? 805 : 1105;
  const reach = ease(frame, Math.max(0, scene.actionFrame - 4));
  const settle = ease(frame, Math.max(scene.actionFrame + 20, scene.to - scene.from - 15));
  const pulse = reach * (1 - settle);
  return { scale, x: Math.round(baseX + (scene.action === "push" ? -75 : scene.action === "inspect" ? 30 : 0) * pulse),
    y: Math.round(baseY - (scene.action === "inspect" ? 38 * pulse : 0) + (scene.layout === "meet" ? (1 - ease(frame, 0, 10)) * 240 : 0)) };
}

const Presenter: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (scene.presenter === "absent") return null;
  const p = nontechPresenterPosition(scene, frame);
  return <div data-nontech-presenter={scene.action} style={{ ...abs(p.x, p.y, 660, 940), transform: `scale(${p.scale})`, transformOrigin: "0 0" }}>
    <RobotMascotV22Rig plan={nontechPresenterPlan(scene)} frame={frame} positioning="external" pixelScale={p.scale} enterOverride={1} mouthless />
  </div>;
};

export const NontechProof: React.FC<{ evidence: MeetEvidence; placement: MeetProof }> = ({ evidence: e, placement: p }) => {
  const box = meetEvidenceScale(e, p.w, p.h);
  if (box.readablePx < (e.kind === "establishing" ? 10 : 28)) throw new Error(`Unreadable nontech proof: ${e.id}`);
  return <div data-nontech-proof={e.id} style={{ ...abs(Math.round(p.x + (p.w - box.width) / 2), Math.round(p.y + (p.h - box.height) / 2), box.width, box.height), overflow: "hidden", borderRadius: 10, boxShadow: "0 16px 34px #00000017" }}>
    <Img src={staticFile(e.file)} style={{ position: "absolute", maxWidth: "none", left: -e.crop.x * box.scale, top: -e.crop.y * box.scale, width: e.sourceWidth * box.scale, height: e.sourceHeight * box.scale }} />
  </div>;
};

const Label: React.FC<{ top: number; children: React.ReactNode; dark?: boolean }> = ({ top, children, dark }) => <div style={{ ...abs(70, top, 940), fontSize: 23, letterSpacing: 1, fontWeight: 650, textAlign: "center", color: dark ? "#b7c0b8" : "#46544c" }}>{children}</div>;

const Card: React.FC<{ text: string; x: number; y: number; w?: number; h?: number; dark?: boolean; fontSize?: number; style?: CSSProperties }> = ({ text, x, y, w = 870, h = 150, dark, fontSize = 49, style }) => <div style={{ ...abs(x, y, w, h), boxSizing: "border-box", display: "flex", justifyContent: "center", alignItems: "center", padding: 24, borderRadius: 24, background: dark ? "#263b32" : "#fffdf6", border: `2px solid ${dark ? "#53715e" : "#d8decd"}`, boxShadow: "0 18px 36px #00000012", color: dark ? MINT : INK, textAlign: "center", fontSize, fontWeight: 750, letterSpacing: -1.5, lineHeight: 1.08, ...style }}>{text}</div>;

const CodeWindow: React.FC<{ frame: number; exitAt?: number; compact?: boolean }> = ({ frame, exitAt, compact }) => {
  const offset = exitAt === undefined ? 0 : -1350 * ease(frame, exitAt, 12);
  return <div style={{ ...abs(125 + Math.round(offset), compact ? 525 : 555, 830, compact ? 200 : 390), background: "#fffdf6", color: INK, borderRadius: 25, border: "2px solid #d8decd", boxShadow: "0 20px 40px #172b2015", transform: `rotate(${compact ? -3 : 2}deg)` }}>
    <div style={{ ...abs(25, 26, 780), fontSize: 31, fontWeight: 700, letterSpacing: 3, textAlign: "center" }}>AI COMPANY = ENGINEERING?</div>
    {!compact && <div style={{ ...abs(30, 97, 770), fontFamily: "monospace", fontSize: 168, fontWeight: 700, textAlign: "center", color: GREEN }}>{"</>"}</div>}
    {compact && <div style={{ ...abs(45, 95, 740), height: 5, background: GREEN, opacity: .45 }} />}
  </div>;
};

const Caption: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (["legal-reveal", "partners-reveal", "end"].includes(scene.layout)) return null;
  const active = scene.phrases.find(p => frame >= p.from && frame < p.to);
  const text = active?.text ?? scene.headline, serif = active?.style === "serif";
  const size = scene.layout === "meet" ? 146 : scene.layout === "callback" ? 140 : scene.layout === "company-view" ? 92 : serif ? 118 : 96;
  return <div data-nontech-caption={text} style={{ ...abs(75, scene.layout === "meet" ? 280 : 205, 930), zIndex: 4, textAlign: "center", fontFamily: serif ? SERIF : SANS,
    fontSize: size, fontWeight: serif ? 600 : 800, fontStyle: serif ? "italic" : "normal", lineHeight: 1.045, letterSpacing: -4.5, textWrap: "balance", whiteSpace: "pre-line" }}>{text}</div>;
};

const SceneArt: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  const cue = scene.actionFrame;
  switch (scene.layout) {
    case "code-wall": return <><CodeWindow frame={frame} /><Label top={980}>ILLUSTRATION · THE ASSUMPTION</Label></>;
    case "only-code": return <><CodeWindow frame={frame} exitAt={0} compact /><Label top={480}>ILLUSTRATION</Label></>;
    case "legal-reveal": return <>
      <div style={{ ...abs(70, 270, 940), textAlign: "center", fontSize: 220, fontWeight: 800, letterSpacing: -14, color: MINT }}>LEGAL.</div>
      <Label top={685} dark>ACTUAL ROLE + EMPLOYER</Label>
      <Label top={1450} dark>A role beyond engineering.</Label>
    </>;
    case "partners-reveal": return <>
      <div style={{ ...abs(60, 300, 960), textAlign: "center", fontSize: 135, fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, letterSpacing: -6, color: MINT }}>Partnerships.</div>
      <Label top={685} dark>ACTUAL ROLE TITLE + EMPLOYER</Label>
      <Label top={1450} dark>Visible title excerpt from the captured listing</Label>
    </>;
    case "company-search": return <Label top={535}>IN SOLOMON · COMPANY SEARCH</Label>;
    case "company-view": return <Label top={1485}>THE COMPANY’S JOBS · CAPTURED PRODUCT VIEW</Label>;
    case "legal-detail": return <>
      <svg style={abs(170, 710, 715, 75)} viewBox="0 0 715 75"><path d="M358 0 V34 M45 70 V34 H663 V70" fill="none" stroke={GREEN} strokeWidth="4" /></svg>
      <Label top={990}>TITLE, EMPLOYER AND CATEGORY FROM THE SAME CARD</Label>
    </>;
    case "reset": return <>
      <svg style={abs(115, 550, 860, 155)} viewBox="0 0 860 155"><path d="M50 105 H355 Q420 105 440 60 Q460 20 510 20 H795 M765 0 L795 20 L765 44" fill="none" stroke={GREEN} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1000" strokeDashoffset={1000 * (1 - ease(frame, cue - 8, 16))} /></svg>
      <Label top={710}>ILLUSTRATION · ANOTHER KIND OF WORK</Label>
    </>;
    case "partners-detail": return <Label top={1010}>SAME CAPTURE. SAME EMPLOYER.</Label>;
    case "constellation": return <>
      <svg style={abs(0, 0, 1080, 1920)} viewBox="0 0 1080 1920"><path d="M540 730 Q540 920 300 975 M540 730 Q540 1000 805 1250" fill="none" stroke={GREEN} strokeWidth="5" strokeDasharray="1400" strokeDashoffset={1400 * (1 - ease(frame, cue, 18))} /></svg>
      <Card text="AI COMPANY" x={245} y={565} w={590} h={160} fontSize={60} />
      <Card text="Legal" x={65} y={955} w={450} h={170} fontSize={65} style={{ opacity: ease(frame, cue + 3, 10) }} />
      <Card text="Partnerships" x={565} y={1230} w={450} h={170} fontSize={51} style={{ opacity: ease(frame, cue + 10, 10) }} />
      <Label top={1600}>ILLUSTRATION · EXAMPLES, NOT HIRING PROPORTIONS</Label>
    </>;
    case "requirements": return <>
      <Card text="THE ROLE’S REQUIREMENTS" x={85} y={550} w={910} h={150} fontSize={43} />
      <Card text="YOUR EXPERIENCE" x={115} y={780} w={850} h={145} fontSize={47} style={{ borderColor: frame >= cue ? GREEN : "#d8decd", borderWidth: frame >= cue ? 5 : 2 }} />
      <Label top={985}>ILLUSTRATION · CHECK THE ACTUAL REQUIREMENTS</Label>
    </>;
    case "narrow": return <>
      {["Legal", "Partnerships", "Engineering"].map((text, i) => {
        const p = ease(frame, Math.max(0, cue - 12), 15);
        return <Card key={text} text={text} x={Math.round(90 + i * 30 + (1 - p) * (i - 1) * 80)} y={Math.round(590 + i * 190 - p * i * 100)} w={840} h={155} dark fontSize={54} style={{ opacity: 1 - p, transform: `rotate(${(1 - p) * (i - 1) * 5}deg)` }} />;
      })}
      <Card text="YOUR FIELD" x={90} y={845} w={900} h={225} dark fontSize={95} style={{ opacity: ease(frame, cue, 10) }} />
      <Label top={1380} dark>ILLUSTRATION · START WITH YOUR OWN EXPERTISE</Label>
    </>;
    case "your-field": return <>
      <div style={{ ...abs(240, 575, 600, 285), border: `5px solid ${GREEN}`, borderRadius: 28, background: "#d8dfce", perspective: 1100 }}>
        <div style={{ ...abs(0, 0, 590, 275), background: GREEN, color: "#fffdf6", borderRadius: 20, transformOrigin: "0 50%", transform: `rotateY(${-48 * ease(frame, cue, 15)}deg)`, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 62, fontWeight: 800 }}>YOUR FIELD</div>
      </div><Label top={990}>ILLUSTRATION · FIND WHERE YOUR WORK EXISTS</Label>
    </>;
    case "callback": return <>
      <div style={{ ...abs(75 - Math.round(30 * ease(frame, cue)), 565, 180), fontFamily: "monospace", fontSize: 360, lineHeight: 1, color: GREEN }}>{"{"}</div>
      <div style={{ ...abs(825 + Math.round(30 * ease(frame, cue)), 565, 180), fontFamily: "monospace", fontSize: 360, lineHeight: 1, color: GREEN }}>{"}"}</div>
      <div style={{ ...abs(240, 645, 600), textAlign: "center", fontSize: 69, fontWeight: 750 }}>LEGAL<br /><span style={{ fontSize: 54 }}>PARTNERSHIPS</span></div>
      <Label top={975}>ILLUSTRATION · A WIDER PICTURE</Label>
    </>;
    case "end": return <div style={{ ...abs(65, 410, 950), fontSize: 157, fontWeight: 800, textAlign: "center", letterSpacing: -8 }}>Solomon.</div>;
    default: return null;
  }
};

export const MeetSolomonNontechFrame: React.FC<{ film: MeetFilm; frame: number }> = ({ film, frame }) => {
  const scene = film.scenes.find(s => frame >= s.from && frame < s.to) ?? film.scenes.at(-1)!;
  const local = frame - scene.from, dark = scene.background === "charcoal";
  const source = scene.proofs.length ? film.evidence.find(e => e.id === scene.proofs[0]!.id)! : undefined;
  const labelY = Math.max(0, ...scene.proofs.map(p => p.y + p.h)) + 27;
  return <AbsoluteFill data-nontech-scene={scene.id} style={{ background: COLORS[scene.background], color: dark ? "#f4efe5" : INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(70, 85, 940), display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 700, letterSpacing: 1.7, opacity: .73 }}><span>MEET SOLOMON</span><span>05 / BEYOND ENGINEERING</span></div>
    <SceneArt scene={scene} frame={local} />
    {scene.proofs.map(p => <NontechProof key={p.id} evidence={film.evidence.find(e => e.id === p.id)!} placement={p} />)}
    {source && <Label top={labelY} dark={dark}>{source.kind === "establishing" ? "PRODUCT VIEW" : "PRODUCT CAPTURE"} · {source.capturedAt.slice(0, 10)}</Label>}
    <Presenter scene={scene} frame={local} /><Caption scene={scene} frame={frame} />
    <div style={{ ...abs(65, 1840, 950), fontSize: 18, textAlign: "center", opacity: .68 }}>PRIVATE STYLE STUDY · DATED PRODUCT CAPTURES · FICTIONAL PRESENTER</div>
  </AbsoluteFill>;
};

export const MeetSolomonNontechFilm: React.FC<{ film: MeetFilm }> = ({ film }) => <>
  <MeetSolomonNontechFrame film={film} frame={useCurrentFrame()} />
  <Audio src={staticFile(film.narrationSrc)} />{film.soundDesignSrc && <Audio src={staticFile(film.soundDesignSrc)} />}
</>;
