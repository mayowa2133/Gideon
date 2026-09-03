import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import type { CSSProperties } from "react";
import { meetEvidenceScale, type MeetEvidence } from "../../shared/meetSolomon";
import { proofIsVisible, proofOffsetX, type MeetFilm, type MeetProof, type MeetScene } from "../../shared/meetSolomonV2";
import { v22MascotPerformanceSchema } from "../../shared/solomonMascotV22";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const COLORS = { ivory: "#f4efe5", clay: "#cd7862", charcoal: "#171b1a", sage: "#d8dfce" };
const INK = "#182320", GREEN = "#176b50", MINT = "#aeebc9", CORAL = "#e59378";
const SERIF = '"Fraunces Variable", Georgia, serif', SANS = '"Manrope Variable", Arial, sans-serif';
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const ease = (frame: number, at = 0, length = 12) => 1 - (1 - Math.max(0, Math.min(1, (frame - at) / length))) ** 3;

export function presenterDirection(scene: MeetScene, frame: number) {
  const close = scene.presenter === "close";
  const scale = close ? 1.56 : scene.layout === "filter" ? .88 : scene.presenter === "center" ? 1.17 : 1.04;
  const x = close ? 26 : scene.presenter === "left" ? 18 : scene.presenter === "right" ? 386 : 155;
  const y = close ? 760 : scene.layout === "filter" ? 1215 : scene.layout === "end" ? 990 : 1070;
  const cue = scene.actionFrame;
  const reach = ease(frame, Math.max(0, cue - 5), 12);
  const returnToCamera = ease(frame, Math.max(cue + 18, scene.to - scene.from - 15), 12);
  const gesture = reach * (1 - returnToCamera);
  return { x: Math.round(x + (scene.action === "push" ? -72 * gesture : scene.action === "inspect" ? 40 * gesture : 0)),
    y: Math.round(y - (scene.action === "inspect" ? 65 * gesture : 0) + (scene.layout === "meet" ? 220 * (1 - ease(frame, 0, 9)) : 0)), scale };
}

export function presenterPlanV2(scene: MeetScene) {
  const duration = scene.to - scene.from, cue = scene.actionFrame;
  const peak = Math.max(12, cue + 5), recover = Math.max(peak + 12, duration - 4);
  const proof = scene.proofs.find(p => p.phase !== "before");
  const target = proof ? { x: (proof.x + proof.w / 2) / 1080, y: (proof.y + proof.h / 2) / 1920 } : { x: .45, y: .34 };
  const rightSide = scene.presenter === "right";
  return v22MascotPerformanceSchema.parse({
    sceneId: `meet-v2-${scene.id}`, role: scene.presenter === "absent" ? "absent" : "host",
    narrativePurpose: scene.layout === "end" ? "cta" : scene.action === "inspect" ? "interpretation" : scene.action === "push" ? "transition" : "attention",
    face: scene.expression, mouthBias: "neutral_dash",
    gazePath: [{ frame: 0, target: "camera", x: .5, y: .4 },
      { frame: Math.max(1, cue - 7), target: proof ? "product" : "caption", ...target },
      { frame: Math.max(peak + 10, duration - 14), target: "camera", x: .5, y: .4 }],
    head: { turn: 0, tilt: scene.action === "inspect" ? -.35 : scene.action === "push" ? .2 : .03, beats: scene.action === "present" ? [Math.max(6, cue)] : [] },
    torso: { lean: scene.action === "inspect" ? .85 : .4, rotate: rightSide ? -.08 : .06, recoil: scene.layout === "meet" ? .3 : 0 },
    left: { gesture: rightSide ? scene.gesture : "rest_mitt", timing: { start: Math.max(1, peak - 9), peak, recover, wristRotation: -22 } },
    right: { gesture: rightSide ? "rest_mitt" : scene.gesture, timing: { start: Math.max(2, peak - 7), peak: peak + 3, recover: recover + 4, wristRotation: 18 } },
    blinkFrames: [Math.max(20, duration - 8)], faceAccents: [],
    audioFrames: [{ frame: 0, rms: 0, speaking: false, onset: 0, phraseBoundary: false }],
    interactionTarget: { elementId: proof?.id ?? "question-card", ...target, action: scene.visualMetaphor },
  });
}

const Presenter: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (scene.presenter === "absent") return null;
  const d = presenterDirection(scene, frame);
  return <div data-meet-v2-presenter={scene.action} style={{ ...abs(d.x, d.y, 660, 940), transform: `scale(${d.scale})`, transformOrigin: "0 0" }}>
    <RobotMascotV22Rig plan={presenterPlanV2(scene)} frame={frame} positioning="external" enterOverride={1} pixelScale={d.scale} mouthless />
  </div>;
};

export const ProductProofV2: React.FC<{ evidence: MeetEvidence; placement: MeetProof; dark: boolean }> = ({ evidence: e, placement: p, dark }) => {
  const box = meetEvidenceScale(e, p.w, p.h);
  if (box.readablePx < (e.kind === "establishing" ? 10 : 20)) throw new Error(`Unreadable V2 proof: ${e.id}`);
  return <div data-meet-v2-proof={e.id}>
    <div style={{ ...abs(Math.round(p.x + (p.w - box.width) / 2), Math.round(p.y + (p.h - box.height) / 2), box.width, box.height), overflow: "hidden", borderRadius: 12, boxShadow: "0 14px 35px #00000019" }}>
      <Img src={staticFile(e.file)} style={{ position: "absolute", maxWidth: "none", width: e.sourceWidth * box.scale, height: e.sourceHeight * box.scale, left: -e.crop.x * box.scale, top: -e.crop.y * box.scale }} />
    </div>
    <div style={{ ...abs(p.x, p.y + p.h + 16, p.w), fontSize: 22, fontWeight: 600, textAlign: "center", color: dark ? "#b7c0b8" : "#46544c" }}>
      {e.kind === "establishing" ? "PRODUCT VIEW" : "PRODUCT CAPTURE"} · {e.capturedAt.slice(0, 10)}
    </div>
  </div>;
};

const Caption: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (["age", "fresh", "compare", "end"].includes(scene.layout)) return null;
  const active = scene.phrases.find(p => frame >= p.from && frame < p.to);
  const text = active?.text ?? scene.headline;
  if (scene.layout === "callback" && frame >= scene.from + scene.actionFrame) return <>
    <div style={{ ...abs(75, 400, 930), fontFamily: SERIF, fontStyle: "italic", fontSize: 164, lineHeight: 1.04, letterSpacing: -6, fontWeight: 600 }}>What<br />changed?</div>
    {active?.text === "since I last checked?" && <div style={{ ...abs(80, 795, 930), fontSize: 57, fontWeight: 700 }}>since I last checked?</div>}
  </>;
  const serif = active?.style === "serif";
  const size = scene.layout === "meet" ? 152 : scene.layout === "question" ? 142 : scene.layout === "feed" ? 90 : serif ? 130 : 99;
  return <div data-meet-v2-caption={text} style={{ ...abs(75, scene.layout === "callback" ? 410 : scene.layout === "meet" ? 275 : 215, 930), zIndex: 5,
    fontFamily: serif ? SERIF : SANS, fontSize: size, lineHeight: 1.04, fontWeight: serif ? 600 : 800, fontStyle: serif ? "italic" : "normal",
    letterSpacing: -4.5, textAlign: scene.layout === "sort" || scene.layout === "callback" ? "left" : "center", textWrap: "balance", whiteSpace: "pre-line" }}>{text}</div>;
};

const QueryCard: React.FC<{ top: number; x?: number; width?: number; opacity?: number; angle?: number }> = ({ top, x = 100, width = 870, opacity = 1, angle = 0 }) => <div style={{ ...abs(x, top, width, 162), opacity, transform: `rotate(${angle}deg)`, background: "#fffdf6", border: "2px solid #d1d6c6", borderRadius: 30, boxShadow: "0 14px 28px #00000012", color: INK }}>
  <svg style={abs(32, 49, 65, 65)} viewBox="0 0 65 65"><circle cx="25" cy="25" r="19" fill="none" stroke={GREEN} strokeWidth="6" /><path d="M39 39 L59 59" stroke={GREEN} strokeWidth="6" strokeLinecap="round" /></svg>
  <div style={{ ...abs(125, 51, width - 145), fontSize: 44, fontWeight: 750 }}>Search for jobs…</div>
</div>;

const Note: React.FC<{ children: React.ReactNode; top: number; dark?: boolean }> = ({ children, top, dark }) => <div style={{ ...abs(70, top, 940), textAlign: "center", fontSize: 26, letterSpacing: 1.1, fontWeight: 600, color: dark ? "#b7c0b8" : "#46544c" }}>{children}</div>;

const SceneArt: React.FC<{ film: MeetFilm; scene: MeetScene; frame: number }> = ({ film, scene, frame }) => {
  const source = (id: string) => film.evidence.find(e => e.id === id)!;
  const cue = scene.actionFrame;
  if (scene.layout === "repeat") return <>
    <QueryCard top={520} x={110} angle={-4} opacity={.55} /><QueryCard top={710} x={80} angle={2} />
    <div style={{ ...abs(795, 765, 105), fontSize: 65, color: GREEN, transform: `rotate(${Math.round(ease(frame, 6, 15) * 180)}deg)` }}>↻</div>
    <Note top={955}>ILLUSTRATION · THE REPEATED SEARCH</Note>
  </>;
  if (scene.layout === "inspect") return <><QueryCard top={515} x={180} width={800} angle={-3} /><Note top={467}>ILLUSTRATION</Note></>;
  if (scene.layout === "question") return <>
    <QueryCard top={565} x={Math.round(105 - 1300 * ease(frame, cue, 12))} /><Note top={512}>ILLUSTRATION</Note>
  </>;
  if (scene.layout === "age" || scene.layout === "fresh") {
    const e = source(scene.layout === "age" ? "older-age" : "recent-age");
    const age = /(\d+)\s+(hours?|days?)\s+ago/i.exec(e.text);
    if (!age) throw new Error("Age reveal must come from verified evidence.");
    return <>
      <div style={{ ...abs(75, 280, 930), textAlign: "center", fontSize: 54, letterSpacing: 5, fontWeight: 700 }}>POSTED</div>
      <div style={{ ...abs(35, 390, 1010), textAlign: "center", fontSize: 480, fontWeight: 800, letterSpacing: -38, lineHeight: 1, color: scene.layout === "age" ? CORAL : MINT }}>{age[1]}</div>
      <div style={{ ...abs(70, 947, 940), textAlign: "center", fontSize: 106, letterSpacing: -5, fontWeight: 800 }}>{age[2]!.toUpperCase()} AGO.</div>
      <Note top={1570} dark>Age shown in the dated capture</Note>
    </>;
  }
  if (scene.layout === "field") return <><Note top={675}>IN SOLOMON</Note><Note top={1260}>YOUR FIELD, SELECTED.</Note></>;
  if (scene.layout === "filter") return <>
    <div style={{ ...abs(105, 515, 840), fontSize: 31, letterSpacing: 2, fontWeight: 750, color: GREEN }}>{frame < cue ? "BEFORE FILTER SELECTION" : "AFTER FILTER SELECTION"}</div>
    <svg style={abs(480, 955, 120, 115)} viewBox="0 0 120 115"><path d="M60 8 V92 L27 61 M60 92 L93 61" fill="none" stroke={GREEN} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <Note top={1490}>BEFORE / AFTER EDIT · THE SAME FILTER INTERACTION</Note>
  </>;
  if (scene.layout === "feed") return <Note top={1440}>ACTUAL PRODUCT · STARTUP FILTER SELECTED</Note>;
  if (scene.layout === "sort") return <>
    <div style={{ ...abs(110, 590, 860), fontSize: 38, color: GREEN }}>A useful place to start.</div>
    <svg style={abs(430, 1050, 520, 120)} viewBox="0 0 520 120"><path d="M10 80 H435 L401 45 M435 80 L401 114" fill="none" stroke={GREEN} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </>;
  if (scene.layout === "role") return <>
    <div style={{ ...abs(frame < cue ? 175 : 526, frame < cue ? 737 : 770, frame < cue ? 595 : 350, 7), borderRadius: 7, background: GREEN }} />
    <Note top={915}>{frame < cue ? "ROLE + COMPANY" : "THEN, THE POSTING DATE"}</Note>
  </>;
  if (scene.layout === "compare") return <>
    <div style={{ ...abs(75, 235, 930), fontSize: 96, lineHeight: 1.05, letterSpacing: -4, fontWeight: 800 }}>DIFFERENT JOBS.<br />DIFFERENT AGES.</div>
    <Note top={505}>Different listings · different capture dates</Note>
    <div style={{ ...abs(80, 590, 920), fontSize: 114, letterSpacing: -5, fontWeight: 800, textAlign: "center", color: frame < cue ? "#a05540" : GREEN }}>
      {frame < cue ? "Days old." : "Hours old."}
    </div>
  </>;
  if (scene.layout === "callback") return <>
    {frame < cue && <QueryCard top={710} x={Math.round(100 - 1300 * ease(frame, Math.max(0, cue - 10), 10))} />}
    <Note top={935} dark>ILLUSTRATION · THE QUESTION TO COME BACK WITH</Note>
  </>;
  if (scene.layout === "end") return <div style={{ ...abs(65, 390, 950), fontSize: 155, letterSpacing: -8, fontWeight: 800, textAlign: "center" }}>Solomon.</div>;
  return null;
};

export const MeetSolomonFrameV2: React.FC<{ film: MeetFilm; frame: number }> = ({ film, frame }) => {
  const scene = film.scenes.find(s => frame >= s.from && frame < s.to) ?? film.scenes[film.scenes.length - 1]!;
  const local = frame - scene.from, dark = scene.background === "charcoal";
  return <AbsoluteFill data-meet-v2-scene={scene.id} style={{ background: COLORS[scene.background], color: dark ? "#f4efe5" : INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(70, 90, 940), display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 700, letterSpacing: 1.8, opacity: .72 }}><span>MEET SOLOMON</span><span>WHAT CHANGED?</span></div>
    <SceneArt film={film} scene={scene} frame={local} />
    {scene.proofs.filter(p => proofIsVisible(p, scene, local)).map(p => {
      // Each card holds for reading, then moves as one object. Source pixels never morph.
      const dx = proofOffsetX(p, scene, local);
      return <div key={p.id} style={{ transform: `translateX(${Math.round(dx)}px)` }}><ProductProofV2 evidence={film.evidence.find(e => e.id === p.id)!} placement={p} dark={dark} /></div>;
    })}
    <Presenter scene={scene} frame={local} /><Caption scene={scene} frame={frame} />
    <div style={{ ...abs(70, 1840, 940), fontSize: 18, textAlign: "center", opacity: .65 }}>PRIVATE STYLE STUDY · DATED PRODUCT CAPTURES · FICTIONAL PRESENTER</div>
  </AbsoluteFill>;
};

export const MeetSolomonFilmV2: React.FC<{ film: MeetFilm }> = ({ film }) => {
  const frame = useCurrentFrame();
  return <><MeetSolomonFrameV2 film={film} frame={frame} /><Audio src={staticFile(film.narrationSrc)} />{film.soundDesignSrc && <Audio src={staticFile(film.soundDesignSrc)} />}</>;
};
