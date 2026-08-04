import { useCurrentFrame } from "remotion";
import { V12_CANVAS, mascotBoxForScene } from "../../shared/creatorStoryV12Quality";
import type { V12Scene } from "../../shared/solomonCreatorStoryV12";
import type { V12MascotPerformance } from "../../shared/solomonMascotV12";
import { RobotMascotV12Rig } from "../mascotV12/RobotMascotV12Rig";

// One mascot instance for the whole film. V10 mounted it inside each scene
// Sequence, so its entrance spring restarted at every boundary and the host
// ghosted in and out ~14 times.
//
// V12 additionally derives placement from the scene's *declared* mascot rect
// rather than from separate anchor constants. V11 kept the two independent, so
// the rig rendered ~490px above where the manifest said it was — the wrapper had
// no explicit box, which collapsed transformOrigin "50% 100%" onto the top edge —
// and it landed on the proof labels while the declared-rect collision audit
// still reported no overlap. Deriving one from the other makes that audit bind.
const SLIDE_FRAMES = 10;

export const MascotLayer: React.FC<{ scenes: V12Scene[] }> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const index = Math.max(0, scenes.findIndex((scene) => frame >= scene.from && frame < scene.to));
  const scene = scenes[index] ?? scenes[0]!;
  const plan = scene.mascot;
  const previous = index > 0 ? scenes[index - 1]! : scene;
  const sinceCut = frame - scene.from;
  const slide = Math.min(1, Math.max(0, sinceCut / SLIDE_FRAMES));

  const from = mascotBoxForScene(previous), to = mascotBoxForScene(scene);
  const eased = slide * slide * (3 - 2 * slide);
  const box = { x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased), scale: lerp(from.scale, to.scale, eased) };
  // Squash-and-stretch on landing gives the slide weight without a fade.
  const land = sinceCut <= SLIDE_FRAMES ? Math.sin(eased * Math.PI) : 0;
  const squash = 1 - land * .08, stretch = 1 + land * .06;
  // Only the first frames of the film get an entrance; scene changes never do.
  const entrance = Math.min(1, Math.max(0, frame / 12));

  const visiblePlan: V12MascotPerformance = plan.role === "absent" ? previous.mascot : plan;
  if (visiblePlan.role === "absent") return null;

  const target = visiblePlan.interactionTarget;
  const armed = sinceCut >= SLIDE_FRAMES && target && plan.role !== "absent";
  const headX = box.x + 330 * box.scale, headY = box.y + 270 * box.scale;

  return <div data-v12-mascot-layer={scene.id} style={{ position: "absolute", inset: 0, zIndex: 32, pointerEvents: "none" }}>
    {armed && <InteractionLine from={{ x: headX, y: headY }} to={{ x: target.x * V12_CANVAS.width, y: target.y * V12_CANVAS.height }} progress={Math.min(1, (sinceCut - SLIDE_FRAMES) / 14)} />}
    <div data-v12-mascot-box style={{ position: "absolute", left: box.x, top: box.y, width: 660, height: 940, transformOrigin: "0 0", transform: `scale(${box.scale * stretch}, ${box.scale * squash})`, opacity: plan.role === "absent" ? 0 : entrance }}>
      <RobotMascotV12Rig plan={visiblePlan} frame={frame - scene.from} enterOverride={1} positioning="external" />
    </div>
  </div>;
};

function lerp(from: number, to: number, progress: number) { return from + (to - from) * progress; }

// V9 drew a dashed line from the mascot to whatever it was presenting; V10 kept
// the interactionTarget in the schema but stopped rendering it, which is part of
// why the mascot read as a sticker rather than a host.
const InteractionLine: React.FC<{ from: { x: number; y: number }; to: { x: number; y: number }; progress: number }> = ({ from, to, progress }) => {
  const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2 - 120;
  return <svg width={V12_CANVAS.width} height={V12_CANVAS.height} style={{ position: "absolute", inset: 0 }} data-v12-interaction-line>
    <path d={`M${from.x} ${from.y} Q${midX} ${midY} ${to.x} ${to.y}`} fill="none" stroke="#39f2b5" strokeWidth="7" strokeLinecap="round" strokeDasharray="14 13" opacity={.55 * progress} pathLength="1" strokeDashoffset={1 - progress} />
  </svg>;
};
