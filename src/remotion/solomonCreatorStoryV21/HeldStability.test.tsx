import { describe, expect, it } from "vitest";
import { v21CameraTransform } from "../../shared/creatorStoryV21Quality";
import { mascotIdleFloat, v21MascotPerformanceSchema, type V21MascotPerformance } from "../../shared/solomonMascotV21";
import { RobotMascotV21Rig } from "../mascotV21/RobotMascotV21Rig";

// The V21 regression lock.
//
// A held element must hold. Through V20 nothing in the film did: the mascot rig
// carried a raw sine hover and a rotation jitter, and EditorialCamera translated
// and rescaled every scene on every frame. None of the values were ever whole
// pixels, so every edge re-rasterized continuously — the robot's head read as
// staticky rather than solid, and the headline type churned ~4.5x harder still.
//
// None of the 27 render gates could see it. measureV21Motion decodes at 180x320
// and 5 fps, a 36x spatial and 6x temporal decimation, so sub-pixel churn at
// 1080x1920/30fps is averaged out of existence before the metric is computed.
// Worse, whatever survived registered as *motion*, so medianFrameChange and
// nearStaticFramePercent were scoring the defect as a point in its favour.
//
// These assertions are exact. They compare transform strings for byte equality
// across consecutive frames, so there is no threshold to tune and nothing that
// can drift the way a calibrated metric can. They deliberately check geometry
// only: the face, mouth, blink, and antenna SHOULD animate. It is the frame the
// character sits in that must not move without being asked to.

// Same local walker as the rig golden masters: the rig is a pure function of
// props, so this keeps the assertion independent of the DOM renderer.
function serialize(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(serialize).join("");
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (typeof element.type === "function") return serialize((element.type as (props: unknown) => React.ReactNode)(element.props));
  const { children, style, ...rest } = element.props;
  const attributes = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .concat(style ? [`style="${JSON.stringify(style)}"`] : [])
    .join(" ");
  return `<${String(element.type)} ${attributes}>${serialize(children as React.ReactNode)}</${String(element.type)}>`;
}

// The wrapper transform positions the whole character; the head group carries the
// extra rotation that made the head, ~455 units from the torso-centred pivot,
// travel further per frame than any other part of the body.
function geometryOf(markup: string) {
  const wrapper = /"transform":"([^"]*)"/.exec(markup)?.[1] ?? "";
  const head = /<g transform="(translate\(330 250\)[^"]*)"/.exec(markup)?.[1] ?? "";
  return { wrapper, head };
}

// A held pose: gaze settles by frame 3, head beats are far outside the sampled
// window, and no limb timing lands inside it either.
function heldPlan(): V21MascotPerformance {
  return v21MascotPerformanceSchema.parse({
    sceneId: "held",
    role: "host",
    narrativePurpose: "emotion",
    face: "friendly",
    mouthBias: "closed_smile",
    gazePath: [{ frame: 0, target: "camera", x: .5, y: .4 }, { frame: 3, target: "product", x: .68, y: .42 }],
    head: { turn: .2, tilt: .1, beats: [4, 12] },
    torso: { lean: .25, rotate: .1, recoil: .12 },
    left: { gesture: "open_palm", timing: { start: 5, peak: 11, recover: 20, wristRotation: 14 } },
    right: { gesture: "presentation_palm", timing: { start: 8, peak: 16, recover: 24, wristRotation: -18 } },
    blinkFrames: [10, 12],
    // Audio varies frame to frame on purpose: the mouth and antenna are supposed
    // to react to it. Geometry must stay put regardless.
    audioFrames: Array.from({ length: 120 }, (_, frame) => ({ frame, rms: .3 + (frame % 7) * .04, speaking: true, onset: (frame % 5) * .1, phraseBoundary: false })),
    interactionTarget: { elementId: "held-target", x: .68, y: .42, action: "point" },
  });
}

const HELD_WINDOW = Array.from({ length: 24 }, (_, index) => 40 + index);

describe("V21 held-element stability", () => {
  it("holds the mascot geometry byte-identical across a held window", () => {
    const plan = heldPlan();
    const frames = HELD_WINDOW.map((frame) => geometryOf(serialize(<RobotMascotV21Rig plan={plan} frame={frame} fps={30} enterOverride={1} positioning="external" />)));
    expect(frames[0]!.wrapper).not.toBe("");
    expect(frames[0]!.head).not.toBe("");
    for (const geometry of frames) {
      expect(geometry.wrapper).toBe(frames[0]!.wrapper);
      expect(geometry.head).toBe(frames[0]!.head);
    }
  });

  it("still animates the face and mouth inside that same window", () => {
    const plan = heldPlan();
    const rendered = HELD_WINDOW.map((frame) => serialize(<RobotMascotV21Rig plan={plan} frame={frame} fps={30} enterOverride={1} positioning="external" />));
    // Guards the assertion above from passing for the wrong reason: if the rig
    // ever froze entirely, geometry equality would still hold.
    expect(new Set(rendered).size).toBeGreaterThan(1);
  });

  it("keeps the rig on whole device pixels while a gesture is mid-swing", () => {
    // The window that exposed the bug the first decoded measurement caught. `lean`
    // is scaled by limbCurve, which eases continuously, so through a gesture the
    // whole rig slid ~0.2-0.3px per frame — invisible as movement, plenty to
    // shimmer every edge. Frames 5-20 sit inside both limb ramps.
    const plan = heldPlan();
    const scale = 1.047;
    const offsets = Array.from({ length: 16 }, (_, index) => 5 + index).map((frame) => {
      const markup = serialize(<RobotMascotV21Rig plan={plan} frame={frame} fps={30} enterOverride={1} positioning="external" pixelScale={scale} />);
      const translate = /translate\((-?[\d.]+)px,(-?[\d.]+)px\)/.exec(geometryOf(markup).wrapper);
      return { x: Number(translate?.[1]), y: Number(translate?.[2]) };
    });
    expect(offsets.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    for (const { x, y } of offsets) {
      // Composed against the layer's scale these must land on whole device pixels.
      expect(Math.abs(x * scale - Math.round(x * scale))).toBeLessThan(1e-6);
      expect(Math.abs(y * scale - Math.round(y * scale))).toBeLessThan(1e-6);
    }
    // And it must still be a staircase, not a freeze: the lean is real motion.
    expect(new Set(offsets.map(({ x }) => x)).size).toBeGreaterThan(1);
    expect(new Set(offsets.map(({ x }) => x)).size).toBeLessThan(offsets.length);
  });

  it("quantizes the mascot idle float to whole pixels for every frame of the film", () => {
    for (const sceneId of ["hook", "friction", "payoff", "cta", "signature"]) {
      for (let frame = 0; frame <= 1080; frame += 1) {
        const float = mascotIdleFloat(sceneId, frame);
        expect(Number.isInteger(float.x)).toBe(true);
        expect(Number.isInteger(float.y)).toBe(true);
      }
    }
  });

  it("moves the idle float in discrete steps rather than drifting every frame", () => {
    const steps = Array.from({ length: 200 }, (_, frame) => mascotIdleFloat("cta", frame));
    const changed = steps.filter((float, index) => index > 0 && (float.x !== steps[index - 1]!.x || float.y !== steps[index - 1]!.y));
    // V20 changed on 100% of frames. A staircase should change on a minority of
    // them and hold in between; that holding is what makes frames identical.
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length / steps.length).toBeLessThan(.5);
  });

  it("never lets the camera transform change on more than a minority of frames", () => {
    const scene = { from: 0, to: 96, typography: "editorial", camera: { scaleFrom: 1, scaleTo: 1.3, focus: { x: .32, y: .58 } } };
    const transforms = Array.from({ length: 96 }, (_, frame) => v21CameraTransform(scene, frame).transform);
    const changes = transforms.filter((value, index) => index > 0 && value !== transforms[index - 1]).length;
    // The declared push is real motion and is kept, but it steps in whole pixels
    // instead of sliding sub-pixel, so most adjacent frame pairs are identical.
    expect(changes).toBeGreaterThan(0);
    expect(changes / transforms.length).toBeLessThan(.5);
    // And every value it does take is a whole pixel.
    for (let frame = 0; frame < 96; frame += 1) {
      const camera = v21CameraTransform(scene, frame);
      expect(Number.isInteger(camera.translateX)).toBe(true);
      expect(Number.isInteger(camera.translateY)).toBe(true);
    }
  });

  it("holds a calm scene's camera completely still through its reading window", () => {
    const scene = { from: 0, to: 120, typography: "product_annotation", camera: { scaleFrom: 1, scaleTo: 1.2, focus: { x: .5, y: .5 } } };
    const window = Array.from({ length: 40 }, (_, index) => 30 + index).map((frame) => v21CameraTransform(scene, frame).transform);
    for (const transform of window) expect(transform).toBe(window[0]);
  });
});
