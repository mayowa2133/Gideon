import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import type { PeopleCampaignV2Angle, PeopleCampaignV2Film } from "../../shared/meetSolomonPeopleCampaignV2";
import { v22MascotPerformanceSchema, type V22MascotPerformance } from "../../shared/solomonMascotV22";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const INK = "#0d1713";
const PAPER = "#f7f3ea";
const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const abs = (left: number, top: number, width?: number, height?: number) => ({ position: "absolute" as const, left, top, width, height });

const palette: Record<PeopleCampaignV2Angle, { accent: string; second: string; soft: string; dark: string }> = {
  "job-to-people": { accent: "#45a982", second: "#6453d7", soft: "#e7f6ef", dark: "#10251d" },
  "wrong-contact": { accent: "#e86a4b", second: "#f0ad3d", soft: "#fff0e9", dark: "#291713" },
  "changed-jobs": { accent: "#7c5ce4", second: "#34a980", soft: "#efeaff", dark: "#201936" },
};

export const peopleV2MotionKind = (angle: PeopleCampaignV2Angle) => ({
  "job-to-people": "role-to-human-map",
  "wrong-contact": "evidence-scanner",
  "changed-jobs": "source-conflict-timeline",
} as const)[angle];

export const peopleV2MascotScenes = (sceneId: string) => ["hook", "takeaway", "cta"].includes(sceneId);

export function peopleV2MascotPlan(angle: PeopleCampaignV2Angle, sceneId: string, duration: number): V22MascotPerformance {
  const cta = sceneId === "cta";
  const warning = angle !== "job-to-people" && sceneId !== "cta";
  return v22MascotPerformanceSchema.parse({
    sceneId: `people-v2-${angle}-${sceneId}`,
    role: cta ? "cameo_right" : "cameo_left",
    narrativePurpose: cta ? "cta" : warning ? "interpretation" : "attention",
    face: cta ? "direct_cta" : warning ? "concerned" : "happy",
    mouthBias: "closed_smile",
    gazePath: [{ frame: 0, target: "camera", x: .5, y: .42 }, { frame: 14, target: cta ? "cta" : "product", x: cta ? .38 : .55, y: cta ? .43 : .35 }, { frame: Math.max(36, duration - 10), target: "camera", x: .5, y: .42 }],
    head: { turn: 0, tilt: warning ? -.09 : .07, beats: [16, 42] },
    torso: { lean: .14, rotate: cta ? -.05 : .04, recoil: warning ? .12 : .06 },
    left: { gesture: warning ? "stop_palm" : "presentation_palm", timing: { start: 7, peak: 21, recover: 43, wristRotation: -14 } },
    right: { gesture: cta ? "wave" : "rest_mitt", timing: { start: 11, peak: 25, recover: 47, wristRotation: 16 } },
    blinkFrames: [Math.min(duration - 8, 54)],
    faceAccents: cta ? [{ atFrame: Math.min(duration - 12, 56), face: "wink", holdFrames: 7 }] : [],
    audioFrames: [{ frame: 0, rms: 0, speaking: false, onset: 0, phraseBoundary: false }],
    interactionTarget: { elementId: cta ? "join-solomon-v2" : "people-v2-headline", x: .5, y: cta ? .46 : .18, action: cta ? "present the CTA" : "guide attention" },
  });
}

const Pill = ({ children, dark, tone }: { children: ReactNode; dark?: boolean; tone?: "good" | "warn" }) => {
  const background = tone === "good" ? "#dff6eb" : tone === "warn" ? "#ffe8df" : dark ? "#ffffff1d" : "#1021180b";
  const color = tone === "good" ? "#176b50" : tone === "warn" ? "#b33e25" : dark ? "white" : "#58655f";
  return <div style={{ display: "inline-flex", borderRadius: 999, padding: "9px 15px", background, color, fontSize: 17, fontWeight: 900, letterSpacing: 1 }}>{children}</div>;
};

const Mascot = ({ film, sceneId, frame, duration }: { film: PeopleCampaignV2Film; sceneId: string; frame: number; duration: number }) => {
  const cta = sceneId === "cta";
  const enter = spring({ fps: 30, frame, config: { damping: 18, stiffness: 120 } });
  const scale = cta ? .36 : .27;
  return <div style={{ ...abs(cta ? 738 : 816, cta ? 1248 : 1205, cta ? 310 : 230, cta ? 430 : 315), zIndex: 20, overflow: "hidden", opacity: enter, transform: `translateY(${(1 - enter) * 46}px)` }}>
    <div style={{ width: 660, height: 940, transform: `scale(${scale})`, transformOrigin: "0 0" }}><RobotMascotV22Rig plan={peopleV2MascotPlan(film.angle, sceneId, duration)} frame={Math.min(frame, 72)} positioning="external" pixelScale={scale} enterOverride={1} mouthless /></div>
  </div>;
};

function proofFor(film: PeopleCampaignV2Film, proofId: string) {
  for (const source of film.sources) {
    const proof = source.proofs.find((candidate) => candidate.id === proofId);
    if (proof) return { source, proof };
  }
  return null;
}

const ProductProof = ({ film, proofId, frame, index, height }: { film: PeopleCampaignV2Film; proofId: string; frame: number; index: number; height: number }) => {
  const found = proofFor(film, proofId);
  if (!found) return null;
  const { source, proof } = found;
  const padX = Math.min(34, Math.max(14, Math.round(proof.crop.width * .04)));
  const padY = Math.min(28, Math.max(12, Math.round(proof.crop.height * .16)));
  const x = Math.max(0, proof.crop.x - padX);
  const y = Math.max(0, proof.crop.y - padY);
  const width = Math.min(source.sourceWidth - x, proof.crop.width + padX * 2);
  const cropHeight = Math.min(source.sourceHeight - y, proof.crop.height + padY * 2);
  const panelWidth = 884;
  const scale = Math.min(panelWidth / width, height / cropHeight);
  const reveal = spring({ fps: 30, frame: frame - index * 8, config: { damping: 20, stiffness: 115 } });
  const label = source.evidenceKind === "actual-product" ? "ACTUAL SOLOMON PRODUCT" : "PUBLIC SOURCE CHECK";
  return <div data-v2-proof={proofId} style={{ position: "relative", width: panelWidth, height, overflow: "hidden", borderRadius: 30, background: "#151815", border: "3px solid #cfd7d1", boxShadow: "0 22px 56px #1320192a", opacity: reveal, transform: `translateY(${(1 - reveal) * 36}px)` }}>
    <div style={{ position: "absolute", left: (panelWidth - width * scale) / 2, top: (height - cropHeight * scale) / 2, width: width * scale, height: cropHeight * scale, overflow: "hidden" }}>
      <Img src={staticFile(source.file)} style={{ position: "absolute", left: -x * scale, top: -y * scale, width: source.sourceWidth * scale, height: source.sourceHeight * scale, maxWidth: "none" }} />
    </div>
    <div style={{ ...abs(15, 14), padding: "8px 13px", borderRadius: 999, background: source.evidenceKind === "actual-product" ? "#10211dea" : "#3c2c76ed", color: "white", fontSize: 15, fontWeight: 950, letterSpacing: 1.1 }}>{label}</div>
  </div>;
};

const RoleToPeople = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => {
  const line = interpolate(frame, [8, 58], [0, 1], clamp);
  const people = [{ label: "RECRUITER", sub: "PROCESS" }, { label: "MANAGER", sub: "TEAM" }, { label: "PEER", sub: "DAY TO DAY" }];
  return <div style={{ ...abs(74, 420, 932, 860) }}><div style={{ margin: "0 auto", width: 650, padding: "28px 38px", borderRadius: 28, background: INK, color: "white", textAlign: "center", fontSize: 30, fontWeight: 950 }}>SOFTWARE ENGINEER INTERN</div><div style={{ margin: "0 auto", width: 8, height: 170 * line, background: `linear-gradient(${accent},${second})` }} /><div style={{ display: "flex", justifyContent: "space-between" }}>{people.map((person, index) => { const enter = spring({ fps: 30, frame: frame - 16 - index * 8, config: { damping: 17, stiffness: 120 } }); return <div key={person.label} style={{ width: 278, height: 235, borderRadius: 32, background: index === 1 ? second : "white", color: index === 1 ? "white" : INK, border: `3px solid ${index === 1 ? second : accent}`, display: "grid", placeItems: "center", textAlign: "center", opacity: enter, transform: `scale(${.82 + enter * .18})`, boxShadow: "0 18px 38px #11221920" }}><div><div style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto 17px", background: index === 1 ? "white" : accent }} /><div style={{ fontSize: 24, fontWeight: 950 }}>{person.label}</div><div style={{ marginTop: 8, fontSize: 17, fontWeight: 850, opacity: .72 }}>{person.sub}</div></div></div>; })}</div></div>;
};

const EvidenceScanner = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => {
  const scan = interpolate(frame % 90, [0, 70], [20, 670], clamp);
  const checks = [{ label: "TITLE", ok: true }, { label: "COMPANY", ok: false }, { label: "SOURCE", ok: false }, { label: "RELEVANCE", ok: true }];
  return <div style={{ ...abs(90, 430, 900, 850), borderRadius: 44, padding: 48, boxSizing: "border-box", background: "#171c19", color: "white", overflow: "hidden" }}><div style={{ fontSize: 23, fontWeight: 900, letterSpacing: 2 }}>CONTACT CHECK</div><div style={{ marginTop: 34, display: "grid", gap: 20 }}>{checks.map((check, index) => { const enter = spring({ fps: 30, frame: frame - 8 - index * 7, config: { damping: 18, stiffness: 125 } }); return <div key={check.label} style={{ height: 104, borderRadius: 24, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff0d", border: "2px solid #ffffff18", opacity: enter }}><span style={{ fontSize: 27, fontWeight: 900 }}>{check.label}</span><span style={{ fontSize: 22, fontWeight: 950, color: check.ok ? "#65d5a9" : second }}>{check.ok ? "USEFUL SIGNAL" : "CHECK AGAIN"}</span></div>; })}</div><div style={{ ...abs(0, scan, 900, 4), background: accent, boxShadow: `0 0 30px ${accent}` }} /></div>;
};

const SignalAxes = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => {
  const signals = [
    ["TITLE MATCH", "START HERE"],
    ["COMPANY CHECK", "VERIFY"],
    ["EMAIL SAFETY", "PROTECT"],
    ["WARM PATH", "CONTEXT"],
  ];
  return <div style={{ ...abs(86, 470, 908, 790), display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignContent: "center" }}>{signals.map(([label, action], index) => { const enter = spring({ fps: 30, frame: frame - index * 7, config: { damping: 18, stiffness: 120 } }); return <div key={label} style={{ height: 245, borderRadius: 34, padding: 34, boxSizing: "border-box", background: index === 0 ? second : "white", color: index === 0 ? "white" : INK, border: `3px solid ${index === 0 ? second : accent}`, opacity: enter, transform: `translateY(${(1 - enter) * 26}px)`, boxShadow: "0 17px 36px #17231d17" }}><div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1.4, opacity: .72 }}>{String(index + 1).padStart(2, "0")}</div><div style={{ marginTop: 38, fontSize: 34, lineHeight: 1, fontWeight: 950 }}>{label}</div><div style={{ marginTop: 22, fontSize: 20, fontWeight: 900, color: index === 0 ? "white" : second }}>{action}</div></div>; })}</div>;
};

const SourceChecklist = ({ frame, accent }: { frame: number; accent: string }) => {
  const steps = ["OPEN THE NAMED SOURCE", "CHECK WHEN IT WAS UPDATED", "CONFIRM THE CURRENT COMPANY"];
  return <div style={{ position: "relative", width: 884, height: 650, borderRadius: 44, padding: 48, boxSizing: "border-box", background: "#171c19", color: "white", boxShadow: "0 28px 64px #171c1940" }}><Pill dark>PUBLIC SOURCE CHECK</Pill><div style={{ marginTop: 34, display: "grid", gap: 20 }}>{steps.map((step, index) => { const enter = spring({ fps: 30, frame: frame - index * 10, config: { damping: 18, stiffness: 118 } }); return <div key={step} style={{ height: 118, borderRadius: 26, padding: "0 28px", display: "flex", alignItems: "center", gap: 24, background: "#ffffff0c", border: "2px solid #ffffff18", opacity: enter, transform: `translateX(${(1 - enter) * 34}px)` }}><div style={{ width: 51, height: 51, flex: "0 0 auto", borderRadius: "50%", background: accent, display: "grid", placeItems: "center", fontSize: 23, fontWeight: 950 }}>{index + 1}</div><div style={{ fontSize: 25, fontWeight: 900 }}>{step}</div></div>; })}</div></div>;
};

const ChangedTimeline = ({ frame, accent, second }: { frame: number; accent: string; second: string }) => {
  const reveal = interpolate(frame, [8, 65], [0, 1], clamp);
  return <div style={{ ...abs(90, 460, 900, 760) }}><div style={{ ...abs(90, 260, 720 * reveal, 8), borderRadius: 10, background: `linear-gradient(90deg,${accent},${second})` }} /><div style={{ ...abs(0, 145, 370, 270), borderRadius: 36, background: "white", border: `3px solid ${accent}`, padding: 35, boxSizing: "border-box" }}><Pill tone="warn">OLD PRODUCT BADGE</Pill><div style={{ marginTop: 38, fontSize: 39, lineHeight: 1.05, fontWeight: 950 }}>SHOPIFY</div><div style={{ marginTop: 20, fontSize: 23, color: "#69736e" }}>Said “verified”</div></div><div style={{ ...abs(530, 145, 370, 270), borderRadius: 36, background: second, color: "white", padding: 35, boxSizing: "border-box" }}><Pill dark>FRESH PUBLIC SOURCE</Pill><div style={{ marginTop: 38, fontSize: 39, lineHeight: 1.05, fontWeight: 950 }}>SAMSARA</div><div style={{ marginTop: 20, fontSize: 23, opacity: .82 }}>Recent profile update</div></div><div style={{ ...abs(120, 520, 660), textAlign: "center", fontSize: 34, lineHeight: 1.15, fontWeight: 900 }}>THE SOURCE CHANGED.<br />THE BADGE DIDN’T.</div></div>;
};

const Concept = ({ film, frame }: { film: PeopleCampaignV2Film; frame: number }) => {
  const colors = palette[film.angle];
  if (film.angle === "job-to-people") return <RoleToPeople frame={frame} accent={colors.accent} second={colors.second} />;
  if (film.angle === "wrong-contact") return <EvidenceScanner frame={frame} accent={colors.accent} second={colors.second} />;
  return <ChangedTimeline frame={frame} accent={colors.accent} second={colors.second} />;
};

const EvidenceSummary = ({ film, frame, embedded = false }: { film: PeopleCampaignV2Film; frame: number; embedded?: boolean }) => {
  const colors = palette[film.angle];
  const entries = film.angle === "job-to-people" ? film.publicEvidence.filter((item) => ["recruiter", "manager", "peer"].includes(item.purpose)) : film.publicEvidence;
  const layout = embedded ? { position: "relative" as const, width: 884 } : abs(74, 470, 932, 850);
  return <div style={{ ...layout, display: "grid", gap: 22, alignContent: "center" }}>{entries.slice(0, 3).map((entry, index) => {
    const enter = spring({ fps: 30, frame: frame - index * 8, config: { damping: 18, stiffness: 116 } });
    const bad = entry.productStatus === "contradicted" || entry.productStatus === "verification-skipped";
    const status = entry.productStatus === "contradicted" ? "SOURCE CONFLICT" : entry.productStatus === "verification-skipped" ? "VERIFICATION SKIPPED" : entry.purpose.replace("-", " ").toUpperCase();
    return <div key={`${entry.subject}-${entry.purpose}`} style={{ minHeight: embedded ? 258 : 172, borderRadius: 30, background: "white", border: `3px solid ${bad ? "#ef9c84" : "#c8ddd4"}`, padding: embedded ? "38px 40px" : "26px 30px", boxSizing: "border-box", opacity: enter, transform: `translateX(${(1 - enter) * (index % 2 ? 45 : -45)}px)`, boxShadow: "0 17px 36px #17231d17" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}><div><div style={{ fontSize: embedded ? 37 : 29, fontWeight: 950 }}>{entry.subject}</div><div style={{ marginTop: 7, fontSize: embedded ? 25 : 21, color: "#64716b" }}>{entry.role} · {entry.company}</div></div><Pill tone={bad ? "warn" : "good"}>{status}</Pill></div><div style={{ marginTop: embedded ? 28 : 18, fontSize: embedded ? 25 : 20, lineHeight: 1.25, color: bad ? "#9e3a27" : colors.dark }}>{entry.sourceSummary}</div></div>;
  })}</div>;
};

const PhraseCaption = ({ phrases, frame, duration }: { phrases: string[]; frame: number; duration: number }) => {
  const index = Math.min(phrases.length - 1, Math.floor((frame / Math.max(1, duration)) * phrases.length));
  const phaseFrame = frame - Math.floor(index * duration / phrases.length);
  const enter = spring({ fps: 30, frame: Math.max(0, phaseFrame), config: { damping: 20, stiffness: 125 } });
  return <div style={{ ...abs(92, 1478, 896), minHeight: 112, padding: "22px 30px", boxSizing: "border-box", borderRadius: 25, background: "#0e1814f2", color: "white", display: "grid", placeItems: "center", textAlign: "center", fontSize: 34, lineHeight: 1.15, fontWeight: 850, boxShadow: "0 18px 40px #111d182e" }}><span style={{ opacity: enter, transform: `translateY(${(1 - enter) * 15}px)` }}>{phrases[index]}</span></div>;
};

const CTA = ({ film, frame }: { film: PeopleCampaignV2Film; frame: number }) => {
  const colors = palette[film.angle];
  const question = film.scenes.at(-1)!.vo.replace(/\s*Join Solomon\.\s*$/, "");
  const enter = spring({ fps: 30, frame, config: { damping: 19, stiffness: 105 } });
  return <div style={{ ...abs(62, 300, 956), textAlign: "center", opacity: enter, transform: `translateY(${(1 - enter) * 42}px)` }}><Pill>YOUR NEXT MOVE</Pill><div style={{ marginTop: 56, fontSize: question.length > 54 ? 63 : 72, lineHeight: 1.03, fontWeight: 950, letterSpacing: -3.5 }}>{question.toUpperCase()}</div><div id="join-solomon-v2" style={{ margin: "76px auto 0", width: 790, padding: "40px 18px", borderRadius: 32, background: colors.accent, color: "white", fontSize: 96, lineHeight: 1, fontWeight: 950, letterSpacing: -5, boxShadow: `0 26px 66px ${colors.accent}4a` }}>JOIN SOLOMON.</div><div style={{ marginTop: 32, fontSize: 25, fontWeight: 800 }}>You inspect the evidence and decide every outreach step.</div></div>;
};

export const MeetSolomonPeopleCampaignV2Frame = ({ film, frame }: { film: PeopleCampaignV2Film; frame: number }) => {
  const scene = film.scenes.find((candidate) => frame >= candidate.from && frame < candidate.to) ?? film.scenes.at(-1)!;
  const local = frame - scene.from;
  const duration = scene.to - scene.from;
  const colors = palette[film.angle];
  const cta = scene.id === "cta";
  const proof = scene.id === "proof-a" || scene.id === "proof-b";
  const enter = spring({ fps: 30, frame: local, config: { damping: 19, stiffness: 108 } });
  const progress = frame / Math.max(1, film.durationInFrames - 1);
  return <AbsoluteFill data-people-v2-angle={film.angle} data-people-v2-scene={scene.id} style={{ background: cta ? colors.soft : PAPER, color: INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(0, 0, 1080, 18), background: "#dfe4de" }}><div style={{ width: `${progress * 100}%`, height: "100%", background: colors.accent }} /></div>
    <div style={{ ...abs(58, 62, 964), display: "flex", justifyContent: "space-between" }}><Pill>MEET SOLOMON</Pill><Pill>{film.angle === "job-to-people" ? "ONE ROLE · THREE PATHS" : film.angle === "wrong-contact" ? "PROOF BEFORE OUTREACH" : "FRESH SOURCES MATTER"}</Pill></div>
    {!cta && <div id="people-v2-headline" style={{ ...abs(60, 150, 960), textAlign: "center", fontSize: scene.headline.length > 44 ? 59 : 70, lineHeight: 1.02, fontWeight: 950, letterSpacing: -3.5, opacity: enter, transform: `translateY(${(1 - enter) * 28}px)` }}>{scene.headline}</div>}
    {scene.id === "hook" && <div style={{ ...abs(100, 435, 880, 660), display: "grid", placeItems: "center" }}><div style={{ width: 600, height: 600, borderRadius: "50%", border: `5px solid ${colors.accent}33`, transform: `scale(${.75 + enter * .25})`, display: "grid", placeItems: "center" }}><div style={{ width: 430, height: 430, borderRadius: "50%", background: colors.dark, color: "white", display: "grid", placeItems: "center", textAlign: "center", padding: 46, boxSizing: "border-box", fontSize: 48, lineHeight: 1.02, fontWeight: 950 }}>{film.angle === "job-to-people" ? "ONE LIVE ROLE" : film.angle === "wrong-contact" ? "A NAME ISN’T PROOF" : "PROFILES CHANGE"}</div></div></div>}
    {scene.id === "role" && (scene.proofIds.length ? <div style={{ ...abs(98, 470, 884), display: "grid", placeItems: "center" }}>{scene.proofIds.map((id, index) => <ProductProof key={id} film={film} proofId={id} frame={local} index={index} height={520} />)}</div> : film.angle === "wrong-contact" ? <SignalAxes frame={local} accent={colors.accent} second={colors.second} /> : <EvidenceSummary film={film} frame={local} />)}
    {scene.id === "map" && <><Concept film={film} frame={local} /><div style={{ ...abs(60, 1328, 960), textAlign: "center" }}><Pill>EDITORIAL EXPLANATION</Pill></div></>}
    {proof && <div style={{ ...abs(98, 440, 884, 900), display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 24 }}>{scene.proofIds.map((id, index) => <ProductProof key={id} film={film} proofId={id} frame={local} index={index} height={scene.proofIds.length > 1 ? 340 : 720} />)}{scene.proofIds.length === 0 && (film.angle === "changed-jobs" && scene.id === "proof-b" ? <SourceChecklist frame={local} accent={colors.accent} /> : <EvidenceSummary film={film} frame={local} embedded />)}</div>}
    {scene.id === "takeaway" && <div style={{ ...abs(95, 500, 890, 670), borderRadius: 48, padding: 62, boxSizing: "border-box", background: colors.dark, color: "white", display: "grid", placeItems: "center", textAlign: "center", boxShadow: `0 30px 70px ${colors.dark}44` }}><div><Pill dark>{film.angle === "changed-jobs" ? "THE HONEST RESULT" : "THE USEFUL RESULT"}</Pill><div style={{ marginTop: 42, fontSize: 60, lineHeight: 1.08, fontWeight: 940, letterSpacing: -2.5 }}>{scene.vo}</div></div></div>}
    {cta && <CTA film={film} frame={local} />}
    {!cta && scene.id !== "takeaway" && <PhraseCaption phrases={scene.captionPhrases} frame={local} duration={duration} />}
    {peopleV2MascotScenes(scene.id) && <Mascot film={film} sceneId={scene.id} frame={local} duration={duration} />}
    <div style={{ ...abs(52, 1762, 976), display: "flex", justifyContent: "space-between", gap: 24, color: "#5c6862", fontSize: 14, fontWeight: 850, letterSpacing: .6 }}><span>{film.evidenceDisclosure}</span><span>{film.capturedLabel}</span></div>
    <div style={{ ...abs(52, 1820, 976), height: 3, background: cta ? colors.accent : "#d5dcd5" }} />
  </AbsoluteFill>;
};

export const MeetSolomonPeopleCampaignV2Film = ({ film }: { film: PeopleCampaignV2Film }) => <><MeetSolomonPeopleCampaignV2Frame film={film} frame={useCurrentFrame()} /><Audio src={staticFile(film.narrationSrc)} /></>;
