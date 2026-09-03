import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, Easing, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import { asV2Scene, isMotionLedRealInternship, realCta, realOpportunityMotionProfile, type MeetFilm, type MeetScene } from "../../shared/meetSolomonRealInternships";
import { InternshipProof } from "../meetSolomonInternships/MeetSolomonInternshipsFilm";
import { presenterPlanV2 } from "../meetSolomonV2/MeetSolomonFilmV2";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const COLORS = { ivory: "#f4efe5", clay: "#cd7862", charcoal: "#171b1a", sage: "#d8dfce" };
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const serif = '"Fraunces Variable", Georgia, serif';
const tile: CSSProperties = { padding: 28, boxSizing: "border-box", border: "2px solid #aabcae", borderRadius: 20, background: "#fffdf6", color: "#182320", fontSize: 54, fontWeight: 800, textAlign: "center" };
const enter = (frame: number, delay = 0) => spring({ frame: frame - delay, fps: 30, config: { damping: 15, stiffness: 150, mass: .75 } });
const rise = (frame: number, delay = 0) => ({ opacity: enter(frame, delay), transform: `translateY(${interpolate(enter(frame, delay), [0, 1], [95, 0])}px) scale(${interpolate(enter(frame, delay), [0, 1], [.9, 1])})` });

function MotionField({ frame, dark, accent, settled }: { frame: number; dark: boolean; accent: string; settled: boolean }) {
  const calmFrame = settled ? Math.min(frame, 18) : frame;
  return <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: dark ? .16 : .22 }}>
    <div style={{ ...abs(settled ? -340 + calmFrame * 4 : -280 + (frame * 2.8) % 260, settled ? 520 : 490 + Math.sin(frame / 10) * 55, 620, 620), borderRadius: "50%", border: `7px solid ${accent}` }} />
    <div style={{ ...abs(settled ? 790 - calmFrame * 3 : 730 + Math.cos(frame / 10) * 90, settled ? 1080 : 1040 + Math.sin(frame / 9) * 70, 460, 460), borderRadius: 70, background: accent, transform: `rotate(${settled ? 8 : frame * .75}deg)` }} />
    {!settled && <div style={{ ...abs(-200 + (frame * 5) % 1480, 1540, 330, 16), borderRadius: 20, background: accent }} />}
    {[0, 1, 2].map(i => <div key={i} style={{ ...abs(70 + i * 335 + (settled ? 0 : Math.sin((frame + i * 15) / 7) * 34), 1640 + i * 42, 245, 7), background: accent }} />)}
  </div>;
}

function Cta({ category, local, motion, settled }: { category: MeetFilm["category"]; local: number; motion: boolean; settled: boolean }) {
  const firstJob = category === "new_grad";
  const careerMove = category === "career_switcher";
  const styles = (delay: number): CSSProperties => motion && !settled ? { opacity: 1, transform: `translateY(${Math.sin((local + delay) / 6) * 8}px) scale(${1 + Math.sin((local + delay) / 9) * .012})` } : {};
  return <div data-real-cta={realCta(category)}>
    <div style={{ ...abs(65, 220, 950), textAlign: "center", fontSize: 31, letterSpacing: 3, ...styles(0) }}>{firstJob ? "YOUR FIRST MOVE" : careerMove ? "YOUR NEXT MOVE" : "YOUR NEXT STEP"}</div>
    <div style={{ ...abs(65, 335, 950), textAlign: "center", fontWeight: 800, fontSize: 92, lineHeight: 1.08, letterSpacing: -4, ...styles(4) }}>{firstJob ? <>Start your first<br />job search.</> : careerMove ? <>Make your next<br />career move.</> : <>Find your next<br />{category === "law" ? "legal" : category}<br />internship.</>}</div>
    <div style={{ ...abs(65, firstJob || careerMove ? 650 : 725, 950), textAlign: "center", fontFamily: serif, fontStyle: "italic", fontSize: 64, ...styles(9) }}>with</div>
    <div style={{ ...abs(65, firstJob || careerMove ? 765 : 830, 950), textAlign: "center", fontWeight: 800, fontSize: 148, color: "#176b50", letterSpacing: -6, ...styles(13) }}>Solomon.</div>
  </div>;
}

function Art({ scene, category, benefitLed, motion, settled, local }: { scene: MeetScene; category: MeetFilm["category"]; benefitLed: boolean; motion: boolean; settled: boolean; local: number }) {
  const words = category === "finance" ? ["AUDIT", "ANALYSIS"] : category === "software" ? ["CODE", "BUILD"] : category === "law" ? ["LEGAL OPS", "DATA"] : category === "career_switcher" ? ["CUSTOMER SKILLS", "NEW DIRECTION"] : ["FIRST ROLE", "REAL OPENING"];
  const motionTile: CSSProperties = motion ? { boxShadow: "0 22px 48px #14231c1c" } : {};
  if (scene.layout === "hook") return <>{words.map((word, i) => <div key={word} style={{ ...abs(120 + i * 100, 650 + i * 155, 740, 135), ...tile, ...motionTile, ...(motion ? rise(local, i * 5) : {}), transform: `${motion ? rise(local, i * 5).transform : ""} rotate(${i ? 3 : -3}deg)` }}>{word}</div>)}<div style={{ ...abs(65, 1010, 950), textAlign: "center", fontSize: 24, ...(motion ? rise(local, 12) : {}) }}>ILLUSTRATION · {motion ? "YOUR JOB SEARCH" : "YOUR INTERNSHIP SEARCH"}</div></>;
  if (scene.layout === "requirements" || scene.layout === "fit") return <>{(category === "new_grad" || category === "career_switcher" ? scene.layout === "requirements" ? ["FOCUSED FEED", "YOUR DIRECTION"] : ["ONE OPPORTUNITY", "CLEAR STAGES"] : benefitLed ? scene.layout === "requirements" ? ["TAILOR TO THE ROLE", "KEEP YOUR EVIDENCE TRUE"] : ["RESUME", "APPLICATION CHECKLIST"] : scene.layout === "requirements" ? ["READ THE DESCRIPTION", "CHECK THE REQUIREMENTS"] : ["YOUR SKILLS", "YOUR AVAILABILITY"]).map((word, i) => <div key={word} style={{ ...abs(90, 620 + i * 230, 900, 170), ...tile, ...motionTile, display: "flex", alignItems: "center", justifyContent: "center", ...(motion ? rise(local, i * 6) : {}) }}>{word}</div>)}{!benefitLed && <div style={{ ...abs(65, 1135, 950), textAlign: "center", fontSize: 24 }}>ILLUSTRATION · YOU DECIDE WHETHER TO APPLY</div>}</>;
  if (scene.layout === "reset") return <div style={{ ...abs(90, 660, 900, 180), ...tile, ...motionTile, ...(motion ? rise(local) : {}) }}>{category === "new_grad" ? "ONE SEARCH. ONE WORKSPACE." : category === "career_switcher" ? "YOUR EXPERIENCE STILL COUNTS." : "LOOK BEYOND THE TITLE."}</div>;
  if (scene.layout === "caveat") return <div style={{ ...abs(90, 650, 900, 230), ...tile, ...motionTile, fontSize: 64, ...(motion ? rise(local) : {}) }}>{benefitLed ? <>Open the employer link.<br />Confirm before applying.</> : <>Listings can change.<br />Check before applying.</>}</div>;
  if (scene.layout === "cta") return <Cta category={category} local={local} motion={motion} settled={settled} />;
  return null;
}

export const MeetSolomonRealFrame: React.FC<{ film: MeetFilm; frame: number }> = ({ film, frame }) => {
  const matchedScene = film.scenes.findIndex(s => frame >= s.from && frame < s.to);
  const sceneIndex = matchedScene < 0 ? film.scenes.length - 1 : matchedScene;
  const scene = film.scenes[sceneIndex] ?? film.scenes.at(-1)!;
  const local = frame - scene.from, dark = scene.background === "charcoal", motion = isMotionLedRealInternship(film.version);
  const settled = realOpportunityMotionProfile(film.version) === "settled";
  const benefitLed = film.version !== "meet-solomon-real-internships-v1";
  const phrase = scene.phrases.find(p => frame >= p.from && frame < p.to);
  const phraseFrame = phrase ? frame - phrase.from : local;
  const editorial = motion && ["meet", "reset", "caveat"].includes(scene.layout);
  const accent = film.category === "finance" ? "#d7a333" : film.category === "software" ? "#73a8d8" : film.category === "law" ? "#b495ce" : film.category === "career_switcher" ? "#ef9c66" : "#61b997";
  const categoryLabel = film.category === "law" ? "LEGAL OPERATIONS INTERNSHIPS" : film.category === "new_grad" ? "NEW GRAD JOBS" : film.category === "career_switcher" ? "CAREER SWITCHERS" : `${film.category.toUpperCase()} INTERNSHIPS`;
  return <AbsoluteFill style={{ background: COLORS[scene.background], color: dark ? "#f4efe5" : "#182320", fontFamily: '"Manrope Variable", Arial, sans-serif', overflow: "hidden" }}>
    {motion && <MotionField frame={local + (settled ? 0 : sceneIndex * 17)} dark={dark} accent={accent} settled={settled} />}
    <div style={{ ...abs(65, 78, 950), zIndex: 7, display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 800, letterSpacing: 1 }}><span>MEET SOLOMON</span><span>{categoryLabel}</span></div>
    <div style={{ ...abs(65, 124, 950), zIndex: 7, fontSize: 21, opacity: .72 }}>REAL LISTING · CHECKED {film.listing.verifiedAt.slice(0, 10)}</div>
    <div style={{ position: "absolute", inset: 0, ...(motion ? { zIndex: 1, transform: settled ? undefined : `translateY(${Math.sin(local / 5) * 13}px) scale(${1 + Math.sin(local / 11) * .008})` } : {}) }}><Art scene={scene} category={film.category} benefitLed={benefitLed} motion={motion} settled={settled} local={local} /></div>
    {scene.proofs.map((p, i) => {
      const proofEnter = motion ? enter(local, i * 5) : 1;
      const proofTransform = settled ? `translateY(${(1 - proofEnter) * 92}px) scale(${.94 + proofEnter * .06}) rotate(${(i - (scene.proofs.length - 1) / 2) * 1.1}deg)` : `translate(${Math.sin((local + i * 9) / 7) * 12}px, ${(1 - proofEnter) * 120 + Math.sin((local + i * 8) / 5) * 20}px) scale(${.88 + proofEnter * .12 + Math.sin(local / 10) * .012}) rotate(${(i - (scene.proofs.length - 1) / 2) * 1.6 + Math.sin(local / 13) * .6}deg)`;
      return <InternshipProof key={`${p.id}-${i}`} evidence={film.evidence.find(e => e.id === p.id)!} placement={p} style={motion ? { zIndex: 2, opacity: proofEnter, transform: proofTransform, boxShadow: "0 28px 65px #07110d38" } : undefined} />;
    })}
    {scene.proofs.length > 0 && <div style={{ ...abs(65, Math.max(...scene.proofs.map(p => p.y + p.h)) + 22, 950), zIndex: 3, textAlign: "center", fontSize: 23, opacity: motion ? enter(local, 10) * .75 : .75 }}>SOLOMON · ACTUAL PRODUCT CAPTURE</div>}
    {scene.presenter !== "absent" && <div style={{ ...abs(scene.presenter === "right" ? 450 : scene.presenter === "left" ? 50 : 175, scene.layout === "meet" ? 900 : 1190, 660, 940), zIndex: 4, transform: motion ? settled ? `translateY(${(1 - enter(local, 3)) * 90}px) scale(${scene.layout === "meet" ? 1.15 : .96})` : `translate(${Math.sin(local / 7) * 24}px, ${Math.sin(local / 5) * 16 + (1 - enter(local, 3)) * 130}px) rotate(${Math.sin(local / 9) * 1.8}deg) scale(${(scene.layout === "meet" ? 1.15 : .96) * (.94 + enter(local, 3) * .06)})` : `scale(${scene.layout === "meet" ? 1.15 : .96})`, transformOrigin: "0 0", opacity: motion ? enter(local, 3) : 1 }}>
      <RobotMascotV22Rig plan={{ ...presenterPlanV2(asV2Scene(scene)), sceneId: `real-${scene.id}` }} frame={settled ? Math.min(local, 32) : local} positioning="external" pixelScale={.96} enterOverride={1} mouthless />
    </div>}
    {scene.layout !== "cta" && <div key={phrase?.text ?? scene.headline} style={{ ...abs(65, scene.layout === "meet" ? 310 : 235, 950), zIndex: 6, textAlign: "center", fontFamily: editorial || phrase?.style === "serif" ? serif : undefined, fontStyle: editorial || phrase?.style === "serif" ? "italic" : "normal", fontSize: scene.layout === "meet" ? 147 : editorial ? 108 : 94, fontWeight: editorial ? 650 : 800, lineHeight: 1.07, letterSpacing: editorial ? -3 : -4, textWrap: "balance", ...(motion ? { opacity: enter(phraseFrame), transform: `translateY(${(1 - enter(phraseFrame)) * 58}px) scale(${.94 + enter(phraseFrame) * .06})`, filter: `blur(${interpolate(enter(phraseFrame), [0, 1], [5, 0], { easing: Easing.out(Easing.cubic) })}px)` } : {}) }}>{phrase?.text ?? scene.headline}</div>}
    {motion && !settled && <div style={{ ...abs(65, 1840, 950, 5), zIndex: 8, background: dark ? "#ffffff22" : "#13251d18", borderRadius: 5 }}><div style={{ height: "100%", width: `${((sceneIndex + Math.min(1, local / Math.max(1, scene.to - scene.from))) / film.scenes.length) * 100}%`, background: accent, borderRadius: 5 }} /></div>}
  </AbsoluteFill>;
};
export const MeetSolomonRealFilm: React.FC<{ film: MeetFilm }> = ({ film }) => <><MeetSolomonRealFrame film={film} frame={useCurrentFrame()} /><Audio src={staticFile(film.narrationSrc)} />{film.soundDesignSrc && <Audio src={staticFile(film.soundDesignSrc)} />}</>;
