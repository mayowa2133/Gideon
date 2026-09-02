import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import type { PeopleCampaignAngle, PeopleCampaignFilm } from "../../shared/meetSolomonPeopleCampaign";
import { v22MascotPerformanceSchema, type V22MascotPerformance } from "../../shared/solomonMascotV22";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const INK = "#12211c";
const PAPER = "#f8f4ec";
const SANS = '"Manrope Variable", Arial, sans-serif';
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });

const palette: Record<PeopleCampaignAngle, { accent: string; soft: string; dark: string; second: string }> = {
  "right-person": { accent: "#f2714f", soft: "#ffe9df", dark: "#291713", second: "#176b50" },
  "who-to-meet": { accent: "#7857df", soft: "#eee9ff", dark: "#1f1738", second: "#ee9a32" },
  "one-company": { accent: "#157f9e", soft: "#e0f5f8", dark: "#102b34", second: "#f1a13b" },
  "first-message": { accent: "#176b50", soft: "#e1f3e9", dark: "#11281f", second: "#f19a34" },
  "keep-warm": { accent: "#ed6555", soft: "#ffe9e5", dark: "#2c1714", second: "#8b5adc" },
};

export const peopleMotionKind = (angle: PeopleCampaignAngle) => ({
  "right-person": "bridge",
  "who-to-meet": "role-orbit",
  "one-company": "three-doors",
  "first-message": "message-builder",
  "keep-warm": "relationship-pulse",
} as const)[angle];

export const peopleMascotScenes = (sceneId: string) => ["hook", "payoff", "cta"].includes(sceneId);

export function peopleMascotPlan(angle: PeopleCampaignAngle, sceneId: string, duration: number): V22MascotPerformance {
  const cta = sceneId === "cta";
  const payoff = sceneId === "payoff";
  return v22MascotPerformanceSchema.parse({
    sceneId: `people-${angle}-${sceneId}`,
    role: cta ? "cameo_right" : "cameo_left",
    narrativePurpose: cta ? "cta" : payoff ? "payoff_reaction" : "attention",
    face: cta ? "direct_cta" : "happy",
    mouthBias: "closed_smile",
    gazePath: [{ frame: 0, target: "camera", x: 0.5, y: 0.42 }, { frame: 16, target: cta ? "cta" : "caption", x: cta ? 0.38 : 0.48, y: cta ? 0.43 : 0.22 }, { frame: Math.max(36, duration - 10), target: "camera", x: 0.5, y: 0.42 }],
    head: { turn: 0, tilt: cta ? -0.08 : 0.08, beats: [18] },
    torso: { lean: 0.16, rotate: cta ? -0.06 : 0.04, recoil: 0.08 },
    left: { gesture: payoff ? "stop_palm" : "presentation_palm", timing: { start: 8, peak: 22, recover: 42, wristRotation: -16 } },
    right: { gesture: cta ? "wave" : "rest_mitt", timing: { start: 11, peak: 26, recover: 46, wristRotation: 18 } },
    blinkFrames: [Math.min(duration - 8, 52)],
    faceAccents: cta ? [{ atFrame: Math.min(duration - 12, 52), face: "wink", holdFrames: 7 }] : [],
    audioFrames: [{ frame: 0, rms: 0, speaking: false, onset: 0, phraseBoundary: false }],
    interactionTarget: { elementId: cta ? "join-solomon" : "people-headline", x: 0.5, y: cta ? 0.46 : 0.2, action: cta ? "present the CTA" : "guide attention" },
  });
}

const Label = ({ children, dark }: { children: ReactNode; dark?: boolean }) => <div style={{ display: "inline-flex", borderRadius: 999, padding: "9px 15px", background: dark ? "#ffffff20" : "#12211c0d", color: dark ? "white" : "#56645e", fontSize: 18, fontWeight: 850, letterSpacing: 1.15 }}>{children}</div>;

const Mascot = ({ film, sceneId, frame, duration }: { film: PeopleCampaignFilm; sceneId: string; frame: number; duration: number }) => {
  const cta = sceneId === "cta";
  const enter = spring({ fps: 30, frame, config: { damping: 17, stiffness: 125 } });
  const scale = cta ? 0.37 : 0.29;
  return <div data-people-mascot={sceneId} style={{ ...abs(cta ? 730 : 806, cta ? 1240 : 1160, cta ? 320 : 245, cta ? 440 : 330), zIndex: 20, overflow: "hidden", background: "transparent", opacity: enter, transform: `translateY(${(1 - enter) * 68}px)` }}><div style={{ width: 660, height: 940, transform: `scale(${scale})`, transformOrigin: "0 0" }}><RobotMascotV22Rig plan={peopleMascotPlan(film.angle, sceneId, duration)} frame={Math.min(frame, 68)} positioning="external" pixelScale={scale} enterOverride={1} mouthless /></div></div>;
};

function proofFor(film: PeopleCampaignFilm, proofId: string) {
  for (const source of film.sources) { const proof = source.proofs.find((item) => item.id === proofId); if (proof) return { source, proof }; }
  return null;
}

const ProductProof = ({ film, proofId, frame, index, compact }: { film: PeopleCampaignFilm; proofId: string; frame: number; index: number; compact: boolean }) => {
  const found = proofFor(film, proofId);
  if (!found) return null;
  const { source, proof } = found;
  const expandX = proof.crop.height < 65 ? 20 : Math.min(50, Math.max(18, Math.round(proof.crop.width * 0.07)));
  const expandY = proof.crop.height < 65 ? 24 : Math.min(55, Math.max(22, Math.round(proof.crop.height * 0.55)));
  const x = Math.max(0, proof.crop.x - expandX);
  const y = Math.max(0, proof.crop.y - expandY);
  const width = Math.min(source.sourceWidth - x, proof.crop.width + expandX * 2);
  const height = Math.min(source.sourceHeight - y, proof.crop.height + expandY * 2);
  const panelWidth = 884;
  const panelHeight = compact ? 225 : 360;
  const scale = Math.min(panelWidth / width, panelHeight / height);
  const reveal = spring({ fps: 30, frame: frame - index * 7, config: { damping: 19, stiffness: 115 } });
  return <div data-people-proof={proofId} style={{ position: "relative", width: panelWidth, height: panelHeight, overflow: "hidden", borderRadius: 29, background: "white", border: "3px solid #d6ddd7", boxShadow: "0 22px 52px #10241b2b", opacity: reveal, transform: `translateY(${(1 - reveal) * 40}px)` }}>
    <Img src={staticFile(source.file)} style={{ position: "absolute", left: (panelWidth - width * scale) / 2 - x * scale, top: (panelHeight - height * scale) / 2 - y * scale, width: source.sourceWidth * scale, height: source.sourceHeight * scale, maxWidth: "none" }} />
    <div style={{ ...abs(16, 15, 220), padding: "8px 12px", borderRadius: 999, background: "#12211ce8", color: "white", fontSize: 16, fontWeight: 900, letterSpacing: 1.1, textAlign: "center" }}>SOLOMON PRODUCT</div>
  </div>;
};

const Person = ({ left, top, color, label, scale = 1 }: { left: number; top: number; color: string; label: string; scale?: number }) => <div style={{ ...abs(left, top, 210 * scale, 260 * scale), textAlign: "center" }}><div style={{ margin: "0 auto", width: 92 * scale, height: 92 * scale, borderRadius: "50%", background: color, border: "9px solid white", boxShadow: "0 10px 26px #14231d26" }} /><div style={{ margin: `${-4 * scale}px auto 0`, width: 150 * scale, height: 112 * scale, borderRadius: `${74 * scale}px ${74 * scale}px ${24 * scale}px ${24 * scale}px`, background: color }} /><div style={{ marginTop: 13, fontSize: 20 * scale, fontWeight: 900 }}>{label}</div></div>;

const Bridge = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => {
  const reach = interpolate(frame, [8, 65], [0, 1], clamp);
  return <div style={{ ...abs(62, 440, 956, 820) }}><Person left={35} top={280} color={second} label="YOU" /><Person left={710} top={280} color={accent} label="RIGHT PERSON" />
    <div style={{ ...abs(240, 355, 505 * reach, 18), borderRadius: 20, background: `linear-gradient(90deg,${second},${accent})` }} />
    {["ROLE", "COMPANY", "CONVERSATION"].map((label, i) => { const e = spring({ fps: 30, frame: frame - 18 - i * 8, config: { damping: 16, stiffness: 130 } }); return <div key={label} style={{ ...abs(282 + i * 160, 304, 142, 70), display: "grid", placeItems: "center", borderRadius: 18, background: "white", border: `3px solid ${accent}`, fontSize: 17, fontWeight: 900, opacity: e, transform: `translateY(${(1 - e) * -35}px)` }}>{label}</div>; })}
    <div style={{ ...abs(246, 610, 470), textAlign: "center", fontSize: 27, fontWeight: 850, color: accent }}>TURN A LISTING INTO A HUMAN PATH</div></div>;
};

const Orbit = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => {
  const roles = [{ label: "RECRUITER", x: 120, y: 200 }, { label: "MANAGER", x: 630, y: 210 }, { label: "PEER", x: 376, y: 610 }];
  const turn = interpolate(frame, [0, 110], [-7, 7], clamp);
  return <div style={{ ...abs(62, 390, 956, 930) }}><div style={{ ...abs(238, 150, 480, 480), borderRadius: "50%", border: `5px dashed ${accent}66`, transform: `rotate(${turn}deg)` }} /><div style={{ ...abs(358, 274, 240, 240), borderRadius: "50%", display: "grid", placeItems: "center", background: INK, color: "white", textAlign: "center", fontSize: 30, lineHeight: 1.05, fontWeight: 950 }}>YOUR<br />GOAL</div>{roles.map((role, i) => { const e = spring({ fps: 30, frame: frame - i * 9, config: { damping: 16, stiffness: 130 } }); return <div key={role.label} style={{ ...abs(role.x, role.y, 210, 100), display: "grid", placeItems: "center", borderRadius: 50, background: i === 1 ? accent : "white", color: i === 1 ? "white" : INK, border: `3px solid ${i === 1 ? accent : second}`, boxShadow: "0 14px 32px #171c2f22", fontSize: 22, fontWeight: 950, opacity: e, transform: `scale(${0.84 + e * 0.16})` }}>{role.label}</div>; })}<div style={{ ...abs(190, 800, 576), textAlign: "center", fontSize: 28, fontWeight: 850 }}>THE BEST CONTACT DEPENDS ON THE QUESTION</div></div>;
};

const Doors = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => <div style={{ ...abs(66, 420, 948, 860) }}><div style={{ ...abs(95, 30, 758, 172), display: "grid", placeItems: "center", borderRadius: "34px 34px 8px 8px", background: INK, color: "white", fontSize: 44, fontWeight: 950 }}>ONE DREAM COMPANY</div><div style={{ ...abs(122, 198, 704, 540), background: "#e5e1d8", border: "5px solid #d2ccc0" }} />{["RECRUITER", "MANAGER", "PEER"].map((label, i) => { const e = spring({ fps: 30, frame: frame - 10 - i * 8, config: { damping: 17, stiffness: 125 } }); return <div key={label} style={{ ...abs(162 + i * 222, 320, 178, 370), borderRadius: "85px 85px 8px 8px", background: i === 1 ? accent : second, color: "white", boxShadow: "inset 0 0 0 7px #ffffff4a", opacity: e, transform: `perspective(500px) rotateY(${(1 - e) * -45}deg)`, transformOrigin: "left center" }}><div style={{ marginTop: 260, textAlign: "center", fontSize: 17, fontWeight: 950 }}>{label}</div><div style={{ position: "absolute", right: 18, top: 182, width: 18, height: 18, borderRadius: "50%", background: "white" }} /></div>; })}<div style={{ ...abs(238, 775, 472), textAlign: "center", fontSize: 30, fontWeight: 900 }}>MORE THAN ONE DOOR IN</div></div>;

const MessageBuilder = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => <div style={{ ...abs(74, 420, 932, 850) }}>{["WHY THEM", "YOUR CONTEXT", "ONE CLEAR ASK"].map((label, i) => { const e = spring({ fps: 30, frame: frame - i * 10, config: { damping: 17, stiffness: 125 } }); return <div key={label} style={{ ...abs(i % 2 ? 270 : 52, 65 + i * 178, 610, 128), display: "flex", alignItems: "center", padding: "0 34px", boxSizing: "border-box", borderRadius: i % 2 ? "34px 34px 10px 34px" : "34px 34px 34px 10px", background: i === 2 ? accent : "white", color: i === 2 ? "white" : INK, border: `3px solid ${i === 2 ? accent : "#d9ddd7"}`, boxShadow: "0 18px 36px #13271e1c", fontSize: 28, fontWeight: 950, opacity: e, transform: `translateX(${(1 - e) * (i % 2 ? 80 : -80)}px)` }}><span style={{ marginRight: 22, color: i === 2 ? "white" : second }}>0{i + 1}</span>{label}</div>; })}<div style={{ ...abs(174, 650, 584, 102), display: "grid", placeItems: "center", borderRadius: 26, background: INK, color: "white", fontSize: 29, fontWeight: 950 }}>DRAFTED. UNSENT. YOUR CALL.</div></div>;

const Pulse = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => {
  const pulse = 1 + Math.sin(frame / 6) * 0.045;
  return <div style={{ ...abs(62, 420, 956, 850) }}><div style={{ ...abs(353, 70, 250, 250), borderRadius: "50%", background: `${accent}22`, display: "grid", placeItems: "center", transform: `scale(${pulse})` }}><div style={{ width: 170, height: 170, borderRadius: "50%", background: accent, display: "grid", placeItems: "center", color: "white", fontSize: 62 }}>♥</div></div><div style={{ ...abs(476, 315, 6, 360), background: `linear-gradient(${accent},${second})` }} />{["MET", "FOLLOW UP", "KEEP WARM"].map((label, i) => { const e = spring({ fps: 30, frame: frame - 14 - i * 10, config: { damping: 16, stiffness: 130 } }); return <div key={label} style={{ ...abs(i % 2 ? 510 : 155, 355 + i * 135, 290, 78), display: "grid", placeItems: "center", borderRadius: 22, background: i === 2 ? second : "white", color: i === 2 ? "white" : INK, border: `3px solid ${i === 2 ? second : accent}`, fontSize: 23, fontWeight: 950, opacity: e, transform: `translateX(${(1 - e) * (i % 2 ? 70 : -70)}px)` }}>{label}</div>; })}</div>;
};

const Metaphor = ({ angle, frame }: { angle: PeopleCampaignAngle; frame: number }) => { const c = palette[angle]; if (angle === "right-person") return <Bridge frame={frame} accent={c.accent} second={c.second} />; if (angle === "who-to-meet") return <Orbit frame={frame} accent={c.accent} second={c.second} />; if (angle === "one-company") return <Doors frame={frame} accent={c.accent} second={c.second} />; if (angle === "first-message") return <MessageBuilder frame={frame} accent={c.accent} second={c.second} />; return <Pulse frame={frame} accent={c.accent} second={c.second} />; };

const CTA = ({ film, vo, frame }: { film: PeopleCampaignFilm; vo: string; frame: number }) => { const c = palette[film.angle]; const question = vo.replace(/\s*Join Solomon\.\s*$/, ""); const enter = spring({ fps: 30, frame, config: { damping: 18, stiffness: 105 } }); return <div style={{ ...abs(66, 330, 948), textAlign: "center", opacity: enter, transform: `translateY(${(1 - enter) * 48}px)` }}><div style={{ fontSize: question.length > 48 ? 70 : 78, lineHeight: 1.02, fontWeight: 950, letterSpacing: -4 }}>{question.toUpperCase()}</div><div id="join-solomon" style={{ margin: "82px auto 0", width: 760, padding: "38px 20px", borderRadius: 30, background: c.accent, color: "white", fontSize: 100, lineHeight: 1, fontWeight: 950, letterSpacing: -5, boxShadow: `0 26px 62px ${c.accent}45` }}>JOIN SOLOMON.</div><div style={{ marginTop: 34, fontSize: 27, fontWeight: 800 }}>You review the person, the message, and every send.</div></div>; };

export const MeetSolomonPeopleCampaignFrame = ({ film, frame }: { film: PeopleCampaignFilm; frame: number }) => {
  const scene = film.scenes.find((item) => frame >= item.from && frame < item.to) ?? film.scenes.at(-1)!;
  const local = frame - scene.from;
  const sceneDuration = scene.to - scene.from;
  const c = palette[film.angle];
  const cta = scene.id === "cta";
  const proofScene = scene.id === "proof-one" || scene.id === "proof-two";
  const enter = spring({ fps: 30, frame: local, config: { damping: 18, stiffness: 105 } });
  const progress = frame / Math.max(1, film.durationInFrames - 1);
  return <AbsoluteFill data-people-angle={film.angle} data-people-scene={scene.id} style={{ background: cta ? c.soft : PAPER, color: INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(0, 0, 1080, 22), background: "#e1e4de" }}><div style={{ width: `${progress * 100}%`, height: "100%", background: c.accent }} /></div>
    <div style={{ ...abs(60, 65, 960), display: "flex", justifyContent: "space-between" }}><Label>MEET SOLOMON</Label><Label>PEOPLE, NOT JUST POSTINGS</Label></div>
    {!cta && <div id="people-headline" style={{ ...abs(62, 150, 956), textAlign: "center", fontSize: scene.headline.length > 41 ? 64 : 76, lineHeight: 1.01, fontWeight: 950, letterSpacing: -4, opacity: enter, transform: `translateY(${(1 - enter) * 36}px)` }}>{scene.headline}</div>}
    {(scene.id === "hook" || scene.id === "metaphor") && <Metaphor angle={film.angle} frame={local + (scene.id === "hook" ? 18 : 0)} />}
    {scene.id === "metaphor" && <div style={{ ...abs(62, 1328, 956), textAlign: "center" }}><Label>EDITORIAL ILLUSTRATION</Label></div>}
    {proofScene && <div style={{ ...abs(86, 480, 908, 910), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>{scene.proofIds.map((id, i) => <ProductProof key={id} film={film} proofId={id} frame={local} index={i} compact={scene.proofIds.length > 1} />)}</div>}
    {scene.id === "payoff" && <div style={{ ...abs(96, 520, 888, 650), display: "grid", placeItems: "center", textAlign: "center", borderRadius: 48, padding: 66, boxSizing: "border-box", background: c.dark, color: "white", boxShadow: `0 28px 65px ${c.dark}3d` }}><div><Label dark>THE HUMAN ADVANTAGE</Label><div style={{ marginTop: 38, fontSize: 65, lineHeight: 1.07, fontWeight: 940, letterSpacing: -3 }}>{scene.vo}</div></div></div>}
    {cta && <CTA film={film} vo={scene.vo} frame={local} />}
    {!cta && scene.id !== "payoff" && <div style={{ ...abs(90, 1482, 900), padding: "23px 30px", boxSizing: "border-box", borderRadius: 24, background: c.dark, color: "white", textAlign: "center", fontSize: 31, lineHeight: 1.22, fontWeight: 780, boxShadow: "0 18px 36px #14211d24" }}>{scene.vo}</div>}
    {peopleMascotScenes(scene.id) && <Mascot film={film} sceneId={scene.id} frame={local} duration={sceneDuration} />}
    <div style={{ ...abs(55, 1765, 970), display: "flex", justifyContent: "space-between", color: "#596760", fontSize: 15, fontWeight: 850, letterSpacing: 0.7 }}><span>PUBLIC PROFESSIONAL DATA · VERIFY BEFORE OUTREACH</span><span>{film.capturedLabel}</span></div>
    <div style={{ ...abs(55, 1822, 970), height: 3, background: cta ? c.accent : "#d7ddd5" }} />
  </AbsoluteFill>;
};

export const MeetSolomonPeopleCampaignFilm = ({ film }: { film: PeopleCampaignFilm }) => <><MeetSolomonPeopleCampaignFrame film={film} frame={useCurrentFrame()} /><Audio src={staticFile(film.narrationSrc)} /></>;
