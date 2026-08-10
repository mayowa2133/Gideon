import { useCurrentFrame } from "remotion";
import { mascotBoxForScene } from "../../shared/creatorStoryV22Quality";
import type { V22Rect } from "../../shared/creatorStoryV22Quality";
import { mascotIdleFloat, type V22MascotPerformance } from "../../shared/solomonMascotV22";
import { RobotMascotV22Rig } from "../mascotV22/RobotMascotV22Rig";

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
// V22 drops the dashed mascot-to-content interaction line that V9 used and V11
// restored. With the mascot anchored in a bottom corner it became a long diagonal
// across the frame, crossing the very proof text V12 had just cleared, and at
// that length its dashes read as a stray solid line. The reference videos direct
// attention with highlight outlines and zooms rather than presenter-to-content
// connectors; the mascot's point gesture carries the same intent.
const SLIDE_FRAMES = 10;
// Far enough below the rect that the rig is off the bottom edge at slide start.
const ENTRY_RISE = 520;

// Widened to the fields this layer actually reads -- id, from, to, mascot and
// layout -- so the generic renderer can drive the same presenter without a
// version-specific manifest. Nothing here was ever product-specific: the mascot
// is Gideon's, not Solomon's.
export const MascotLayer: React.FC<{ scenes: Array<{ id: string; from: number; to: number; mascot: V22MascotPerformance; layout: V22Rect[] }> }> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const index = Math.max(0, scenes.findIndex((scene) => frame >= scene.from && frame < scene.to));
  const scene = scenes[index] ?? scenes[0]!;
  const plan = scene.mascot;
  const previous = index > 0 ? scenes[index - 1]! : scene;
  const sinceCut = frame - scene.from;
  const slide = Math.min(1, Math.max(0, sinceCut / SLIDE_FRAMES));

  const to = mascotBoxForScene(scene);
  // Returning from an absent scene, the presenter rises into its rect instead of
  // travelling across the frame.
  //
  // `payoff` declares no mascot rect at all, so lerping from
  // mascotBoxForScene(previous) started the slide at that fallback box -- high in
  // the frame -- and for six of the ten slide frames the rig passed straight over
  // the result board, covering the "Message to Avery Chen" row. The collision
  // audit cannot see it: a rect says where the presenter ends up, not where it
  // travels, so the declared boxes never intersect and the picture is still wrong.
  //
  // Rising from below keeps the whole path inside the band the rig ends in, which
  // makes the transit as safe as the destination.
  const returning = previous.mascot.role === "absent" || !previous.layout.some(({ kind }) => kind === "mascot");
  const from = returning ? { ...to, y: to.y + ENTRY_RISE } : mascotBoxForScene(previous);
  const eased = slide * slide * (3 - 2 * slide);
  const box = { x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased), scale: lerp(from.scale, to.scale, eased) };
  // Squash-and-stretch on landing gives the slide weight without a fade.
  const land = sinceCut <= SLIDE_FRAMES ? Math.sin(eased * Math.PI) : 0;
  const squash = 1 - land * .08, stretch = 1 + land * .06;
  // Only the first frames of the film get an entrance; scene changes never do.
  const entrance = Math.min(1, Math.max(0, frame / 12));

  const visiblePlan: V22MascotPerformance = plan.role === "absent" ? previous.mascot : plan;
  if (visiblePlan.role === "absent") return null;

  // V22 moves the idle float here from the rig, and rounds it. This element is the
  // only one in the tree that positions in unscaled canvas space, and the canvas is
  // 1080x1920 at 1:1, so a whole number here is a whole device pixel. Inside the rig
  // the same value passed through this element's scale() and landed fractionally
  // again — every edge of the character then re-rasterized at a new sub-pixel phase
  // on every frame, which is what made the head look staticky rather than solid.
  //
  // box.x/box.y are rounded for the same reason. The shift is under a pixel and stays
  // inside auditV22MascotPlacement's existing 1px tolerance.
  const float = mascotIdleFloat(scene.id, frame);
  const left = Math.round(box.x) + float.x, top = Math.round(box.y) + float.y;

  return <div data-v22-mascot-layer={scene.id} style={{ position: "absolute", inset: 0, zIndex: 32, pointerEvents: "none" }}>
    <div data-v22-mascot-box data-v22-mascot-float={`${float.x},${float.y}`} style={{ position: "absolute", left, top, width: 660, height: 940, transformOrigin: "0 0", transform: `scale(${box.scale * stretch}, ${box.scale * squash})`, opacity: plan.role === "absent" ? 0 : entrance }}>
      <RobotMascotV22Rig plan={visiblePlan} frame={frame - scene.from} enterOverride={1} positioning="external" pixelScale={box.scale} />
    </div>
  </div>;
};

function lerp(from: number, to: number, progress: number) { return from + (to - from) * progress; }
