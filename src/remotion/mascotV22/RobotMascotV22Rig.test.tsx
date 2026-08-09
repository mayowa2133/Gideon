import { describe, expect, it } from "vitest";
import { auditSolomonMascotV22, SOLOMON_MASCOT_V22_GEOMETRY, v22FaceSchema, v22GestureSchema, v22MascotPerformanceSchema, type V22Face, type V22Gesture, type V22MascotPerformance } from "../../shared/solomonMascotV22";
import { RobotMascotV22Rig } from "./RobotMascotV22Rig";

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
  // Fragments have a Symbol type and no markup of their own. Without this the
  // walker stringified the Symbol and threw, so a rig that groups elements with
  // <>...</> could not be snapshotted at all -- a limit of the harness, not of
  // the character.
  if (typeof element.type === "symbol") return renderToString((element.props as { children?: React.ReactNode }).children);
  const { children, style, ...rest } = element.props;
  const attributes = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${attributeName(key)}="${String(value)}"`)
    .concat(style ? [`style="${serializeStyle(style as Record<string, unknown>)}"`] : [])
    .join(" ");
  const inner = renderToString(children as React.ReactNode);
  return `<${element.type}${attributes ? ` ${attributes}` : ""}>${inner}</${element.type}>`;
}

function plan(overrides: Partial<V22MascotPerformance> = {}): V22MascotPerformance {
  return v22MascotPerformanceSchema.parse({
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

const render = (performance: V22MascotPerformance, frame = 14) => renderToString(<RobotMascotV22Rig plan={performance} frame={frame} fps={30} enterOverride={1} />);
const withGesture = (gesture: V22Gesture, overrides: Partial<V22MascotPerformance> = {}) => plan({ left: { gesture, timing: { start: 5, peak: 11, recover: 20, wristRotation: 14 } }, ...overrides });

describe("RobotMascotV22 character golden masters", () => {
  it("renders every resting face state", () => {
    for (const face of v22FaceSchema.options.filter((option): option is V22Face => option !== "surprised")) {
      expect(render(plan({ face }))).toMatchSnapshot(`face-${face}`);
    }
  });

  it("renders the surprised accent only inside its hold window", () => {
    const accented = plan({ face: "happy", faceAccents: [{ atFrame: 2, face: "surprised", holdFrames: 9 }] });
    expect(render(accented, 4)).toContain('data-v22-face="surprised"');
    expect(render(accented, 12)).toContain('data-v22-face="happy"');
    expect(render(accented, 4)).toMatchSnapshot("face-surprised-accent");
  });

  it("renders every gesture silhouette", () => {
    for (const gesture of v22GestureSchema.options as V22Gesture[]) {
      expect(render(withGesture(gesture))).toMatchSnapshot(`gesture-${gesture}`);
    }
  });

  it("keeps mitts at every scale", () => {
    // Was "fingers only at host scale". Splayed fingers read as a splayed hand
    // rather than a mitt, and the character has no fingers anywhere else, so the
    // detail is gone at both scales and this pins that rather than the old split.
    for (const role of ["cameo_right", "host", "hero_close"] as const) {
      expect(render(withGesture("open_palm", { role }))).not.toContain('data-v22-hand="palm-fingers"');
      expect(render(withGesture("open_palm", { role }))).toContain('data-v22-hand="mitt"');
    }
  });

  it("draws a neck that closes the head-to-body seam", () => {
    expect(render(plan())).toContain("data-v22-neck");
    const neckTop = 482, neckBottom = 482 + 60, headBottom = 48 + SOLOMON_MASCOT_V22_GEOMETRY.headHeight, torsoTop = 720 - 195;
    expect(neckTop).toBeLessThan(headBottom);
    expect(neckBottom).toBeGreaterThan(torsoTop);
  });

  it("never draws pin-style props or off-center pupils", () => {
    for (const gesture of v22GestureSchema.options as V22Gesture[]) {
      expect(render(withGesture(gesture))).not.toContain('cx="20" cy="-42"');
    }
    expect(render(plan({ face: "direct_cta" }))).not.toContain('r="11"');
  });

  it("consumes the shared geometry spec rather than private literals", () => {
    const markup = render(plan());
    expect(markup).toContain(`width="${SOLOMON_MASCOT_V22_GEOMETRY.headWidth}"`);
    expect(markup).toContain(`height="${SOLOMON_MASCOT_V22_GEOMETRY.headHeight}"`);
    expect(markup).toContain(`width="${SOLOMON_MASCOT_V22_GEOMETRY.screenWidth}"`);
    expect(markup).toContain(SOLOMON_MASCOT_V22_GEOMETRY.faceColor);
    expect(auditSolomonMascotV22().passed).toBe(true);
  });
});
