import { SOLOMON_MASCOT_V22_GEOMETRY, sampleMascotAudioV22, type V22Face, type V22Gesture, type V22MascotPerformance, type V22Mouth } from "../../shared/solomonMascotV22";

// Palette and key dimensions come from the shared geometry spec so the renderer
// and the character audit can never drift apart silently.
const { faceColor: MINT, visorColor: INK, orangeAccent: AMBER, headWidth: HEAD_W, headHeight: HEAD_H, screenWidth: SCREEN_W, screenHeight: SCREEN_H, screenCornerRadius: SCREEN_R } = SOLOMON_MASCOT_V22_GEOMETRY;

// Piecewise linear ramp with clamped ends. Local rather than Remotion's
// interpolate so the rig stays a dependency-free pure function.
function ramp(value: number, input: number[], output: number[]) {
  if (value <= input[0]!) return output[0]!;
  const last = input.length - 1;
  if (value >= input[last]!) return output[last]!;
  for (let index = 1; index <= last; index += 1) {
    if (value <= input[index]!) {
      const span = input[index]! - input[index - 1]!;
      const progress = span === 0 ? 1 : (value - input[index - 1]!) / span;
      return output[index - 1]! + (output[index]! - output[index - 1]!) * progress;
    }
  }
  return output[last]!;
}

// Critically damped approach used for the default entrance, matching the shape
// of the spring the composition previously applied per scene.
function entranceCurve(frame: number, durationInFrames: number) {
  if (frame <= 0) return 0;
  if (frame >= durationInFrames) return 1;
  const progress = frame / durationInFrames;
  return 1 - (1 - progress) ** 3;
}

// Pure function of props — no Remotion hooks — so snapshot tests and the
// persistent mascot layer can drive it from any frame source.
// `positioning: "external"` hands placement to the persistent MascotLayer, which
// owns the anchor and scale. Without it the rig's own roleLayout compounds with
// the layer's transform and the mascot lands mid-frame over the product proof.
export const RobotMascotV22Rig: React.FC<{ plan: V22MascotPerformance; frame: number; fps?: number; enterOverride?: number; positioning?: "self" | "external"; pixelScale?: number }> = ({ plan, frame, enterOverride, positioning = "self", pixelScale = 1 }) => {
  if (plan.role === "absent") return null;
  const enter = enterOverride ?? entranceCurve(frame, 13);
  const leftAmount = limbCurve(frame, plan.left.timing), rightAmount = limbCurve(frame, plan.right.timing);
  const gaze = gazeAt(plan, frame), headGaze = gazeAt(plan, Math.max(0, frame - 3)), torsoGaze = gazeAt(plan, Math.max(0, frame - 6));
  const face = activeFace(plan, frame);
  const audio = sampleMascotAudioV22(plan.audioFrames, frame), mouth = mouthFor(face, plan.mouthBias, audio);
  const blink = blinkScale(frame, plan.blinkFrames, face), phraseBeat = plan.head.beats.reduce((sum, beat) => sum + Math.max(0, 1 - Math.abs(frame - beat) / 5), 0);
  // Anticipation: dip slightly away from the target in the frames before the
  // reach, then swing through. Straight-to-target is what makes a rig read as a
  // diagram rather than a character.
  const anticipate = (timing:{start:number;peak:number}) => -Math.max(0, 1 - Math.abs(frame - (timing.start + (timing.peak - timing.start) * .35)) / 4) * .18;
  const leftAnticipation = anticipate(plan.left.timing), rightAnticipation = anticipate(plan.right.timing);
  const lean = plan.torso.lean * 16 * (.35 + .65 * Math.max(leftAmount, rightAmount)), recoil = plan.torso.recoil * ramp(frame, [0, 8, 18], [0, 1, 0]) * 18;
  // No per-frame jitter term. Through V20 this carried `uneven(seed+31,frame,.09)*.45`,
  // which changed the angle by ~0.02 deg every single frame. Because transformOrigin
  // sits at the torso centre, the head — ~455 units from that pivot — was dragged
  // ~0.22px per frame while the torso barely moved, which is why the head in
  // particular read as staticky. Rotation is now constant once gazePath settles,
  // so a held pose produces byte-identical frames.
  const rotation = plan.torso.rotate * 7 + torsoGaze.dx * 3.4;
  const layout = positioning === "external" ? { left: 0, top: 0 } : roleLayout(plan.role);
  // Whole units: the antenna is a small high-contrast amber disc, and a radius or
  // centre that slides sub-pixel every frame crawls exactly like the face did.
  const antenna = Math.round(audio.onset * 9 + phraseBeat * 3);
  // The idle float is gone from here: MascotLayer applies it as whole-pixel
  // left/top, which is the only place in the tree that positions in unscaled
  // canvas space. Rounding it inside this element would be undone by the layer's
  // scale() parent.
  //
  // What remains — the gesture lean and the entrance recoil — is deliberate
  // character motion, but `lean` is scaled by limbCurve, which eases continuously,
  // so it slid the whole rig by ~0.2-0.3px per frame for the length of every
  // gesture. Too small to see as movement, large enough to shimmer every edge.
  // The first V22 decoded measurement caught it: the head crown was still failing
  // to produce a single byte-identical frame pair even after the hover was gone.
  //
  // This element sits inside the layer's scale(), so rounding has to happen in
  // device space — hence pixelScale. Rounding the local value would leave the
  // composed position fractional again, which is the same mistake in a new place.
  const snap = (value: number) => Math.round(value * pixelScale) / pixelScale;
  return <div data-v22-mascot={plan.sceneId} data-v22-face={face} data-v22-left={plan.left.gesture} data-v22-right={plan.right.gesture} style={{ position: "absolute", width: 660, height: 940, zIndex: 32, ...layout, opacity: enter, transform: `${layout.transform ?? ""} translate(${snap(torsoGaze.dx * lean)}px,${snap((1 - enter) * 50 - recoil)}px) rotate(${rotation}deg)`, transformOrigin: "50% 78%" }}>
    {/* No drop-shadow on this element. A 45px blur over the whole 660x940 rig was
        the most expensive raster in the film, and Chrome rasterizes filtered
        layers asynchronously: renderMedia intermittently captured a frame before
        it landed, and the entire mascot was missing for that one frame. Two to
        ten such dropouts appeared per 1155-frame master, in different places each
        run; each is a ~10%-of-frame change out and straight back in, which the
        scene detector scores as cuts, so the shot count moved between identical
        renders. renderStill draws those same frames correctly, so the
        composition was never wrong -- only its rasterization was racy. The
        shadow is now a gradient-filled ellipse: same soft falloff, no filter. */}
    <svg viewBox="0 0 660 940" width="660" height="940" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`${plan.sceneId}-cast`} cx="50%" cy="50%" r="50%"><stop stopColor="#030914" stopOpacity=".30" /><stop offset=".55" stopColor="#030914" stopOpacity=".17" /><stop offset="1" stopColor="#030914" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${plan.sceneId}-body`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset=".56" stopColor="#edf3f8" /><stop offset="1" stopColor="#b9c8d7" /></linearGradient>
        <linearGradient id={`${plan.sceneId}-shell`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset=".46" stopColor="#eef4fa" /><stop offset="1" stopColor="#bac9d8" /></linearGradient>
        <radialGradient id={`${plan.sceneId}-gloss`} cx="24%" cy="12%" r="76%"><stop stopColor="#fff" stopOpacity=".96" /><stop offset=".42" stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#7f93a8" stopOpacity=".22" /></radialGradient>
      </defs>
      {/* Replaces the removed drop-shadow: sits under the body, offset down, and
          falls off through the gradient instead of a blur pass. */}
      <ellipse data-v22-cast-shadow cx="330" cy="852" rx="300" ry="96" fill={`url(#${plan.sceneId}-cast)`} />
      <Torso id={plan.sceneId} />
      <rect data-v22-neck x="290" y="482" width="80" height="60" rx="26" fill={`url(#${plan.sceneId}-body)`} stroke="#fff" strokeWidth="6" />
      <Arm side="left" gesture={plan.left.gesture} amount={Math.max(-.2,leftAmount+leftAnticipation)} wristRotation={plan.left.timing.wristRotation} />
      <Arm side="right" gesture={plan.right.gesture} amount={Math.max(-.2,rightAmount+rightAnticipation)} wristRotation={plan.right.timing.wristRotation} />
      <g transform={`translate(330 250) rotate(${plan.head.tilt * 12 + headGaze.dy * 3.4 + phraseBeat * 3}) translate(-330 -250)`}>
        <rect x={330 - HEAD_W / 2} y="48" width={HEAD_W} height={HEAD_H} rx="170" fill={`url(#${plan.sceneId}-shell)`} stroke="#fff" strokeWidth="10" />
        <rect x="40" y="66" width="580" height="420" rx="150" fill={`url(#${plan.sceneId}-gloss)`} />
        <path d="M68 126 Q154 72 250 84" fill="none" stroke="#fff" strokeOpacity=".84" strokeWidth="24" strokeLinecap="round" />
        <rect x={330 - SCREEN_W / 2} y="112" width={SCREEN_W} height={SCREEN_H} rx={SCREEN_R} fill={INK} />
        <path d="M102 154 Q162 120 232 128" fill="none" stroke="#42546a" strokeOpacity=".42" strokeWidth="12" strokeLinecap="round" />
        <Face face={face} gazeX={gaze.dx * 28} gazeY={gaze.dy * 13} blink={blink} beat={phraseBeat} />
        <Mouth state={mouth} />
        <rect x="294" y="18" width="72" height="52" rx="26" fill="#d4dce6" />
        <rect x="319" y={-4 - antenna * .22} width="22" height={35 + antenna * .22} rx="11" fill="#92a6bb" />
        <circle cx="330" cy={-13 - antenna} r={18 + audio.onset * 2} fill={AMBER} style={{ filter: "drop-shadow(0 0 10px rgba(255,157,24,.65))" }} />
      </g>
    </svg>
  </div>;
};

function activeFace(plan: V22MascotPerformance, frame: number): V22Face {
  for (const accent of plan.faceAccents ?? []) {
    if (frame >= accent.atFrame && frame < accent.atFrame + accent.holdFrames) return accent.face;
  }
  return plan.face;
}

const Torso: React.FC<{ id: string }> = ({ id }) => <g>
  <ellipse cx="330" cy="720" rx="255" ry="195" fill={`url(#${id}-body)`} stroke="#fff" strokeWidth="10" />
  <ellipse cx="330" cy="865" rx="94" ry="14" fill={AMBER} />
  <path d="M150 650 Q185 558 270 540" fill="none" stroke="#fff" strokeOpacity=".86" strokeWidth="22" strokeLinecap="round" />
  <circle cx="330" cy="705" r="39" fill={INK} /><text x="330" y="720" textAnchor="middle" fill={MINT} fontFamily="Manrope" fontWeight="900" fontSize="43">S</text>
  <ellipse cx="330" cy="910" rx="190" ry="24" fill="#07111f" opacity=".18" />
</g>;

// Expression, rebuilt so it survives being watched rather than inspected.
//
// Every face used to be two mint shapes of the same size in the same place, and
// at the size a phone renders this rig, `happy`, `focused` and `friendly` were
// indistinguishable -- seven declared expressions reading as one. The SVG diffed
// fine, which is exactly why no snapshot caught it: distinctness in the markup is
// not distinctness on screen.
//
// Three levers do the work, in order of how much they carry at small size:
// brows (present or absent, and at what angle), eye shape (round vs closed arc vs
// slit), and asymmetry. All three are silhouette, which is what survives being
// scaled down to a phone -- and silhouette is all this face has, deliberately.
const BROW_Y = 194, EYE_Y = 262, EYE_L = 206, EYE_R = 454;
const Brow: React.FC<{ cx: number; angle: number; y?: number; thickness?: number }> = ({ cx, angle, y = BROW_Y, thickness = 20 }) =>
  <rect x={cx - 66} y={y - thickness / 2} width="132" height={thickness} rx={thickness / 2} fill={MINT} transform={`rotate(${angle} ${cx} ${y})`} />;
// Deliberately no pupil. One was tried, and it does two useful things -- it gives
// gaze something to read on, and it stops a large open eye reading as a blob --
// but it turns the character into a cartoon creature instead of a screen with a
// face on it, which is not what this mascot is. Brow angle and eye silhouette
// carry the expression, and they carry it further than the pupil did.
const EyeRound: React.FC<{ cx: number; rx: number; ry: number }> = ({ cx, rx, ry }) => <ellipse cx={cx} cy={EYE_Y} rx={rx} ry={ry} fill={MINT} />;
// A closed eye is a stroke, not a filled crescent: the crescent read as a squint
// at distance, which is the shape `focused` needs to own.
const EyeArc: React.FC<{ cx: number; lift: number }> = ({ cx, lift }) =>
  <path d={`M${cx - 64} ${EYE_Y + 26} Q${cx} ${EYE_Y + 26 - lift} ${cx + 64} ${EYE_Y + 26}`} fill="none" stroke={MINT} strokeWidth="24" strokeLinecap="round" />;
const EyeSlit: React.FC<{ cx: number; ry: number; angle: number }> = ({ cx, ry, angle }) =>
  <rect x={cx - 64} y={EYE_Y - ry} width="128" height={ry * 2} rx={ry} fill={MINT} transform={`rotate(${angle} ${cx} ${EYE_Y})`} />;

const Face: React.FC<{ face: V22Face; gazeX: number; gazeY: number; blink: number; beat: number }> = ({ face, gazeX, gazeY, blink, beat }) => {
  const transform = `translate(${gazeX} ${gazeY}) scale(1 ${blink})`, origin = "330px 262px";
  const glow = { filter: "drop-shadow(0 0 15px rgba(57,242,181,.9))" };
  // Brows lift on the phrase beats the head already nods to.
  const lift = -Math.min(1, beat) * 7;
  const wrap = (children: React.ReactNode) => <g transform={transform} style={{ transformOrigin: origin, ...glow }}>{children}</g>;
  if (face === "surprised") return wrap(<>
    <Brow cx={EYE_L} angle={-6} y={BROW_Y - 30 + lift} thickness={18} /><Brow cx={EYE_R} angle={6} y={BROW_Y - 30 + lift} thickness={18} />
    <EyeRound cx={EYE_L} rx={68} ry={70} /><EyeRound cx={EYE_R} rx={68} ry={70} />
  </>);
  if (face === "focused") return wrap(<>
    <Brow cx={EYE_L} angle={13} y={BROW_Y - 16 + lift} /><Brow cx={EYE_R} angle={-13} y={BROW_Y - 16 + lift} />
    <EyeSlit cx={EYE_L} ry={17} angle={4} /><EyeSlit cx={EYE_R} ry={17} angle={-4} />
  </>);
  if (face === "concerned") return wrap(<>
    <Brow cx={EYE_L} angle={-15} y={BROW_Y + 2 + lift} /><Brow cx={EYE_R} angle={15} y={BROW_Y + 2 + lift} />
    <EyeRound cx={EYE_L} rx={54} ry={58} /><EyeRound cx={EYE_R} rx={54} ry={58} />
  </>);
  // Asymmetry is the most legible expression there is at this size, so scepticism
  // gets it outright: one eye narrowed under a flat brow, one open under a raised one.
  if (face === "skeptical") return wrap(<>
    <Brow cx={EYE_L} angle={7} y={BROW_Y + 12 + lift} /><Brow cx={EYE_R} angle={-4} y={BROW_Y - 26 + lift} />
    <EyeSlit cx={EYE_L} ry={15} angle={5} /><EyeRound cx={EYE_R} rx={58} ry={62} />
  </>);
  if (face === "wink") return wrap(<>
    <EyeArc cx={EYE_L} lift={70} />
    <Brow cx={EYE_R} angle={-5} y={BROW_Y - 22 + lift} />
    <EyeRound cx={EYE_R} rx={62} ry={66} />
  </>);
  if (face === "happy") return wrap(<>
    <EyeArc cx={EYE_L} lift={78} /><EyeArc cx={EYE_R} lift={78} />
    <circle cx={EYE_L - 78} cy={EYE_Y + 74} r="15" fill={MINT} opacity=".45" /><circle cx={EYE_R + 78} cy={EYE_Y + 74} r="15" fill={MINT} opacity=".45" />
  </>);
  // Level brows sitting low, and the largest pupils in the set: the CTA looks
  // straight down the lens. The old version drew r="11" dots off-centre, which is
  // the V10 regression the rig test still pins.
  if (face === "direct_cta") return wrap(<>
    <Brow cx={EYE_L} angle={0} y={BROW_Y - 26 + lift} thickness={22} /><Brow cx={EYE_R} angle={0} y={BROW_Y - 26 + lift} thickness={22} />
    <EyeRound cx={EYE_L} rx={64} ry={68} /><EyeRound cx={EYE_R} rx={64} ry={68} />
  </>);
  return wrap(<>
    <EyeRound cx={EYE_L} rx={60} ry={64} /><EyeRound cx={EYE_R} rx={60} ry={64} />
  </>);
};

const Mouth: React.FC<{ state: V22Mouth }> = ({ state }) => {
  const style = { filter: "drop-shadow(0 0 13px rgba(57,242,181,.9))" };
  if (state === "surprised_circle") return <ellipse cx="330" cy="360" rx="31" ry="39" fill={MINT} style={style} />;
  if (state === "concerned_curve") return <path d="M280 382 Q330 335 380 382" fill="none" stroke={MINT} strokeWidth="14" strokeLinecap="round" style={style} />;
  if (state === "neutral_dash") return <path d="M286 365 H374" stroke={MINT} strokeWidth="14" strokeLinecap="round" style={style} />;
  if (state === "thinking_wave") return <path d="M270 365 Q300 344 330 365 Q360 386 390 365" fill="none" stroke={MINT} strokeWidth="12" strokeLinecap="round" style={style} />;
  if (state === "closed_smile") return <path d="M278 352 Q330 402 382 352" fill="none" stroke={MINT} strokeWidth="14" strokeLinecap="round" style={style} />;
  if (state === "confident_smile") return <path d="M278 350 Q334 406 390 345 Q359 398 328 399 Q297 396 278 350Z" fill={MINT} style={style} />;
  const height = state === "wide_open" ? 78 : 48;
  return <path d={`M278 345 Q330 ${345 + height} 382 345 Q374 ${374 + height * .3} 330 ${381 + height * .45} Q286 ${374 + height * .3} 278 345Z`} fill={MINT} style={style} />;
};

const Arm: React.FC<{ side: "left" | "right"; gesture: V22Gesture; amount: number; wristRotation: number }> = ({ side, gesture, amount, wristRotation }) => {
  const sign = side === "left" ? -1 : 1, shoulderX = side === "left" ? 120 : 540;
  const target = gestureTarget(gesture, side), elbowX = shoulderX + sign * ramp(amount, [0, 1], [28, target.dx * .48]), elbowY = 650 + ramp(amount, [0, 1], [70, target.dy * .48]);
  const handX = shoulderX + sign * ramp(amount, [0, 1], [60, target.dx]), handY = 760 + ramp(amount, [0, 1], [20, target.dy]);
  return <g data-v22-gesture={`${side}-${gesture}`}>
    <path d={`M${shoulderX} 625 Q${elbowX} ${elbowY} ${handX} ${handY}`} fill="none" stroke="#e6eef5" strokeWidth="70" strokeLinecap="round" />
    <g transform={`translate(${handX} ${handY}) rotate(${sign * wristRotation * amount})`}><HandShape gesture={gesture} side={side} /></g>
  </g>;
};

const HandShape: React.FC<{ gesture: V22Gesture; side: "left" | "right" }> = ({ gesture, side }) => {
  const flip = side === "left" ? -1 : 1;
  // Point gestures are a single tapered wedge fused to the mitt — never a thin
  // stroke poking out of the ellipse (the V10 pin/lollipop look).
  if (gesture.startsWith("true_point")) return <g transform={`scale(${flip} 1)`} data-v22-hand="mitt-point"><ellipse rx="48" ry="48" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7" /><path d="M18 -22 L94 -54 L38 6 Z" fill="#f8fbfd" stroke="#acbed0" strokeWidth="6" strokeLinejoin="round" /></g>;
  if (gesture === "point_down" || gesture === "bookmark_tap") return <g data-v22-hand="mitt-point-down"><ellipse rx="48" ry="48" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7" /><path d="M-12 32 L10 106 L26 34 Z" fill="#f8fbfd" stroke="#acbed0" strokeWidth="6" strokeLinejoin="round" /></g>;
  if (gesture === "approval") return <g transform={`scale(${flip} 1)`} data-v22-hand="mitt-thumb"><ellipse rx="50" ry="46" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7" /><path d="M-4 -30 L40 -88 L26 -18 Z" fill="#f8fbfd" stroke="#acbed0" strokeWidth="6" strokeLinejoin="round" /></g>;
  if (gesture === "bookmark_hold") return <g data-v22-hand="bookmark"><path d="M-46 -58 H46 V64 L0 36 L-46 64Z" fill={INK} stroke={MINT} strokeWidth="9" /><ellipse cx="-52" cy="5" rx="24" ry="38" fill="#f8fbfd" stroke="#acbed0" strokeWidth="6" /><ellipse cx="52" cy="5" rx="24" ry="38" fill="#f8fbfd" stroke="#acbed0" strokeWidth="6" /></g>;
  if (gesture === "thinking_hand") return <g transform="rotate(-24)" data-v22-hand="mitt-tilt"><ellipse rx="48" ry="53" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7" /></g>;
  if (gesture === "open_palm" || gesture === "presentation_palm" || gesture === "stop_palm" || gesture === "wave" || gesture === "celebration") {
    const rotate = gesture === "presentation_palm" ? -90 : gesture === "wave" ? 18 : 0;
    // Mitts at every scale. Splayed fingers were kept for host scale and only
    // suppressed at cameo, on the theory that the detail was worth having when
    // the rig was large -- it is not. Four strokes fanning off an ellipse read as
    // a splayed hand rather than a mitt, and the character does not have fingers
    // anywhere else. This also retires the V10 sausage-finger loop for good.
    return <g transform={`rotate(${rotate})`} data-v22-hand="mitt"><ellipse rx="52" ry="56" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7" /></g>;
  }
  return <ellipse rx="52" ry="54" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7" data-v22-hand="rest" />;
};

// Gesture reach, damped for presenter scale.
//
// These offsets were tuned when the mascot was a 7.2% corner cameo. V22 puts it at
// 14% in a split layout, which doubles the absolute pixels an arm sweeps for the
// same relative reach — and a sweep that large, that fast, crosses ffmpeg's 0.10
// scene threshold. Measured directly: every phantom cut in the V22 master sat in
// the bottom-centre of the frame (per-region deltas of 74-107 exactly where the rig
// is) and inside an active limb window.
//
// So the gestures were reading as edits. Damping the reach restores roughly the
// absolute motion the cameo produced, keeping the gesture legible without it
// registering as a cut. Duration is untouched: slowing the swing would change the
// performance, where shortening the reach only changes how far the hand travels.
// .62 was V21's damping, added while chasing sub-pixel drift. The real fix for
// that was the device-space snapping below, which stays; the damping was left
// behind and is what made the presenter read as static. Raised for reach --
// still short of 1.0 so hands stay inside the rig box and the antenna clears.
const GESTURE_REACH=0.92;
function scaleReach(target:{dx:number;dy:number}){return{dx:target.dx*GESTURE_REACH,dy:target.dy*GESTURE_REACH};}
function gestureTarget(gesture: V22Gesture, side: "left" | "right") {
  if (gesture === "celebration" || gesture === "wave") return scaleReach({ dx: 145, dy: -250 });
  if (gesture === "stop_palm") return scaleReach({ dx: 150, dy: -180 });
  if (gesture === "thinking_hand") return scaleReach({ dx: side === "left" ? -110 : 110, dy: -250 });
  if (gesture === "point_down" || gesture === "bookmark_tap") return scaleReach({ dx: 95, dy: 40 });
  if (gesture === "bookmark_hold") return scaleReach({ dx: 110, dy: -45 });
  if (gesture.startsWith("true_point")) return scaleReach({ dx: 175, dy: -155 });
  if (gesture === "presentation_palm" || gesture === "open_palm" || gesture === "approval") return scaleReach({ dx: 140, dy: -105 });
  return scaleReach({ dx: 60, dy: 20 });
}
function limbCurve(frame: number, timing: V22MascotPerformance["left"]["timing"]) { if (frame <= timing.start) return 0; if (frame <= timing.peak) return ease((frame - timing.start) / (timing.peak - timing.start)); if (frame >= timing.recover) return 0; return 1 - ease((frame - timing.peak) / (timing.recover - timing.peak)); }
function ease(value: number) { return value * value * (3 - 2 * value); }
function gazeAt(plan: V22MascotPerformance, frame: number) { const prior = [...plan.gazePath].filter((item) => item.frame <= frame).at(-1) ?? plan.gazePath[0]!, next = plan.gazePath.find((item) => item.frame > frame) ?? prior, p = next.frame === prior.frame ? 1 : Math.min(1, (frame - prior.frame) / (next.frame - prior.frame)); const x = prior.x + (next.x - prior.x) * p, y = prior.y + (next.y - prior.y) * p; return scaleReach({ dx: (x - .5) * 2, dy: (y - .4) * 2 }); }
function mouthFor(face: V22Face, bias: V22Mouth, audio: ReturnType<typeof sampleMascotAudioV22>): V22Mouth { if (!audio.speaking) return bias; if (face === "surprised" && audio.onset > .45) return "surprised_circle"; if (face === "concerned") return audio.rms > .45 ? "small_open" : "concerned_curve"; if (face === "skeptical" && audio.rms < .32) return "thinking_wave"; if (audio.onset > .55 || audio.rms > .62) return "wide_open"; return audio.rms > .3 ? "small_open" : bias; }
function blinkScale(frame: number, blinkFrames: number[], face: V22Face) { if (face === "surprised") return 1; const distance = Math.min(...blinkFrames.map((beat) => Math.abs(frame - beat)), 999); return distance === 0 ? .07 : distance === 1 ? .26 : 1; }
// `uneven` and `hash` moved to solomonMascotV22 as unevenV22/mascotIdleSeed, where
// mascotIdleFloat quantizes their output. They are deliberately not re-exported
// here: an unquantized sine reaching a transform is the defect V22 exists to fix.
function roleLayout(role: V22MascotPerformance["role"]): React.CSSProperties { if (role === "hero_close") return { left: 210, top: 320, transform: "scale(1.12)" }; if (role === "cameo_left") return { left: -128, bottom: -68, transform: "scale(.48)" }; if (role === "cameo_right") return { right: -128, bottom: -68, transform: "scale(.48)" }; return { left: 210, top: 420, transform: "scale(1)" }; }
