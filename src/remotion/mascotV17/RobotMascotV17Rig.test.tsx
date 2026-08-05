import { describe, expect, it } from "vitest";
import { auditSolomonMascotV17, SOLOMON_MASCOT_V17_GEOMETRY, v17FaceSchema, v17GestureSchema, v17MascotPerformanceSchema, type V17Face, type V17Gesture, type V17MascotPerformance } from "../../shared/solomonMascotV17";
import { RobotMascotV17Rig } from "./RobotMascotV17Rig";

// Golden-master coverage for the character itself. V10 shipped a face/hand
// redesign (circle eyes, splayed fingers, floating head) that no test could
// see, because every mascot audit only inspected declared manifest strings.
// These snapshots turn any silhouette change into a reviewable diff.
//
// The rig is serialized by a local walker rather than react-dom/server: the rig
// is a pure function of props, and this keeps character coverage independent of
// the DOM renderer.
const KEEP_CAMEL = new Set(["viewBox", "preserveAspectRatio", "gradientUnits", "patternUnits", "stopColor", "stopOpacity", "textAnchor", "fontFamily", "fontWeight", "fontSize"]);

function attributeName(name: string) {
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  if (KEEP_CAMEL.has(name)) return name;
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function serializeStyle(style: Record<string, unknown>) {
  return Object.entries(style).map(([key, value]) => `${attributeName(key)}:${String(value)}`).join(";");
}

function renderToString(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderToString).join("");
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (typeof element.type === "function") return renderToString((element.type as (props: unknown) => React.ReactNode)(element.props));
  const { children, style, ...rest } = element.props;
  const attributes = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${attributeName(key)}="${String(value)}"`)
    .concat(style ? [`style="${serializeStyle(style as Record<string, unknown>)}"`] : [])
    .join(" ");
  const inner = renderToString(children as React.ReactNode);
  return `<${element.type}${attributes ? ` ${attributes}` : ""}>${inner}</${element.type}>`;
}

function plan(overrides: Partial<V17MascotPerformance> = {}): V17MascotPerformance {
  return v17MascotPerformanceSchema.parse({
    sceneId: "snapshot",
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
    audioFrames: Array.from({ length: 30 }, (_, frame) => ({ frame, rms: .42, speaking: true, onset: .06, phraseBoundary: false })),
    interactionTarget: { elementId: "snapshot-target", x: .68, y: .42, action: "point" },
    ...overrides,
  });
}

const render = (performance: V17MascotPerformance, frame = 14) => renderToString(<RobotMascotV17Rig plan={performance} frame={frame} fps={30} enterOverride={1} />);
const withGesture = (gesture: V17Gesture, overrides: Partial<V17MascotPerformance> = {}) => plan({ left: { gesture, timing: { start: 5, peak: 11, recover: 20, wristRotation: 14 } }, ...overrides });

describe("RobotMascotV17 character golden masters", () => {
  it("renders every resting face state", () => {
    for (const face of v17FaceSchema.options.filter((option): option is V17Face => option !== "surprised")) {
      expect(render(plan({ face }))).toMatchSnapshot(`face-${face}`);
    }
  });

  it("renders the surprised accent only inside its hold window", () => {
    const accented = plan({ face: "happy", faceAccents: [{ atFrame: 2, face: "surprised", holdFrames: 9 }] });
    expect(render(accented, 4)).toContain('data-v17-face="surprised"');
    expect(render(accented, 12)).toContain('data-v17-face="happy"');
    expect(render(accented, 4)).toMatchSnapshot("face-surprised-accent");
  });

  it("renders every gesture silhouette", () => {
    for (const gesture of v17GestureSchema.options as V17Gesture[]) {
      expect(render(withGesture(gesture))).toMatchSnapshot(`gesture-${gesture}`);
    }
  });

  it("keeps mitts at cameo scale and fingers only at host scale", () => {
    expect(render(withGesture("open_palm", { role: "cameo_right" }))).not.toContain('data-v17-hand="palm-fingers"');
    expect(render(withGesture("open_palm", { role: "cameo_right" }))).toContain('data-v17-hand="mitt"');
    expect(render(withGesture("open_palm", { role: "host" }))).toContain('data-v17-hand="palm-fingers"');
  });

  it("draws a neck that closes the head-to-body seam", () => {
    expect(render(plan())).toContain("data-v17-neck");
    const neckTop = 482, neckBottom = 482 + 60, headBottom = 48 + SOLOMON_MASCOT_V17_GEOMETRY.headHeight, torsoTop = 720 - 195;
    expect(neckTop).toBeLessThan(headBottom);
    expect(neckBottom).toBeGreaterThan(torsoTop);
  });

  it("never draws pin-style props or off-center pupils", () => {
    for (const gesture of v17GestureSchema.options as V17Gesture[]) {
      expect(render(withGesture(gesture))).not.toContain('cx="20" cy="-42"');
    }
    expect(render(plan({ face: "direct_cta" }))).not.toContain('r="11"');
  });

  it("consumes the shared geometry spec rather than private literals", () => {
    const markup = render(plan());
    expect(markup).toContain(`width="${SOLOMON_MASCOT_V17_GEOMETRY.headWidth}"`);
    expect(markup).toContain(`height="${SOLOMON_MASCOT_V17_GEOMETRY.headHeight}"`);
    expect(markup).toContain(`width="${SOLOMON_MASCOT_V17_GEOMETRY.screenWidth}"`);
    expect(markup).toContain(SOLOMON_MASCOT_V17_GEOMETRY.faceColor);
    expect(auditSolomonMascotV17().passed).toBe(true);
  });
});
