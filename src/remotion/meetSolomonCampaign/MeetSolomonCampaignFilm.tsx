import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { MeetSolomonCampaignAngle, MeetSolomonCampaignFilm as CampaignFilm } from "../../shared/meetSolomonCampaign";
import { v22MascotPerformanceSchema, type V22MascotPerformance } from "../../shared/solomonMascotV22";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const INK = "#15211d";
const IVORY = "#f7f3ea";
const SANS = '"Manrope Variable", Arial, sans-serif';
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });

const palette: Record<MeetSolomonCampaignAngle, { accent: string; soft: string; dark: string; signal: string }> = {
  "application-triage": { accent: "#f2962f", soft: "#fff0d8", dark: "#1d2421", signal: "#176b50" },
  "company-opportunities": { accent: "#7159d9", soft: "#eee9ff", dark: "#1c1734", signal: "#176b50" },
  "follow-up-cadence": { accent: "#ef6a58", soft: "#ffe9e4", dark: "#2b1714", signal: "#176b50" },
  "commute-fit": { accent: "#1485a8", soft: "#dff5fa", dark: "#112a32", signal: "#176b50" },
  "ai-control": { accent: "#176b50", soft: "#def3e8", dark: "#13261f", signal: "#f2962f" },
};

export const campaignMotionKind = (angle: MeetSolomonCampaignAngle) => ({
  "application-triage": "funnel",
  "company-opportunities": "cascade",
  "follow-up-cadence": "timer",
  "commute-fit": "radius",
  "ai-control": "console",
} as const)[angle];

export const campaignMascotScenes = (sceneId: string) => sceneId === "hook" || sceneId === "payoff" || sceneId === "cta";

export function campaignMascotPlan(angle: MeetSolomonCampaignAngle, sceneId: string, duration: number): V22MascotPerformance {
  const cta = sceneId === "cta";
  const payoff = sceneId === "payoff";
  const leftGesture = angle === "follow-up-cadence" && !cta ? "bookmark_tap" : cta ? "presentation_palm" : payoff ? "stop_palm" : "wave";
  return v22MascotPerformanceSchema.parse({
    sceneId: `campaign-${angle}-${sceneId}`,
    role: cta ? "cameo_right" : "cameo_left",
    narrativePurpose: cta ? "cta" : payoff ? "payoff_reaction" : "attention",
    face: cta ? "direct_cta" : payoff ? "friendly" : "happy",
    mouthBias: "closed_smile",
    gazePath: [
      { frame: 0, target: "camera", x: 0.5, y: 0.42 },
      { frame: 12, target: cta ? "cta" : "caption", x: cta ? 0.37 : 0.46, y: cta ? 0.42 : 0.22 },
      { frame: Math.max(36, duration - 12), target: "camera", x: 0.5, y: 0.42 },
    ],
    head: { turn: 0, tilt: cta ? -0.08 : 0.09, beats: [18] },
    torso: { lean: 0.18, rotate: cta ? -0.06 : 0.04, recoil: 0.1 },
    left: { gesture: leftGesture, timing: { start: 8, peak: 20, recover: 40, wristRotation: -18 } },
    right: { gesture: cta ? "wave" : "rest_mitt", timing: { start: 12, peak: 26, recover: 44, wristRotation: 20 } },
    blinkFrames: [Math.min(duration - 8, 52)],
    faceAccents: cta ? [{ atFrame: Math.min(duration - 12, 48), face: "wink", holdFrames: 7 }] : [],
    audioFrames: [{ frame: 0, rms: 0, speaking: false, onset: 0, phraseBoundary: false }],
    interactionTarget: { elementId: cta ? "join-solomon" : "campaign-headline", x: cta ? 0.48 : 0.5, y: cta ? 0.45 : 0.2, action: cta ? "present the CTA" : "guide attention" },
  });
}

const MascotCameo: React.FC<{ film: CampaignFilm; sceneId: string; frame: number; duration: number }> = ({ film, sceneId, frame, duration }) => {
  const cta = sceneId === "cta";
  const enter = spring({ fps: 30, frame, config: { damping: 16, stiffness: 130, mass: 0.8 } });
  const scale = cta ? 0.37 : 0.29;
  return <div data-campaign-mascot={sceneId} style={{ ...abs(cta ? 735 : 806, cta ? 1248 : 1160, cta ? 315 : 244, cta ? 430 : 325), zIndex: 20, overflow: "hidden", background: "transparent", opacity: enter, transform: `translateY(${(1 - enter) * 70}px) scale(${0.94 + enter * 0.06})`, transformOrigin: "bottom center" }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: 660, height: 940, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
      <RobotMascotV22Rig plan={campaignMascotPlan(film.angle, sceneId, duration)} frame={Math.min(frame, 66)} positioning="external" pixelScale={scale} enterOverride={1} mouthless />
    </div>
  </div>;
};

function proofFor(film: CampaignFilm, proofId: string) {
  for (const source of film.sources) {
    const proof = source.proofs.find((candidate) => candidate.id === proofId);
    if (proof) return { source, proof };
  }
  return null;
}

const ProductProof: React.FC<{ film: CampaignFilm; proofId: string; frame: number; index?: number; compact?: boolean }> = ({ film, proofId, frame, index = 0, compact }) => {
  const found = proofFor(film, proofId);
  if (!found) return null;
  const { source, proof } = found;
  const expandX = proof.crop.height < 60 ? 18 : Math.min(52, Math.max(18, Math.round(proof.crop.width * 0.08)));
  const expandY = proof.crop.height < 60 ? 22 : Math.min(58, Math.max(24, Math.round(proof.crop.height * 0.7)));
  const x = Math.max(0, proof.crop.x - expandX);
  const y = Math.max(0, proof.crop.y - expandY);
  const width = Math.min(source.sourceWidth - x, proof.crop.width + expandX * 2);
  const height = Math.min(source.sourceHeight - y, proof.crop.height + expandY * 2);
  const panelWidth = compact ? 805 : 884;
  const panelHeight = compact ? 220 : 330;
  const scale = Math.min(panelWidth / width, panelHeight / height);
  const reveal = spring({ fps: 30, frame: frame - index * 7, config: { damping: 18, stiffness: 120, mass: 0.85 } });
  return <div data-product-proof={proofId} style={{ position: "relative", width: panelWidth, height: panelHeight, overflow: "hidden", borderRadius: 28, background: "white", border: "3px solid #d9ded8", boxShadow: "0 24px 54px #0d21192b", opacity: reveal, transform: `translateY(${(1 - reveal) * 45}px) scale(${0.96 + reveal * 0.04})` }}>
    <Img src={staticFile(source.file)} style={{ position: "absolute", left: (panelWidth - width * scale) / 2 - x * scale, top: (panelHeight - height * scale) / 2 - y * scale, width: source.sourceWidth * scale, height: source.sourceHeight * scale, maxWidth: "none" }} />
    <div style={{ ...abs(18, 16, 180), padding: "8px 12px", borderRadius: 999, background: "#17221fe8", color: "white", fontSize: 17, fontWeight: 850, letterSpacing: 1.2, textAlign: "center" }}>ACTUAL PRODUCT</div>
  </div>;
};

const Label: React.FC<{ children: ReactNode; dark?: boolean }> = ({ children, dark }) => <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "9px 15px", background: dark ? "#ffffff1f" : "#17221f0d", color: dark ? "white" : "#526159", fontSize: 18, fontWeight: 800, letterSpacing: 1.15 }}>{children}</div>;

const TriageVisual: React.FC<{ frame: number; accent: string }> = ({ frame, accent }) => {
  const labels = ["APPLY", "APPLY", "APPLY", "REVIEW", "APPLY", "FOCUS"];
  return <div style={{ ...abs(70, 420, 940, 850) }}>
    <div style={{ ...abs(400, 60, 140, 610), background: `linear-gradient(180deg,${accent}12,${accent}55)`, clipPath: "polygon(0 0,100% 0,70% 100%,30% 100%)", borderRadius: 28 }} />
    {labels.map((label, index) => {
      const progress = spring({ fps: 30, frame: frame - index * 5, config: { damping: 18, stiffness: 110 } });
      const left = index % 2 ? 535 + (index % 3) * 74 : 90 + index * 62;
      const top = 40 + index * 92;
      return <div key={`${label}-${index}`} style={{ ...abs(left, top, 210, 68), display: "grid", placeItems: "center", borderRadius: 18, background: label === "FOCUS" ? accent : "white", color: label === "FOCUS" ? "white" : INK, border: `2px solid ${label === "FOCUS" ? accent : "#d8ddd7"}`, boxShadow: "0 14px 26px #17221f1c", fontSize: 24, fontWeight: 900, opacity: progress, transform: `translateY(${(1 - progress) * -75}px) rotate(${(index - 2) * 1.5}deg)` }}>{label}</div>;
    })}
    <div style={{ ...abs(330, 710, 280, 86), display: "grid", placeItems: "center", borderRadius: 24, background: INK, color: "white", fontSize: 31, fontWeight: 900, letterSpacing: 1 }}>YOUR TIME</div>
  </div>;
};

const CompanyVisual: React.FC<{ frame: number; accent: string }> = ({ frame, accent }) => {
  const typed = Math.floor(interpolate(frame, [4, 44], [0, 18], clamp));
  const text = "company.com/careers".slice(0, typed);
  return <div style={{ ...abs(74, 455, 932, 760) }}>
    <div style={{ padding: "28px 32px", borderRadius: 28, background: "white", border: `3px solid ${accent}`, boxShadow: "0 22px 50px #20183f22", fontSize: 35, fontWeight: 800 }}><span style={{ color: "#7c837f" }}>↳ </span>{text}<span style={{ opacity: frame % 18 < 9 ? 1 : 0 }}>|</span></div>
    <div style={{ ...abs(448, 120, 4, 120), background: accent }} />
    {["ROLE 01", "ROLE 02", "ROLE 03", "ROLE 04"].map((label, index) => {
      const enter = spring({ fps: 30, frame: frame - 34 - index * 6, config: { damping: 17, stiffness: 125 } });
      return <div key={label} style={{ ...abs(index % 2 ? 490 : 28, 250 + Math.floor(index / 2) * 190, 410, 145), padding: "28px", boxSizing: "border-box", borderRadius: 25, background: index === 0 ? accent : "white", color: index === 0 ? "white" : INK, border: `2px solid ${index === 0 ? accent : "#dadbd7"}`, boxShadow: "0 18px 34px #20183f1a", opacity: enter, transform: `translateY(${(1 - enter) * 55}px)` }}>
        <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: 1.3 }}>{label}</div><div style={{ marginTop: 18, height: 13, width: "82%", borderRadius: 10, background: index === 0 ? "#ffffff99" : "#d9d6e6" }} /><div style={{ marginTop: 12, height: 13, width: "54%", borderRadius: 10, background: index === 0 ? "#ffffff72" : "#e8e5ef" }} />
      </div>;
    })}
  </div>;
};

const FollowUpVisual: React.FC<{ frame: number; accent: string }> = ({ frame, accent }) => {
  const sweep = interpolate(frame, [0, 72], [0, 300], clamp);
  const pulse = 1 + Math.sin(frame / 7) * 0.035;
  return <div style={{ ...abs(80, 420, 920, 850) }}>
    <div style={{ ...abs(225, 10, 470, 470), borderRadius: "50%", background: `conic-gradient(${accent} ${sweep}deg,#eadedb ${sweep}deg)`, display: "grid", placeItems: "center", transform: `scale(${pulse})` }}><div style={{ width: 350, height: 350, borderRadius: "50%", background: IVORY, display: "grid", placeItems: "center", textAlign: "center" }}><div><div style={{ fontSize: 94, fontWeight: 950, letterSpacing: -5 }}>24H</div><div style={{ fontSize: 24, fontWeight: 850, color: accent }}>DON’T LET IT GO STALE</div></div></div></div>
    {["GOOD CONVERSATION", "DRAFT READY", "YOUR DECISION"].map((label, index) => {
      const enter = spring({ fps: 30, frame: frame - 22 - index * 9, config: { damping: 17, stiffness: 125 } });
      return <div key={label} style={{ ...abs(70 + index * 30, 545 + index * 94, 760, 76), display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", boxSizing: "border-box", borderRadius: 19, background: index === 2 ? INK : "white", color: index === 2 ? "white" : INK, boxShadow: "0 14px 30px #2b171420", opacity: enter, transform: `translateX(${(1 - enter) * 100}px)` }}><span style={{ fontSize: 23, fontWeight: 900 }}>{label}</span><span style={{ color: index === 2 ? "#77e8bd" : accent, fontSize: 27 }}>●</span></div>;
    })}
  </div>;
};

const CommuteVisual: React.FC<{ frame: number; accent: string }> = ({ frame, accent }) => {
  const radius = interpolate(frame, [8, 62], [0.2, 1], clamp);
  const pins = [[210, 235], [620, 190], [680, 570], [260, 635], [460, 420]];
  return <div style={{ ...abs(76, 415, 928, 860), overflow: "hidden", borderRadius: 42, background: "#edf8fa", border: "3px solid #cce8ee" }}>
    {[0, 1, 2, 3, 4].map((line) => <div key={`h${line}`} style={{ ...abs(0, 100 + line * 145, 928, 3), background: "#c9e5ea", transform: `rotate(${line % 2 ? 4 : -3}deg)` }} />)}
    {[0, 1, 2, 3].map((line) => <div key={`v${line}`} style={{ ...abs(120 + line * 225, 0, 3, 860), background: "#c9e5ea", transform: `rotate(${line % 2 ? -5 : 3}deg)` }} />)}
    <div style={{ ...abs(464 - 300 * radius, 430 - 300 * radius, 600 * radius, 600 * radius), borderRadius: "50%", border: `7px solid ${accent}`, background: `${accent}16`, boxShadow: `0 0 0 18px ${accent}0c` }} />
    <div style={{ ...abs(405, 372, 118, 118), borderRadius: "50% 50% 50% 0", background: accent, transform: "rotate(-45deg)", boxShadow: "0 18px 38px #0e53682b" }}><div style={{ ...abs(35, 35, 48, 48), borderRadius: "50%", background: "white" }} /></div>
    {pins.map(([left, top], index) => { const enter = spring({ fps: 30, frame: frame - 35 - index * 7, config: { damping: 14, stiffness: 160 } }); return <div key={`${left}-${top}`} style={{ ...abs(left!, top!, 62, 62), borderRadius: "50% 50% 50% 0", background: index === 4 ? "#f2962f" : INK, transform: `rotate(-45deg) scale(${enter})`, boxShadow: "0 12px 25px #112a322d" }} />; })}
    <div style={{ ...abs(312, 750, 304, 62), display: "grid", placeItems: "center", borderRadius: 18, background: INK, color: "white", fontSize: 25, fontWeight: 900 }}>TORONTO · 50 KM</div>
  </div>;
};

const ControlVisual: React.FC<{ frame: number; accent: string }> = ({ frame, accent }) => {
  const rows = ["RESUME ASSIST", "INFERRED CLAIMS", "EXPORT DATA", "SEND MESSAGE"];
  return <div style={{ ...abs(74, 430, 932, 820), padding: "46px", boxSizing: "border-box", borderRadius: 42, background: "#fdfefc", border: "3px solid #cfe5da", boxShadow: "0 26px 58px #10251d1d" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 34 }}><div style={{ fontSize: 28, fontWeight: 950 }}>YOU SET THE RULES</div><div style={{ width: 84, height: 12, borderRadius: 10, background: accent }} /></div>
    {rows.map((label, index) => {
      const enter = spring({ fps: 30, frame: frame - index * 8, config: { damping: 18, stiffness: 115 } });
      const on = index === 0 || index === 2;
      return <div key={label} style={{ height: 145, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #e1e9e4", opacity: enter, transform: `translateX(${(1 - enter) * 55}px)` }}><div><div style={{ fontSize: 25, fontWeight: 900 }}>{label}</div><div style={{ marginTop: 12, fontSize: 19, color: "#67746e", fontWeight: 650 }}>{index === 3 ? "WAITS FOR YOUR REVIEW" : "YOUR SETTING"}</div></div><div style={{ position: "relative", width: 126, height: 66, borderRadius: 40, background: on ? accent : "#d9dfdb" }}><div style={{ ...abs(on ? 66 : 8, 8, 50, 50), borderRadius: "50%", background: "white", boxShadow: "0 6px 14px #13261f22" }} /></div></div>;
    })}
  </div>;
};

const Metaphor: React.FC<{ angle: MeetSolomonCampaignAngle; frame: number }> = ({ angle, frame }) => {
  const accent = palette[angle].accent;
  if (angle === "application-triage") return <TriageVisual frame={frame} accent={accent} />;
  if (angle === "company-opportunities") return <CompanyVisual frame={frame} accent={accent} />;
  if (angle === "follow-up-cadence") return <FollowUpVisual frame={frame} accent={accent} />;
  if (angle === "commute-fit") return <CommuteVisual frame={frame} accent={accent} />;
  return <ControlVisual frame={frame} accent={accent} />;
};

const ProofStage: React.FC<{ film: CampaignFilm; proofIds: string[]; frame: number }> = ({ film, proofIds, frame }) => <div style={{ ...abs(86, 485, 908, 900), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
  {proofIds.map((id, index) => <ProductProof key={id} film={film} proofId={id} frame={frame} index={index} compact={proofIds.length > 1} />)}
</div>;

const CTA: React.FC<{ film: CampaignFilm; scene: CampaignFilm["scenes"][number]; frame: number }> = ({ film, scene, frame }) => {
  const colors = palette[film.angle];
  const question = scene.vo.replace(/\s*Join Solomon\.\s*$/, "");
  const enter = spring({ fps: 30, frame, config: { damping: 17, stiffness: 105 } });
  return <>
    <div style={{ ...abs(68, 330, 944), textAlign: "center", opacity: enter, transform: `translateY(${(1 - enter) * 50}px)` }}>
      <div style={{ fontSize: 78, lineHeight: 1.02, fontWeight: 930, letterSpacing: -4.2 }}>{question.toUpperCase()}</div>
      <div id="join-solomon" style={{ margin: "82px auto 0", width: 760, padding: "36px 22px", borderRadius: 30, background: colors.accent, color: "white", fontSize: 104, lineHeight: 1, fontWeight: 950, letterSpacing: -5, boxShadow: `0 25px 60px ${colors.accent}45` }}>JOIN SOLOMON.</div>
      <div style={{ marginTop: 36, fontSize: 27, fontWeight: 750, color: colors.dark }}>You review. You decide. Solomon keeps the work in view.</div>
    </div>
  </>;
};

export const MeetSolomonCampaignFrame: React.FC<{ film: CampaignFilm; frame: number }> = ({ film, frame }) => {
  const scene = film.scenes.find((candidate) => frame >= candidate.from && frame < candidate.to) ?? film.scenes.at(-1)!;
  const local = frame - scene.from;
  const duration = scene.to - scene.from;
  const colors = palette[film.angle];
  const cta = scene.id === "cta";
  const proof = scene.id === "proof-one" || scene.id === "proof-two";
  const sceneIn = spring({ fps: film.fps, frame: local, config: { damping: 18, stiffness: 105 } });
  const progress = frame / Math.max(1, film.durationInFrames - 1);
  return <AbsoluteFill data-campaign-angle={film.angle} data-campaign-scene={scene.id} style={{ background: cta ? colors.soft : IVORY, color: INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(0, 0, 1080, 22), background: "#e2e5de" }}><div style={{ height: "100%", width: `${progress * 100}%`, background: colors.accent }} /></div>
    <div style={{ ...abs(62, 66, 956), display: "flex", justifyContent: "space-between", alignItems: "center" }}><Label>MEET SOLOMON</Label><Label>{film.angle.replaceAll("-", " ").toUpperCase()}</Label></div>
    {!cta && <div id="campaign-headline" style={{ ...abs(66, 150, 948), textAlign: "center", fontSize: scene.headline.length > 42 ? 65 : 78, lineHeight: 1.01, fontWeight: 940, letterSpacing: -4, opacity: sceneIn, transform: `translateY(${(1 - sceneIn) * 38}px)` }}>{scene.headline}</div>}
    {scene.id === "metaphor" && <><Metaphor angle={film.angle} frame={local} /><div style={{ ...abs(62, 1334, 956), textAlign: "center" }}><Label>EDITORIAL ILLUSTRATION</Label></div></>}
    {scene.id === "hook" && <Metaphor angle={film.angle} frame={local + 20} />}
    {proof && <ProofStage film={film} proofIds={scene.proofIds} frame={local} />}
    {scene.id === "payoff" && <div style={{ ...abs(100, 535, 880, 630), display: "grid", placeItems: "center", textAlign: "center", borderRadius: 46, background: colors.dark, color: "white", boxShadow: `0 28px 65px ${colors.dark}3d`, padding: 68, boxSizing: "border-box" }}><div><div style={{ fontSize: 34, fontWeight: 850, color: colors.soft, letterSpacing: 1.4 }}>THE PART THAT MATTERS</div><div style={{ marginTop: 36, fontSize: 65, lineHeight: 1.07, fontWeight: 930, letterSpacing: -3 }}>{scene.vo}</div></div></div>}
    {cta && <CTA film={film} scene={scene} frame={local} />}
    {!cta && scene.id !== "payoff" && <div style={{ ...abs(92, 1485, 896), padding: "23px 30px", boxSizing: "border-box", borderRadius: 24, background: colors.dark, color: "white", textAlign: "center", fontSize: 31, lineHeight: 1.22, fontWeight: 760, boxShadow: "0 18px 36px #14211d24" }}>{scene.vo}</div>}
    {campaignMascotScenes(scene.id) && <MascotCameo film={film} sceneId={scene.id} frame={local} duration={duration} />}
    <div style={{ ...abs(58, 1767, 964), display: "flex", justifyContent: "space-between", color: "#5c6963", fontSize: 18, fontWeight: 800, letterSpacing: 1.05 }}><span>ACTUAL SOLOMON PRODUCT · PRIVATE REVIEW</span><span>{film.capturedLabel}</span></div>
    <div style={{ ...abs(58, 1822, 964), height: 3, background: cta ? colors.accent : "#d7ddd5" }} />
  </AbsoluteFill>;
};

export const MeetSolomonCampaignFilm: React.FC<{ film: CampaignFilm }> = ({ film }) => {
  const frame = useCurrentFrame();
  useVideoConfig();
  return <><MeetSolomonCampaignFrame film={film} frame={frame} /><Audio src={staticFile(film.narrationSrc)} /></>;
};
