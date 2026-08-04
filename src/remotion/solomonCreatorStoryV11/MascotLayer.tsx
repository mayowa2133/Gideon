import { useCurrentFrame } from "remotion";
import type { V11Scene } from "../../shared/solomonCreatorStoryV11";
import type { V11MascotPerformance } from "../../shared/solomonMascotV11";
import { RobotMascotV11Rig } from "../mascotV11/RobotMascotV11Rig";

// One mascot instance for the whole film. V10 mounted the mascot inside each
// scene Sequence, so its entrance spring restarted at every boundary and the
// host visibly ghosted in and out ~14 times. Here it is mounted once, driven by
// the absolute frame, and slides between per-scene anchors instead of fading.
const SLIDE_FRAMES = 10;

export const MascotLayer: React.FC<{ scenes: V11Scene[] }> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const index = Math.max(0, scenes.findIndex((scene) => frame >= scene.from && frame < scene.to));
  const scene = scenes[index] ?? scenes[0]!;
  const plan = scene.mascot;
  const previous = index > 0 ? scenes[index - 1]! : scene;
  const sinceCut = frame - scene.from;
  const slide = Math.min(1, Math.max(0, sinceCut / SLIDE_FRAMES));

  const from = anchorFor(previous.mascot), to = anchorFor(plan);
  const eased = slide * slide * (3 - 2 * slide);
  const anchor = { x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased), scale: lerp(from.scale, to.scale, eased) };
  // Squash-and-stretch on landing gives the slide weight without a fade.
  const land = sinceCut <= SLIDE_FRAMES ? Math.sin(eased * Math.PI) : 0;
  const squash = 1 - land * .08, stretch = 1 + land * .06;
  // Only the very first frames of the film get an entrance; scene changes never do.
  const entrance = Math.min(1, Math.max(0, frame / 12));

  const visiblePlan: V11MascotPerformance = plan.role === "absent" ? previous.mascot : plan;
  if (visiblePlan.role === "absent") return null;

  const target = visiblePlan.interactionTarget;
  const armed = sinceCut >= SLIDE_FRAMES && target && plan.role !== "absent";

  return <div data-v11-mascot-layer={scene.id} style={{ position: "absolute", inset: 0, zIndex: 32, pointerEvents: "none" }}>
    {armed && <InteractionLine from={{ x: anchor.x + 330 * anchor.scale, y: anchor.y + 330 * anchor.scale }} to={{ x: target.x * 1080, y: target.y * 1920 }} progress={Math.min(1, (sinceCut - SLIDE_FRAMES) / 14)} />}
    <div style={{ position: "absolute", left: anchor.x, top: anchor.y, transform: `scale(${anchor.scale * stretch}, ${anchor.scale * squash})`, transformOrigin: "50% 100%", opacity: plan.role === "absent" ? 0 : entrance }}>
      <RobotMascotV11Rig plan={visiblePlan} frame={frame - scene.from} enterOverride={1} positioning="external" />
    </div>
  </div>;
};

// V9 drew a dashed line from the mascot to whatever it was presenting; V10 kept
// the interactionTarget in the schema but stopped rendering it, which is part of
// why the mascot read as a sticker rather than a host.
const InteractionLine: React.FC<{ from: { x: number; y: number }; to: { x: number; y: number }; progress: number }> = ({ from, to, progress }) => {
  const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2 - 120;
  return <svg width="1080" height="1920" style={{ position: "absolute", inset: 0 }} data-v11-interaction-line>
    <path d={`M${from.x} ${from.y} Q${midX} ${midY} ${to.x} ${to.y}`} fill="none" stroke="#39f2b5" strokeWidth="7" strokeLinecap="round" strokeDasharray="14 13" opacity={.55 * progress} pathLength="1" strokeDashoffset={1 - progress} />
  </svg>;
};

function lerp(from: number, to: number, progress: number) { return from + (to - from) * progress; }

// Numeric canvas anchors (V10 used CSS left/right/bottom strings, which cannot
// be interpolated). The rig is 660x940 and scales about "50% 100%", so a cameo's
// visible span is [x + 330 - 330*s, x + 330 + 330*s]: anchors are solved from the
// intended on-screen position rather than guessed, otherwise a cameo drifts
// almost entirely off-canvas and the mascot vanishes.
const RIG_WIDTH = 660, RIG_HEIGHT = 940, CAMEO_SCALE = .48, CAMEO_PEEK = 58;
function cameoX(side: "left" | "right") {
  const half = (RIG_WIDTH * CAMEO_SCALE) / 2;
  const visibleLeft = side === "left" ? -CAMEO_PEEK : 1080 - RIG_WIDTH * CAMEO_SCALE + CAMEO_PEEK;
  return visibleLeft - (RIG_WIDTH / 2 - half);
}
// Bottom edge sits just past the frame so the mascot is grounded, not floating.
const CAMEO_Y = 1960 - RIG_HEIGHT;
function anchorFor(plan: V11MascotPerformance) {
  if (plan.role === "hero_close") return { x: 210, y: 320, scale: 1.12 };
  if (plan.role === "cameo_left") return { x: cameoX("left"), y: CAMEO_Y, scale: CAMEO_SCALE };
  if (plan.role === "cameo_right") return { x: cameoX("right"), y: CAMEO_Y, scale: CAMEO_SCALE };
  return { x: 210, y: 420, scale: 1 };
}
