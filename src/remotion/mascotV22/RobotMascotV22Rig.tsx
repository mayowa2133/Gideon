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
  const lean = plan.torso.lean * 10 * (.35 + .65 * Math.max(leftAmount, rightAmount)), recoil = plan.torso.recoil * ramp(frame, [0, 8, 18], [0, 1, 0]) * 12;
  // No per-frame jitter term. Through V20 this carried `uneven(seed+31,frame,.09)*.45`,
  // which changed the angle by ~0.02 deg every single frame. Because transformOrigin
  // sits at the torso centre, the head — ~455 units from that pivot — was dragged
  // ~0.22px per frame while the torso barely moved, which is why the head in
  // particular read as staticky. Rotation is now constant once gazePath settles,
  // so a held pose produces byte-identical frames.
  const rotation = plan.torso.rotate * 4 + torsoGaze.dx * 2.2;
  const layout = positioning === "external" ? { left: 0, top: 0 } : roleLayout(plan.role);
  // Whole units: the antenna is a small high-contrast amber disc, and a radius or
  // centre that slides sub-pixel every frame crawls exactly like the face did.
  const antenna = Math.round(audio.onset * 9 + phraseBeat * 3);
  const handDetail: HandDetail = plan.role === "cameo_left" || plan.role === "cameo_right" ? "mitt" : "full";
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
    <svg viewBox="0 0 660 940" width="660" height="940" style={{ overflow: "visible", filter: "drop-shadow(0 34px 45px rgba(3,9,20,.24))" }}>
      <defs>
        <linearGradient id={`${plan.sceneId}-body`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset=".56" stopColor="#edf3f8" /><stop offset="1" stopColor="#b9c8d7" /></linearGradient>
        <linearGradient id={`${plan.sceneId}-shell`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset=".46" stopColor="#eef4fa" /><stop offset="1" stopColor="#bac9d8" /></linearGradient>
        <radialGradient id={`${plan.sceneId}-gloss`} cx="24%" cy="12%" r="76%"><stop stopColor="#fff" stopOpacity=".96" /><stop offset=".42" stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#7f93a8" stopOpacity=".22" /></radialGradient>
      </defs>
      <Torso id={plan.sceneId} />
      <rect data-v22-neck x="290" y="482" width="80" height="60" rx="26" fill={`url(#${plan.sceneId}-body)`} stroke="#fff" strokeWidth="6" />
      <Arm side="left" gesture={plan.left.gesture} amount={leftAmount} wristRotation={plan.left.timing.wristRotation} detail={handDetail} />
      <Arm side="right" gesture={plan.right.gesture} amount={rightAmount} wristRotation={plan.right.timing.wristRotation} detail={handDetail} />
      <g transform={`translate(330 250) rotate(${plan.head.tilt * 7 + headGaze.dy * 2 + phraseBeat * 1.5}) translate(-330 -250)`}>
        <rect x={330 - HEAD_W / 2} y="48" width={HEAD_W} height={HEAD_H} rx="170" fill={`url(#${plan.sceneId}-shell)`} stroke="#fff" strokeWidth="10" />
        <rect x="40" y="66" width="580" height="420" rx="150" fill={`url(#${plan.sceneId}-gloss)`} />
        <path d="M68 126 Q154 72 250 84" fill="none" stroke="#fff" strokeOpacity=".84" strokeWidth="24" strokeLinecap="round" />
        <rect x={330 - SCREEN_W / 2} y="112" width={SCREEN_W} height={SCREEN_H} rx={SCREEN_R} fill={INK} />
        <path d="M102 154 Q162 120 232 128" fill="none" stroke="#42546a" strokeOpacity=".42" strokeWidth="12" strokeLinecap="round" />
        <Face face={face} gazeX={gaze.dx * 28} gazeY={gaze.dy * 13} blink={blink} />
        <Mouth state={mouth} />
        <rect x="294" y="18" width="72" height="52" rx="26" fill="#d4dce6" />
        <rect x="319" y={-4 - antenna * .22} width="22" height={35 + antenna * .22} rx="11" fill="#92a6bb" />
        <circle cx="330" cy={-13 - antenna} r={18 + audio.onset * 2} fill={AMBER} style={{ filter: "drop-shadow(0 0 10px rgba(255,157,24,.65))" }} />
      </g>
    </svg>
  </div>;
};

type HandDetail = "full" | "mitt";

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

const Face: React.FC<{ face: V22Face; gazeX: number; gazeY: number; blink: number }> = ({ face, gazeX, gazeY, blink }) => {
  const transform = `translate(${gazeX} ${gazeY}) scale(1 ${blink})`, origin = "330px 270px";
  const glow = { filter: "drop-shadow(0 0 15px rgba(57,242,181,.9))" };
  if (face === "surprised") return <g transform={transform} style={{ transformOrigin: origin, ...glow }}><circle cx="206" cy="270" r="66" fill={MINT} /><circle cx="454" cy="270" r="66" fill={MINT} /><circle cx="206" cy="270" r="24" fill="#baffea" /><circle cx="454" cy="270" r="24" fill="#baffea" /></g>;
  if (face === "focused") return <g transform={transform} style={{ transformOrigin: origin, ...glow }}><path d="M140 245 Q205 216 270 248 L262 284 Q205 260 148 280Z" fill={MINT} /><path d="M390 248 Q455 216 520 245 L512 280 Q455 260 398 284Z" fill={MINT} /></g>;
  if (face === "concerned") return <g transform={transform} style={{ transformOrigin: origin, ...glow }}><path d="M142 278 Q205 224 270 263 L262 298 Q205 274 148 300Z" fill={MINT} /><path d="M390 263 Q455 224 518 278 L512 300 Q455 274 398 298Z" fill={MINT} /></g>;
  if (face === "skeptical") return <g transform={transform} style={{ transformOrigin: origin, ...glow }}><path d="M142 255 Q205 219 270 254 L264 290 Q205 269 148 291Z" fill={MINT} /><path d="M394 275 Q455 250 514 270 L510 299 Q455 286 400 301Z" fill={MINT} /></g>;
  if (face === "wink") return <g transform={transform} style={{ transformOrigin: origin, ...glow }}><path d="M142 278 Q206 216 270 278 L270 298 L142 298Z" fill={MINT} /><path d="M394 282 Q454 310 516 282" fill="none" stroke={MINT} strokeWidth="15" strokeLinecap="round" /></g>;
  if (face === "happy") return <g transform={transform} style={{ transformOrigin: origin, ...glow }}><path d="M140 286 Q206 216 272 286 Q206 268 140 286Z" fill={MINT} /><path d="M388 286 Q454 216 520 286 Q454 268 388 286Z" fill={MINT} /></g>;
  if (face === "direct_cta") return <g transform={transform} style={{ transformOrigin: origin, ...glow }}><path d="M140 276 A66 67 0 0 1 272 276 L272 298 L140 298Z" fill={MINT} /><path d="M388 276 A66 67 0 0 1 520 276 L520 298 L388 298Z" fill={MINT} /></g>;
  return <g transform={transform} style={{ transformOrigin: origin, ...glow }}><path d="M142 278 A64 68 0 0 1 270 278 L270 298 L142 298Z" fill={MINT} /><path d="M390 278 A64 68 0 0 1 518 278 L518 298 L390 298Z" fill={MINT} /></g>;
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

const Arm: React.FC<{ side: "left" | "right"; gesture: V22Gesture; amount: number; wristRotation: number; detail: HandDetail }> = ({ side, gesture, amount, wristRotation, detail }) => {
  const sign = side === "left" ? -1 : 1, shoulderX = side === "left" ? 120 : 540;
  const target = gestureTarget(gesture, side), elbowX = shoulderX + sign * ramp(amount, [0, 1], [28, target.dx * .48]), elbowY = 650 + ramp(amount, [0, 1], [70, target.dy * .48]);
  const handX = shoulderX + sign * ramp(amount, [0, 1], [60, target.dx]), handY = 760 + ramp(amount, [0, 1], [20, target.dy]);
  return <g data-v22-gesture={`${side}-${gesture}`}>
    <path d={`M${shoulderX} 625 Q${elbowX} ${elbowY} ${handX} ${handY}`} fill="none" stroke="#e6eef5" strokeWidth="70" strokeLinecap="round" />
    <g transform={`translate(${handX} ${handY}) rotate(${sign * wristRotation * amount})`}><HandShape gesture={gesture} side={side} detail={detail} /></g>
  </g>;
};

const HandShape: React.FC<{ gesture: V22Gesture; side: "left" | "right"; detail: HandDetail }> = ({ gesture, side, detail }) => {
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
    if (detail === "mitt") return <g transform={`rotate(${rotate})`} data-v22-hand="mitt"><ellipse rx="52" ry="56" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7" /></g>;
    return <g transform={`rotate(${rotate})`} data-v22-hand="palm-fingers"><ellipse rx="52" ry="56" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7" />{[-34, -12, 12, 34].map((x, index) => <path key={x} d={`M${x} -32 L${x + (index - 1.5) * 3} -${82 - Math.abs(index - 1.5) * 8}`} stroke="#f8fbfd" strokeWidth="18" strokeLinecap="round" />)}</g>;
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
const GESTURE_REACH=0.62;
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
