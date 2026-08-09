import { Img } from "remotion";
import { AbsoluteFill, spring, staticFile } from "remotion";
import { v22ProductStillFile } from "../../shared/creatorStoryV22Quality";
import type { FilmScene } from "../../shared/creatorStoryFilm";
import type { SceneProductCrop } from "../../shared/types";

// The drawing primitives, lifted from the V22 composition unchanged in behaviour
// and parameterised where they were hardcoded. Everything here is the part of
// that film worth keeping: the findings are in the comments and the geometry is
// the solved geometry, not a fresh guess.

export const INK = "#07111f", WHITE = "#fff", MINT = "#39f2b5", GREEN = "#087052", AMBER = "#ff9d18";

// Scene content is pinned to this floor rather than to hand-set tops, so growing
// the presenter can never slide it over proof text -- which is what dropped the
// `relevance` and `control` claims. The floor clears the antenna, not the mascot
// box: the rig bleeds 48px above its rect because its svg overflow is visible.
export const CONTENT_FLOOR_BOTTOM = 1920 - 1015;

// Enlarging dense UI thickens glyph strokes as fast as it removes glyphs. Raising
// this from 1.02 to 1.18 moved film edge density 2.33% -> 2.34% and broke three
// gates; a 1x-3.5x sweep on the message panel is non-monotonic. It is not a lever.
const PRODUCT_FOCUS_SCALE = 1.02;

// Product proof renders from pre-extracted stills. Fifteen decoding <Video>
// elements made the render nondeterministic -- byte-identical code produced 19,
// 19 and 33 shots -- so a crop that needs to move plays a still sequence instead.
// There is no decoding element anywhere in this tree.
// Frame arrives as a prop rather than from useCurrentFrame, so the whole draw
// tree is a pure function of its props. That is what lets every template be
// exercised in a unit test instead of only inside a 25-minute render -- the same
// reason the mascot rig takes its frame as a prop.
export const EvidenceCrop: React.FC<{ crop: SceneProductCrop; width: number; height: number; frame: number }> = ({ crop, width, height, frame: localFrame }) => {
  // Clamps on the last frame rather than looping, so a long scene settles
  // instead of replaying the same few seconds.
  const trim = crop.motion
    ? crop.trim + Math.min(crop.motion.frames - 1, Math.floor(Math.max(0, localFrame) / crop.motion.hold)) * crop.motion.step
    : crop.trim;
  const scale = Math.max(width / crop.width, height / crop.height);
  const frame = {
    position: "absolute" as const,
    left: -crop.x * scale, top: -crop.y * scale,
    width: 1440 * scale, height: 900 * scale, maxWidth: "none",
    transform: `scale(${PRODUCT_FOCUS_SCALE})`,
    transformOrigin: `${(crop.x + crop.width / 2) / 14.4}% ${(crop.y + crop.height / 2) / 9}%`
  };
  return <div data-cs-product={crop.assetId} style={{ position: "absolute", inset: 0, overflow: "hidden", background: WHITE }}>
    <Img src={staticFile(v22ProductStillFile(crop.assetId, trim))} style={frame} />
  </div>;
};

export const EvidenceCard: React.FC<React.PropsWithChildren<{ border?: string }>> = ({ children, border }) =>
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 32, background: WHITE, border: border ? `5px solid ${border}` : "none", boxShadow: "0 28px 70px rgba(7,17,31,.18)" }}>{children}</div>;

// Empty decorative rectangles carry no text, so unlike the evidence crops they
// can follow the backdrop. They have to: on the deep tier a white placeholder is
// the brightest thing in the shot and reads as the subject, which is backwards
// for a card that exists to be swept away.
export function placeholderSurface(tier: FilmScene["backdrop"]["tier"]) {
  return tier === "deep"
    ? { background: "rgba(255,255,255,.07)", border: "rgba(255,255,255,.22)" }
    : { background: WHITE, border: "#c8d7d0" };
}

export const Backdrop: React.FC<React.PropsWithChildren<{ backdrop: FilmScene["backdrop"] }>> = ({ backdrop, children }) =>
  <AbsoluteFill style={{ background: backdrop.css, ["--cs-fg" as string]: backdrop.foreground }}>{children}</AbsoluteFill>;

export const ProofLabel: React.FC<{ text: string; primary?: boolean; delay?: number; frame?: number }> = ({ text, primary = false, delay = 0, frame = 30 }) => {
  const p = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 20, stiffness: 190 }, durationInFrames: 16 });
  return <div style={{ padding: "10px 18px", borderRadius: 13, background: primary ? INK : WHITE, color: primary ? WHITE : INK, boxShadow: "0 6px 18px rgba(7,17,31,.10)", fontSize: 22, fontWeight: 950, opacity: p, transform: `translateX(${(1 - p) * 45}px)` }}>{text}</div>;
};

export const StatePill: React.FC<{ text: string; active: boolean }> = ({ text, active }) =>
  <div style={{ padding: "18px 25px", borderRadius: 18, background: active ? GREEN : WHITE, color: active ? WHITE : INK, border: `3px solid ${active ? GREEN : "#c9d8d1"}`, boxShadow: active ? "0 12px 30px rgba(7,112,82,.22)" : "none" }}>{text}</div>;

export const Cursor: React.FC<{ frame: number; from: { x: number; y: number }; to: { x: number; y: number }; clickAt: number }> = ({ frame, from, to, clickAt }) => {
  const travel = Math.min(1, Math.max(0, frame / Math.max(1, clickAt - 2)));
  const x = from.x + (to.x - from.x) * travel, y = from.y + (to.y - from.y) * travel;
  const ring = frame >= clickAt && frame < clickAt + 12 ? (frame - clickAt) / 12 : -1;
  return <>
    <svg width="46" height="52" viewBox="0 0 46 52" style={{ position: "absolute", left: x, top: y, zIndex: 60 }}>
      <path d="M4 2 L4 40 L14 31 L21 47 L29 43 L22 28 L36 27 Z" fill={WHITE} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
    </svg>
    {ring >= 0 && <div style={{ position: "absolute", left: x - 34, top: y - 34, width: 96, height: 96, borderRadius: 999, border: `6px solid ${MINT}`, opacity: 1 - ring, transform: `scale(${.4 + ring * 1.2})`, zIndex: 59 }} />}
  </>;
};

export const Disclosure = () =>
  <div data-cs-disclosure style={{ position: "absolute", left: 26, top: 26, zIndex: 80, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,.84)", border: "1px solid rgba(7,112,82,.25)", color: GREEN, fontSize: 14, fontWeight: 900, letterSpacing: 2 }}>DEMO DATA</div>;
