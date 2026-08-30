import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import type { CSSProperties } from "react";
import { meetEvidenceScale, proofPlacements, type ProofPlacement, type MeetEvidence, type MeetFilm, type MeetScene } from "../../shared/meetSolomon";
import { v22MascotPerformanceSchema } from "../../shared/solomonMascotV22";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const COLORS = { ivory: "#f4efe5", clay: "#cd7862", charcoal: "#171b1a", sage: "#d8dfce" };
const INK = "#182320", GREEN = "#176b50", MINT = "#aeebc9", CORAL = "#e59378";
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Manrope Variable", Arial, sans-serif';
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const ease = (f: number, delay = 0, length = 12) => 1 - (1 - Math.max(0, Math.min(1, (f - delay) / length))) ** 3;

export function ageOf(evidence: MeetEvidence) {
  const match = /(\d+)\s+(hours?|days?)\s+ago/i.exec(evidence.text);
  if (!match) throw new Error(`No verified age on ${evidence.id}`);
  return { number: match[1]!, unit: match[2]!.toUpperCase() };
}

const Proof: React.FC<{ evidence: MeetEvidence; placement: ProofPlacement; frame: number; dark: boolean }> = ({ evidence, placement: p, frame, dark }) => {
  const box = meetEvidenceScale(evidence, p.w, p.h);
  if (box.readablePx < (evidence.kind === "establishing" ? 10 : 20)) throw new Error(`Unreadable proof ${evidence.id}: ${box.readablePx.toFixed(1)}px`);
  const enter = ease(frame, 2);
  const left = Math.round(p.x + (p.w - box.width) / 2), top = Math.round(p.y + (p.h - box.height) / 2);
  return <div data-meet-proof={evidence.id}>
    <div style={{ ...abs(left, top, box.width, box.height), overflow: "hidden", borderRadius: 12,
      boxShadow: "0 16px 32px rgba(0,0,0,.13)", transform: `translateY(${Math.round((1 - enter) * 35)}px)`, opacity: enter }}>
      <Img src={staticFile(evidence.file)} style={{ position: "absolute", maxWidth: "none", width: evidence.sourceWidth * box.scale,
        height: evidence.sourceHeight * box.scale, left: -evidence.crop.x * box.scale, top: -evidence.crop.y * box.scale }} />
    </div>
    <div style={{ ...abs(p.x, p.y + p.h + 23, p.w), textAlign: "center", fontSize: 23, fontWeight: 600, letterSpacing: 1.2, color: dark ? "#aeb9b1" : "#46544c" }}>
      {evidence.kind === "establishing" ? "PRODUCT VIEW" : "PRODUCT CAPTURE"} · {evidence.capturedAt.slice(0, 10)}
    </div>
  </div>;
};

export function presenterPlan(scene: MeetScene) {
  const duration = scene.to - scene.from;
  return v22MascotPerformanceSchema.parse({
    sceneId: `meet-${scene.id}`, role: scene.presenter === "absent" ? "absent" : "host",
    narrativePurpose: scene.layout === "end" ? "cta" : "attention", face: scene.expression, mouthBias: "neutral_dash",
    gazePath: [{ frame: 0, target: "camera", x: .5, y: .4 }, { frame: 5, target: "product", x: scene.presenter === "right" ? .3 : .6, y: .19 }, { frame: Math.max(26, duration - 16), target: "camera", x: .5, y: .4 }],
    head: { turn: 0, tilt: scene.expression === "skeptical" ? -.35 : .06, beats: [] },
    torso: { lean: .35, rotate: scene.presenter === "left" ? -.09 : .09, recoil: scene.layout === "meet" ? .5 : .1 },
    left: { gesture: scene.presenter === "right" ? scene.gesture : "rest_mitt", timing: { start: 7, peak: 20, recover: Math.max(42, duration - 4), wristRotation: -15 } },
    right: { gesture: scene.presenter === "right" ? "rest_mitt" : scene.gesture, timing: { start: 9, peak: 24, recover: Math.max(46, duration - 2), wristRotation: 12 } },
    blinkFrames: [Math.max(33, Math.floor(duration * .73))],
    faceAccents: scene.layout === "feed" ? [{ atFrame: 9, face: "surprised", holdFrames: 8 }] : [],
    audioFrames: [{ frame: 0, rms: 0, speaking: false, onset: 0, phraseBoundary: false }],
    interactionTarget: { elementId: scene.evidence[0] ?? "headline", x: .5, y: .3, action: scene.visualMetaphor },
  });
}

const Presenter: React.FC<{ scene: MeetScene; frame: number }> = ({ scene, frame }) => {
  if (scene.presenter === "absent" || (scene.layout === "feed" && frame < 30)) return null;
  const close = scene.presenter === "close";
  const scale = close ? 1.58 : scene.presenter === "center" ? 1.13 : 1.03;
  const x = close ? 18 : scene.presenter === "left" ? 10 : scene.presenter === "right" ? 394 : 167;
  const y = close ? 740 : scene.layout === "end" ? 1110 : 1040;
  const enter = scene.layout === "meet" || scene.layout === "hook" ? Math.round((1 - ease(frame)) * 780) : 0;
  const exit = scene.layout === "leave" ? -Math.round(ease(frame, Math.max(10, (scene.to - scene.from) * .45), 22) * 900) : 0;
  return <div data-meet-presenter={scene.presenter} style={{ ...abs(x + exit, y + enter, 660, 940), transform: `scale(${scale})`, transformOrigin: "0 0" }}>
    <RobotMascotV22Rig plan={presenterPlan(scene)} frame={frame} positioning="external" enterOverride={1} pixelScale={scale} mouthless />
  </div>;
};

const Caption: React.FC<{ scene: MeetScene; globalFrame: number }> = ({ scene, globalFrame }) => {
  const active = scene.phrases.find(p => globalFrame >= p.from && globalFrame < p.to);
  const text = active?.text ?? scene.headline;
  const serif = active?.style === "serif" || (!active && ["hook", "detail", "meet", "automatic", "question", "payoff", "end"].includes(scene.layout));
  const fullProof = ["stale", "fresh", "compare", "question"].includes(scene.layout);
  // The age itself is already the phrase caption; don't triple-state it above.
  if (fullProof) return null;
  const size = scene.layout === "meet" ? 148 : scene.layout === "end" ? 132 : serif ? 124 : 98;
  return <div data-meet-caption={text} style={{ ...abs(70, scene.layout === "question" ? 340 : 205, 940),
    textAlign: "center", fontFamily: serif ? SERIF : SANS, fontStyle: serif ? "italic" : "normal", fontWeight: serif ? 600 : 800,
    fontSize: size, lineHeight: 1.04, letterSpacing: serif ? -5 : -4, textWrap: "balance", zIndex: 4 }}>
    {text}
  </div>;
};

const Pill: React.FC<{ text: string; left: number; top: number; frame: number; delay?: number; dark?: boolean; width?: number }> = ({ text, left, top, frame, delay = 0, dark = false, width = 740 }) => {
  const p = ease(frame, delay);
  return <div style={{ ...abs(left, top, width), padding: "30px 36px", boxSizing: "border-box", background: dark ? "#2b3832" : "#fffdf6", color: dark ? MINT : INK,
    borderRadius: 24, boxShadow: "0 16px 32px #00000010", fontSize: 43, fontWeight: 700,
    transform: `translateY(${Math.round((1 - p) * 52)}px) rotate(${(1 - p) * -3}deg)`, opacity: p }}>{text}</div>;
};

const IllustrationLabel: React.FC<{ top?: number }> = ({ top = 955 }) => <div style={{ ...abs(80, top, 920), textAlign: "center", opacity: .65, fontSize: 23, letterSpacing: 2 }}>ILLUSTRATION</div>;

const SceneArt: React.FC<{ scene: MeetScene; frame: number; film: MeetFilm }> = ({ scene, frame, film }) => {
  const duration = scene.to - scene.from;
  const evidence = (id: string) => film.evidence.find(e => e.id === id)!;
  const dark = scene.background === "charcoal";
  const accent = dark ? MINT : GREEN;
  if (scene.layout === "hook") return <>
    <div style={{ ...abs(200, 570, 680, 260), borderRadius: 32, background: "#fffdf6", boxShadow: "0 25px 60px #172b2019", transform: `translateY(${Math.round((1 - ease(frame, 5)) * 120)}px) rotate(-3deg)` }}>
      <div style={{ ...abs(35, 35, 70, 70), borderRadius: 18, background: "#d8dfce", fontSize: 52, textAlign: "center" }}>✓</div>
      <div style={{ ...abs(133, 40, 480), fontSize: 43, fontWeight: 800 }}>Your next role?</div>
      <div style={{ ...abs(38, 152, 535, 15), borderRadius: 15, background: "#d8dfce" }} />
      <div style={{ ...abs(38, 185, 345, 15), borderRadius: 15, background: "#e9e9df" }} />
    </div><IllustrationLabel top={886} />
  </>;
  if (scene.layout === "checklist") return <>
    {["GREAT COMPANY", "RIGHT ROLE", "YOUR EXPERIENCE"].map((text, i) => {
      const at = (scene.phrases[i]?.from ?? scene.from + i * duration / 3) - scene.from;
      return <Pill key={text} text={`${frame > at + 3 ? "✓" : "○"}   ${text}`} left={80} top={500 + i * 136} frame={frame} delay={at} width={850} />;
    })}
    <IllustrationLabel top={945} />
  </>;
  if (scene.layout === "detail") return <>
    <div style={{ ...abs(375, 640, 430), fontSize: 39, opacity: .75 }}>Posted … ago</div>
    <svg style={abs(340, 590, 510, 140)} viewBox="0 0 510 140"><ellipse cx="255" cy="70" rx="242" ry="60" fill="none" stroke={INK} strokeWidth="5" strokeDasharray="1500" strokeDashoffset={1500 * (1 - ease(frame, 8, 20))} /></svg>
    <IllustrationLabel top={815} />
  </>;
  if (scene.layout === "stale" || scene.layout === "fresh") {
    const age = ageOf(evidence(scene.layout === "stale" ? "older-age" : "recent-age"));
    return <>
      <div style={{ ...abs(70, 252, 940), textAlign: "center", fontSize: 55, fontWeight: 700, letterSpacing: 4 }}>{scene.layout === "stale" ? "POSTED" : "THIS LISTING"}</div>
      <div style={{ ...abs(40, 402, 1000), textAlign: "center", fontFamily: SERIF, fontSize: 470, fontStyle: "italic", fontWeight: 500, lineHeight: 1, letterSpacing: -30, color: scene.layout === "stale" ? CORAL : MINT,
        transform: `scale(${.93 + .07 * ease(frame, 0, 8)})` }}>{age.number}</div>
      <div style={{ ...abs(70, 950, 940), textAlign: "center", fontSize: 112, fontWeight: 800, letterSpacing: -5 }}>{age.unit} AGO.</div>
      <div style={{ ...abs(110, 1570, 860), textAlign: "center", fontSize: 36, color: "#b7c0b8" }}>Age shown at capture</div>
    </>;
  }
  if (scene.layout === "meet") return <div style={{ ...abs(280, 680, 520), textAlign: "center", fontSize: 31, letterSpacing: 6, fontWeight: 700, color: GREEN }}>A DIFFERENT START.</div>;
  if (scene.layout === "profile") return <>
    {["ROLE", "LOCATION", "YOUR PRIORITIES"].map((text, i) => <Pill key={text} text={text} left={90 + Math.round(ease(frame, 30, 14) * (i % 2 ? 30 : -20))} top={500 + i * 131 - Math.round(ease(frame, 30, 14) * i * 22)} frame={frame} delay={i * 6} width={780} />)}
    <IllustrationLabel top={935} />
  </>;
  if (scene.layout === "automatic") return <>
    <div style={{ ...abs(190, 620, 700), textAlign: "center", fontSize: 43, fontWeight: 700, letterSpacing: 1 }}>YOUR PROFILE</div>
    <div style={{ ...abs(530, 735, 4, 140), background: MINT, transformOrigin: "top", transform: `scaleY(${ease(frame, 6, 15)})` }} />
    <div style={{ ...abs(205, 1240, 670), textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontSize: 100, color: MINT }}>your job feed.</div>
  </>;
  if (scene.layout === "leave") return <>
    {[0, 1, 2].map(i => <div key={i} style={{ opacity: i === 0 ? 1 : 1 - ease(frame, 12, 20), transform: `translateY(${-Math.round(ease(frame, 12, 20) * i * 135)}px)` }}><Pill text="Run that search again?" left={140} top={490 + i * 135} frame={frame} delay={i * 3} width={800} /></div>)}
    {frame > duration * .6 && <div style={{ ...abs(80, 850, 920), fontFamily: SERIF, fontStyle: "italic", fontSize: 103, textAlign: "center", color: GREEN }}>you can leave.</div>}
    <IllustrationLabel top={1000} />
  </>;
  if (scene.layout === "feed") return frame < 30 ? null : <div style={{ ...abs(100, 875, 880), fontSize: 34, textAlign: "center", color: GREEN }}>A real role. A visible timestamp.</div>;
  if (scene.layout === "sort") return <>
    <svg style={abs(100, 845, 680, 150)} viewBox="0 0 680 150"><path d="M30 75 H625 M570 24 L625 75 L570 126" fill="none" stroke={GREEN} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </>;
  if (scene.layout === "compare") return <>
    <div style={{ ...abs(70, 210, 940), textAlign: "center", fontSize: 34, letterSpacing: 3 }}>DIFFERENT LISTINGS · DIFFERENT CAPTURES</div>
    <div style={{ ...abs(80, 365 + Math.round(ease(frame, 12, 14) * 35), 920), fontFamily: SERIF, fontStyle: "italic", fontSize: 175, textAlign: "center", opacity: .72 }}>days old.</div>
    <div style={{ ...abs(80, 975 - Math.round(ease(frame, 16, 14) * 35), 920), fontFamily: SERIF, fontStyle: "italic", fontSize: 175, textAlign: "center" }}>hours old.</div>
    <div style={{ ...abs(80, 1580, 920), textAlign: "center", fontSize: 42 }}>Start with what’s newer.</div>
  </>;
  if (scene.layout === "question") return <>
    <div style={{ ...abs(80, 280, 920), textAlign: "center", fontSize: 40, letterSpacing: 3 }}>A BETTER QUESTION.</div>
    <div style={{ ...abs(110, 690, 860), textAlign: "center", fontSize: 48, color: "#9ba99e", textDecoration: "line-through", textDecorationColor: CORAL }}>Have I already seen this?</div>
    <div style={{ ...abs(80, 1020, 920), fontFamily: SERIF, fontStyle: "italic", fontSize: 175, lineHeight: 1.04, color: MINT, textAlign: "center", opacity: ease(frame, duration * .45, 9) }}>What<br />changed?</div>
  </>;
  if (scene.layout === "payoff") return <>
    <Pill text="✓   THE RIGHT FIT" left={100} top={585} frame={frame} width={850} />
    <Pill text="+   STILL FRESH" left={100} top={745} frame={frame} delay={Math.round(duration * .45)} width={850} />
  </>;
  if (scene.layout === "end") return <>
    <div style={{ ...abs(100, 640, 880), textAlign: "center", color: accent, fontFamily: SERIF, fontStyle: "italic", fontSize: 86 }}>find what matters.</div>
    <div style={{ ...abs(80, 865, 920), fontSize: 70, fontWeight: 800, letterSpacing: -3, textAlign: "center" }}>Solomon<span style={{ color: GREEN }}>.</span></div>
  </>;
  return null;
};

export const MeetSolomonFilm: React.FC<{ film: MeetFilm }> = ({ film }) => {
  const globalFrame = useCurrentFrame();
  const scene = film.scenes.find(s => globalFrame >= s.from && globalFrame < s.to) ?? film.scenes.at(-1)!;
  const frame = globalFrame - scene.from, dark = scene.background === "charcoal";
  const proofs = proofPlacements(scene).filter(p => frame >= (p.from ?? 0) && frame < (p.to ?? Infinity));
  return <AbsoluteFill style={{ background: COLORS[scene.background], color: dark ? "#f5f1e7" : INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(70, 79, 940), display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 700, letterSpacing: 2, opacity: .72 }}><span>MEET SOLOMON</span><span>06 / TOO LATE</span></div>
    <SceneArt scene={scene} frame={frame} film={film} />
    {proofs.map(p => <Proof key={p.id} evidence={film.evidence.find(e => e.id === p.id)!} placement={p} frame={frame} dark={dark} />)}
    <Presenter scene={scene} frame={frame} />
    <Caption scene={scene} globalFrame={globalFrame} />
    <div style={{ ...abs(65, 1850, 950), fontSize: 21, textAlign: "center", letterSpacing: 1, opacity: .75, zIndex: 5 }}>STYLE STUDY · DATED PRODUCT CAPTURES · FICTIONAL BRAND PRESENTER</div>
    <Audio src={staticFile(film.narrationSrc)} />
    {film.soundDesignSrc && <Audio src={staticFile(film.soundDesignSrc)} />}
  </AbsoluteFill>;
};
