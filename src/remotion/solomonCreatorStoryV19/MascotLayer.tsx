import { useCurrentFrame } from "remotion";
import { mascotBoxForScene } from "../../shared/creatorStoryV19Quality";
import type { V19Scene } from "../../shared/solomonCreatorStoryV19";
import type { V19MascotPerformance } from "../../shared/solomonMascotV19";
import { RobotMascotV19Rig } from "../mascotV19/RobotMascotV19Rig";

// One mascot instance for the whole film. V10 mounted it inside each scene
// Sequence, so its entrance spring restarted at every boundary and the host
// ghosted in and out ~14 times.
//
// Placement derives from the scene's *declared* mascot rect rather than from
// separate anchor constants. V11 kept the two independent, so the rig rendered
// ~490px above where the manifest said it was — the wrapper had no explicit box,
// which collapsed transformOrigin "50% 100%" onto the top edge — and it landed on
// the proof labels while the declared-rect collision audit still reported no
// overlap. Deriving one from the other makes that audit bind.
//
// V19 drops the dashed mascot-to-content interaction line that V9 used and V11
// restored. With the mascot anchored in a bottom corner it became a long diagonal
// across the frame, crossing the very proof text V12 had just cleared, and at
// that length its dashes read as a stray solid line. The reference videos direct
// attention with highlight outlines and zooms rather than presenter-to-content
// connectors; the mascot's point gesture carries the same intent.
const SLIDE_FRAMES = 10;

export const MascotLayer: React.FC<{ scenes: V19Scene[] }> = ({ scenes }) => {
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

  const visiblePlan: V19MascotPerformance = plan.role === "absent" ? previous.mascot : plan;
  if (visiblePlan.role === "absent") return null;

  return <div data-v19-mascot-layer={scene.id} style={{ position: "absolute", inset: 0, zIndex: 32, pointerEvents: "none" }}>
    <div data-v19-mascot-box style={{ position: "absolute", left: box.x, top: box.y, width: 660, height: 940, transformOrigin: "0 0", transform: `scale(${box.scale * stretch}, ${box.scale * squash})`, opacity: plan.role === "absent" ? 0 : entrance }}>
      <RobotMascotV19Rig plan={visiblePlan} frame={frame - scene.from} enterOverride={1} positioning="external" />
    </div>
  </div>;
};

function lerp(from: number, to: number, progress: number) { return from + (to - from) * progress; }
