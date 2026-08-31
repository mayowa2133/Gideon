import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { asV2Scene, realCta, type MeetFilm, type MeetScene } from "../../shared/meetSolomonRealInternships";
import { InternshipProof } from "../meetSolomonInternships/MeetSolomonInternshipsFilm";
import { presenterPlanV2 } from "../meetSolomonV2/MeetSolomonFilmV2";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

const COLORS = { ivory: "#f4efe5", clay: "#cd7862", charcoal: "#171b1a", sage: "#d8dfce" };
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const serif = '"Fraunces Variable", Georgia, serif';
const tile: CSSProperties = { padding: 28, boxSizing: "border-box", border: "2px solid #aabcae", borderRadius: 20, background: "#fffdf6", color: "#182320", fontSize: 54, fontWeight: 800, textAlign: "center" };
function Art({ scene, category }: { scene: MeetScene; category: MeetFilm["category"] }) {
  const words = category === "finance" ? ["AUDIT", "ANALYSIS", "YOUR NEXT STEP"] : category === "software" ? ["CODE", "BUILD", "YOUR NEXT STEP"] : ["LEGAL OPS", "DATA", "YOUR NEXT STEP"];
  if (scene.layout === "hook") return <>{words.slice(0, 2).map((word, i) => <div key={word} style={{ ...abs(120 + i * 100, 650 + i * 155, 740, 135), ...tile, transform: `rotate(${i ? 3 : -3}deg)` }}>{word}</div>)}<div style={{ ...abs(65, 1010, 950), textAlign: "center", fontSize: 24 }}>ILLUSTRATION · YOUR INTERNSHIP SEARCH</div></>;
  if (scene.layout === "requirements" || scene.layout === "fit") return <>{(scene.layout === "requirements" ? ["READ THE DESCRIPTION", "CHECK THE REQUIREMENTS"] : ["YOUR SKILLS", "YOUR AVAILABILITY"]).map((word, i) => <div key={word} style={{ ...abs(90, 620 + i * 230, 900, 170), ...tile, display: "flex", alignItems: "center", justifyContent: "center" }}>{word}</div>)}<div style={{ ...abs(65, 1135, 950), textAlign: "center", fontSize: 24 }}>ILLUSTRATION · YOU DECIDE WHETHER TO APPLY</div></>;
  if (scene.layout === "reset") return <div style={{ ...abs(90, 660, 900, 180), ...tile }}>LOOK BEYOND THE TITLE.</div>;
  if (scene.layout === "caveat") return <div style={{ ...abs(90, 650, 900, 230), ...tile, fontSize: 64 }}>Listings can change.<br />Check before applying.</div>;
  if (scene.layout === "cta") return <div data-real-cta={realCta(category)}>
    <div style={{ ...abs(65, 220, 950), textAlign: "center", fontSize: 31, letterSpacing: 3 }}>YOUR NEXT STEP</div>
    <div style={{ ...abs(65, 335, 950), textAlign: "center", fontWeight: 800, fontSize: 92, lineHeight: 1.08, letterSpacing: -4 }}>Find your next<br />{category === "law" ? "legal" : category}<br />internship.</div>
    <div style={{ ...abs(65, 725, 950), textAlign: "center", fontFamily: serif, fontStyle: "italic", fontSize: 64 }}>with</div>
    <div style={{ ...abs(65, 830, 950), textAlign: "center", fontWeight: 800, fontSize: 148, color: "#176b50", letterSpacing: -6 }}>Solomon.</div>
  </div>;
  return null;
}
export const MeetSolomonRealFrame: React.FC<{ film: MeetFilm; frame: number }> = ({ film, frame }) => {
  const scene = film.scenes.find(s => frame >= s.from && frame < s.to) ?? film.scenes.at(-1)!;
  const local = frame - scene.from, dark = scene.background === "charcoal";
  const phrase = scene.phrases.find(p => frame >= p.from && frame < p.to);
  return <AbsoluteFill style={{ background: COLORS[scene.background], color: dark ? "#f4efe5" : "#182320", fontFamily: '"Manrope Variable", Arial, sans-serif', overflow: "hidden" }}>
    <div style={{ ...abs(65, 78, 950), display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 800, letterSpacing: 1 }}><span>MEET SOLOMON</span><span>{film.category === "law" ? "LEGAL OPERATIONS" : film.category.toUpperCase()} INTERNSHIPS</span></div>
    <div style={{ ...abs(65, 124, 950), fontSize: 21, opacity: .72 }}>REAL LISTING · CHECKED {film.listing.verifiedAt.slice(0, 10)}</div>
    <Art scene={scene} category={film.category} />
    {scene.proofs.map(p => <InternshipProof key={p.id} evidence={film.evidence.find(e => e.id === p.id)!} placement={p} />)}
    {scene.proofs.length > 0 && <div style={{ ...abs(65, Math.max(...scene.proofs.map(p => p.y + p.h)) + 22, 950), textAlign: "center", fontSize: 23, opacity: .75 }}>SOLOMON · ACTUAL PRODUCT CAPTURE</div>}
    {scene.presenter !== "absent" && <div style={{ ...abs(scene.presenter === "right" ? 450 : scene.presenter === "left" ? 50 : 175, scene.layout === "meet" ? 900 : 1190, 660, 940), transform: `scale(${scene.layout === "meet" ? 1.15 : .96})`, transformOrigin: "0 0" }}>
      <RobotMascotV22Rig plan={{ ...presenterPlanV2(asV2Scene(scene)), sceneId: `real-${scene.id}` }} frame={local} positioning="external" pixelScale={.96} enterOverride={1} mouthless />
    </div>}
    {scene.layout !== "cta" && <div style={{ ...abs(65, scene.layout === "meet" ? 310 : 235, 950), textAlign: "center", fontFamily: phrase?.style === "serif" ? serif : undefined, fontStyle: phrase?.style === "serif" ? "italic" : "normal", fontSize: scene.layout === "meet" ? 147 : 94, fontWeight: 800, lineHeight: 1.07, letterSpacing: -4, textWrap: "balance" }}>{phrase?.text ?? scene.headline}</div>}
  </AbsoluteFill>;
};
export const MeetSolomonRealFilm: React.FC<{ film: MeetFilm }> = ({ film }) => <><MeetSolomonRealFrame film={film} frame={useCurrentFrame()} /><Audio src={staticFile(film.narrationSrc)} />{film.soundDesignSrc && <Audio src={staticFile(film.soundDesignSrc)} />}</>;
