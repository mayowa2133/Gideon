import type { CSSProperties } from "react";
import { Audio, Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import type {
  BenchmarkAvatarState,
  BenchmarkCaptionGroup,
  BenchmarkScene,
  SolomonCreatorBenchmarkManifest
} from "../../shared/solomonCreatorBenchmark";
import { benchmarkAvatarMotionSample } from "../../shared/solomonCreatorBenchmark";

const INK = "#07111f";
const PAPER = "#f5f3ed";
const GREEN = "#0b6b4b";
const MINT = "#45e0b3";
const AMBER = "#ffbc57";
const RED = "#ff635f";
const WHITE = "#ffffff";
const SAFE_X = 58;

export const SolomonCreatorBenchmark: React.FC<SolomonCreatorBenchmarkManifest> = (manifest) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: INK, color: WHITE, fontFamily: "Arial, Helvetica, sans-serif", overflow: "hidden" }}>
      <Background frame={frame} />
      {manifest.scenes.map((scene) => (
        <Sequence key={scene.id} name={`${scene.narrativeFunction}: ${scene.id}`} from={scene.from} durationInFrames={scene.to - scene.from} premountFor={30}>
          <Scene scene={scene} manifest={manifest} />
        </Sequence>
      ))}
      {manifest.captions.map((caption) => (
        <Sequence key={caption.id} name={caption.id} from={caption.from} durationInFrames={caption.to - caption.from} premountFor={15}>
          <KineticCaption caption={caption} />
        </Sequence>
      ))}
      <Sequence name="Chatterbox narration" premountFor={30}>
        <Audio src={staticFile("narration.wav")} volume={1} />
      </Sequence>
      <Sequence name="Original procedural sound design" premountFor={30}>
        <Audio src={staticFile("sound-design.wav")} volume={1} />
      </Sequence>
      <SafeFrame />
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ scene: BenchmarkScene; manifest: SolomonCreatorBenchmarkManifest }> = ({ scene, manifest }) => {
  if (scene.narrativeFunction === "hook") return <HookScene state={scene.avatarState!} />;
  if (scene.narrativeFunction === "tension") return <TensionScene state={scene.avatarState!} />;
  if (scene.narrativeFunction === "proof") return <ProofScene state={scene.avatarState!} manifest={manifest} />;
  if (scene.narrativeFunction === "payoff") return <PayoffScene state={scene.avatarState!} />;
  return <CtaScene state={scene.avatarState!} manifest={manifest} />;
};

const HookScene: React.FC<{ state: BenchmarkAvatarState }> = ({ state }) => {
  const frame = useCurrentFrame();
  const entrance = spring({ frame, fps: 30, config: { damping: 18, stiffness: 130, mass: 0.7 }, durationInFrames: 18 });
  const outcome = interpolate(frame, [34, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 38%, #18365d 0%, #07111f 66%)" }}>
      <div style={{ position: "absolute", top: 82, left: SAFE_X, fontSize: 27, letterSpacing: 7, fontWeight: 800, color: MINT }}>SOLOMON / REAL RESULT</div>
      <div style={{ position: "absolute", inset: 0, opacity: entrance, transform: `translateY(${(1 - entrance) * 90}px) scale(${0.92 + entrance * 0.08})` }}>
        <Avatar state={state} framing="close" />
      </div>
      <div style={{
        position: "absolute", left: 90, right: 90, bottom: 205, height: 10, borderRadius: 8,
        background: `linear-gradient(90deg, ${MINT} ${outcome * 100}%, rgba(255,255,255,.14) ${outcome * 100}%)`,
        boxShadow: outcome > 0.2 ? `0 0 36px rgba(69,224,179,${outcome * 0.55})` : "none"
      }} />
    </AbsoluteFill>
  );
};

const TensionScene: React.FC<{ state: BenchmarkAvatarState }> = ({ state }) => {
  const frame = useCurrentFrame();
  const split = interpolate(frame, [0, 10, 24, 35], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  const resolve = interpolate(frame, [24, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(145deg, #1d1118, ${INK})` }}>
      <div style={{ position: "absolute", top: 78, left: SAFE_X, padding: "12px 18px", border: `2px solid ${RED}`, borderRadius: 999, fontSize: 24, letterSpacing: 3, fontWeight: 800, color: RED }}>
        CONCEPTUAL TENSION
      </div>
      <div style={{
        position: "absolute", top: 285, left: 84 - split * 54, width: 430, height: 250, borderRadius: 34,
        border: "2px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.05)", transform: `rotate(${-5 * split}deg)`
      }}>
        <div style={{ padding: 34, fontSize: 32, color: "rgba(255,255,255,.58)", fontWeight: 700 }}>STATUS CHANGED</div>
        <div style={{ margin: "12px 34px", height: 12, borderRadius: 9, background: RED, opacity: 0.65 }} />
      </div>
      <div style={{
        position: "absolute", top: 345, right: 70 - split * 64, width: 380, height: 220, borderRadius: 34,
        border: `2px dashed ${resolve > 0.5 ? MINT : RED}`, background: "rgba(255,255,255,.04)", transform: `rotate(${6 * split}deg)`
      }}>
        <div style={{ padding: 34, fontSize: 32, color: resolve > 0.5 ? MINT : RED, fontWeight: 900 }}>NEXT STEP?</div>
      </div>
      <Avatar state={state} framing="close" />
    </AbsoluteFill>
  );
};

const ProofScene: React.FC<{ state: BenchmarkAvatarState; manifest: SolomonCreatorBenchmarkManifest }> = ({ state, manifest }) => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, 16, 72, 98], [0.94, 1, 1.025, 1.04], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1), output: "perceptual-scale" });
  const resolved = interpolate(frame, [54, 66], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <div style={{ position: "absolute", top: 78, left: SAFE_X, right: SAFE_X, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ padding: "13px 20px", borderRadius: 999, background: GREEN, color: WHITE, fontSize: 25, letterSpacing: 2, fontWeight: 900 }}>AUTHENTIC SOLOMON PROOF</div>
        <div style={{ color: "#45605a", fontSize: 22, fontWeight: 800 }}>ONE ACTION · ONE RESULT</div>
      </div>
      <div style={{
        position: "absolute", top: 330, left: 30, width: 1020, height: 708, overflow: "hidden", borderRadius: 36,
        background: WHITE, border: `4px solid ${resolved > 0.5 ? GREEN : "#d8d6cf"}`, boxShadow: "0 36px 90px rgba(7,17,31,.24)",
        transform: `scale(${push})`
      }}>
        <Video src={staticFile("product-proof.mp4")} muted objectFit="cover" style={{ width: "100%", height: "100%" }} />
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          boxShadow: `inset 0 0 ${resolved * 70}px rgba(69,224,179,${resolved * 0.2})`
        }} />
      </div>
      <div style={{
        position: "absolute", top: 1080, left: 52, right: 52, padding: "26px 30px", borderRadius: 28,
        background: resolved > 0.5 ? GREEN : INK, color: WHITE, boxShadow: "0 16px 48px rgba(7,17,31,.18)"
      }}>
        <div style={{ fontSize: 24, letterSpacing: 3, fontWeight: 800, color: MINT }}>VISIBLE STATE CHANGE</div>
        <div style={{ marginTop: 10, fontSize: 48, lineHeight: 1.05, fontWeight: 950 }}>APPLIED 2→1 <span style={{ color: AMBER }}>•</span> INTERVIEWING 0→1</div>
      </div>
      <div style={{ position: "absolute", right: 12, bottom: 0, width: 420, height: 650 }}>
        <Avatar state={state} framing="pip" />
      </div>
      <div style={{ position: "absolute", left: 58, bottom: 76, width: 520, color: "#51605c", fontSize: 24, lineHeight: 1.3, fontWeight: 700 }}>
        Source cursor retained only for the bounded status action.
      </div>
      <div style={{ display: "none" }}>{manifest.productProof.sourceSha256}</div>
    </AbsoluteFill>
  );
};

const PayoffScene: React.FC<{ state: BenchmarkAvatarState }> = ({ state }) => {
  const frame = useCurrentFrame();
  const pulse = spring({ frame, fps: 30, config: { damping: 14, stiffness: 120 }, durationInFrames: 24 });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${GREEN}, #07372b)` }}>
      <div style={{ position: "absolute", top: 96, left: SAFE_X, right: SAFE_X }}>
        <div style={{ fontSize: 28, letterSpacing: 5, color: MINT, fontWeight: 900 }}>PAYOFF</div>
        <div style={{ marginTop: 22, fontSize: 84, lineHeight: 0.96, fontWeight: 950, transform: `scale(${0.96 + pulse * 0.04})`, transformOrigin: "left center" }}>
          THE UPDATE<br />STAYS REVIEWABLE.
        </div>
      </div>
      <Avatar state={state} framing="medium" />
      <div style={{ position: "absolute", right: 70, bottom: 220, width: 210, height: 210, borderRadius: 999, border: `8px solid ${MINT}`, display: "grid", placeItems: "center", fontSize: 98, fontWeight: 950, transform: `scale(${pulse}) rotate(${-8 + pulse * 8}deg)` }}>✓</div>
    </AbsoluteFill>
  );
};

const CtaScene: React.FC<{ state: BenchmarkAvatarState; manifest: SolomonCreatorBenchmarkManifest }> = ({ state, manifest }) => {
  const frame = useCurrentFrame();
  const button = spring({ frame: Math.max(0, frame - 5), fps: 30, config: { damping: 16, stiffness: 150 }, durationInFrames: 20 });
  const active = 0.5 + Math.sin(frame / 7) * 0.5;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 44%, #17335d, #07111f 68%)" }}>
      <div style={{ position: "absolute", top: 82, left: SAFE_X, fontSize: 26, letterSpacing: 5, color: MINT, fontWeight: 900 }}>ONE NEXT ACTION</div>
      <Avatar state={state} framing="medium" />
      <div style={{
        position: "absolute", left: 64, right: 64, bottom: 180, height: 190, borderRadius: 44, background: MINT, color: INK,
        display: "grid", placeItems: "center", transform: `scale(${0.92 + button * 0.08})`, boxShadow: `0 0 ${30 + active * 34}px rgba(69,224,179,.52)`
      }}>
        <div style={{ fontSize: 64, fontWeight: 950, letterSpacing: -2 }}>{manifest.cta.text} <span style={{ display: "inline-block", transform: `translateX(${active * 9}px)` }}>→</span></div>
      </div>
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 92, textAlign: "center", color: "rgba(255,255,255,.72)", fontSize: 26, letterSpacing: 1.8, fontWeight: 800 }}>
        {manifest.cta.disclosure}
      </div>
    </AbsoluteFill>
  );
};

const KineticCaption: React.FC<{ caption: BenchmarkCaptionGroup }> = ({ caption }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps: 30, config: { damping: caption.treatment === "stomp" ? 12 : 18, stiffness: 180, mass: 0.65 }, durationInFrames: Math.min(14, durationInFrames) });
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 5), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const placement: CSSProperties = caption.placement === "top"
    ? { top: 150 }
    : caption.placement === "center"
      ? { top: 655 }
      : caption.placement === "proof_adjacent"
        ? { top: 170 }
        : { bottom: caption.treatment === "cta_lockup" ? 405 : 150 };
  const isProof = caption.treatment === "proof_adjacent";
  const color = isProof ? INK : WHITE;
  return (
    <div style={{
      position: "absolute", left: SAFE_X, right: SAFE_X, zIndex: 40, ...placement, opacity: exit,
      display: "flex", flexWrap: "wrap", justifyContent: caption.placement === "proof_adjacent" ? "flex-start" : "center", gap: "10px 16px",
      transform: `translateY(${(1 - enter) * (caption.treatment === "stomp" ? -70 : 44)}px) scale(${0.8 + enter * 0.2})`
    }}>
      {caption.words.map((word, index) => {
        const emphasized = caption.emphasis?.includes(word);
        const stagger = spring({ frame: Math.max(0, frame - index * 2), fps: 30, config: { damping: 15, stiffness: 180 }, durationInFrames: 12 });
        return (
          <span key={`${caption.id}-${word}-${index}`} style={{
            display: "inline-block", padding: emphasized ? "8px 16px" : "8px 3px", borderRadius: 15,
            background: emphasized ? (isProof ? GREEN : MINT) : "transparent",
            color: emphasized ? (isProof ? WHITE : INK) : color,
            fontSize: caption.treatment === "stomp" ? 78 : caption.treatment === "proof_adjacent" ? 58 : 68,
            lineHeight: 0.95, fontWeight: 950, letterSpacing: -2,
            transform: `translateY(${(1 - stagger) * 26}px) rotate(${(1 - stagger) * (index % 2 ? 3 : -3)}deg)`
          }}>{word}</span>
        );
      })}
    </div>
  );
};

const Avatar: React.FC<{ state: BenchmarkAvatarState; framing: "close" | "pip" | "medium" }> = ({ state, framing }) => {
  const frame = useCurrentFrame();
  const motion = benchmarkAvatarMotionSample(frame, state);
  const sway = motion.swayPx;
  const breathe = motion.breathingScale;
  const headTilt = motion.headTiltDeg;
  const lean = motion.torsoLean;
  const gazeX = motion.gazeX;
  const blink = motion.eyeOpen;
  const scale = framing === "close" ? 1.46 : framing === "pip" ? 0.78 : 1.03;
  const top = framing === "close" ? 300 : framing === "pip" ? 58 : 430;
  const gesture = motion.gestureProgress;
  const leftHand = state === "concerned_pause" ? -28 : state === "direct_cta" ? -105 * gesture : -50 * gesture;
  const rightHand = state === "product_gaze" ? -118 * gesture : state === "direct_cta" ? -30 : -62 * gesture;
  return (
    <div style={{
      position: "absolute", width: 640, height: 920, left: "50%", top,
      transform: `translateX(calc(-50% + ${sway}px)) scale(${scale * breathe}) translateY(${lean * 120}px)`,
      transformOrigin: "50% 72%"
    }}>
      <svg viewBox="0 0 640 920" width="640" height="920" style={{ overflow: "visible", filter: "drop-shadow(0 30px 38px rgba(0,0,0,.35))" }}>
        <defs>
          <linearGradient id={`jacket-${state}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1e3157" />
            <stop offset="1" stopColor="#081120" />
          </linearGradient>
          <linearGradient id={`mask-${state}`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#c9cfda" />
          </linearGradient>
          <filter id={`eye-glow-${state}`}><feGaussianBlur stdDeviation="8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g transform={`translate(320 238) rotate(${headTilt}) translate(-320 -238)`}>
          <path d="M205 102 Q320 22 437 103 L420 354 Q320 434 218 354Z" fill={`url(#mask-${state})`} stroke="#ffffff" strokeWidth="8" />
          <path d="M215 110 Q323 46 431 112 L408 185 Q315 147 225 190Z" fill="#17284c" />
          <g transform={`translate(${gazeX} 0) scale(1 ${blink})`} style={{ transformOrigin: "320px 222px" }} filter={`url(#eye-glow-${state})`}>
            <ellipse cx="274" cy="220" rx={state === "concerned_pause" ? 22 : 28} ry={state === "concerned_pause" ? 9 : 15} fill={state === "concerned_pause" ? AMBER : MINT} />
            <ellipse cx="361" cy="218" rx={state === "confirmation_reaction" ? 31 : 25} ry={state === "confirmation_reaction" ? 18 : 14} fill={MINT} />
          </g>
          <path d="M239 324 Q321 365 401 320" fill="none" stroke="rgba(23,40,76,.24)" strokeWidth="10" strokeLinecap="round" />
        </g>
        <path d="M157 420 Q320 346 486 420 L560 890 L82 890Z" fill={`url(#jacket-${state})`} stroke="#29416f" strokeWidth="8" />
        <path d="M320 408 L320 890" stroke={AMBER} strokeWidth="12" opacity="0.86" />
        <path d="M149 468 Q82 555 70 760" fill="none" stroke="#12213e" strokeWidth="96" strokeLinecap="round" />
        <path d="M491 468 Q558 560 568 760" fill="none" stroke="#12213e" strokeWidth="96" strokeLinecap="round" />
        <g transform={`translate(0 ${leftHand}) rotate(${state === "direct_cta" ? -16 : -5} 100 760)`}>
          <ellipse cx="102" cy="785" rx="62" ry="77" fill="#f3efe7" stroke="#d7d3ca" strokeWidth="8" />
          <path d="M77 755 L43 700 M99 750 L87 686 M122 754 L134 690" stroke="#f3efe7" strokeWidth="25" strokeLinecap="round" />
        </g>
        <g transform={`translate(0 ${rightHand}) rotate(${state === "product_gaze" ? 19 : 7} 540 760)`}>
          <ellipse cx="538" cy="785" rx="62" ry="77" fill="#f3efe7" stroke="#d7d3ca" strokeWidth="8" />
          <path d="M513 754 L482 694 M538 750 L534 682 M561 755 L578 695" stroke="#f3efe7" strokeWidth="25" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
};

const Background: React.FC<{ frame: number }> = ({ frame }) => {
  const x = 18 + Math.sin(frame / 37) * 5;
  const y = 28 + Math.cos(frame / 43) * 4;
  return <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(circle at ${x}% ${y}%, rgba(69,224,179,.09), transparent 34%)` }} />;
};

const SafeFrame: React.FC = () => (
  <div style={{ position: "absolute", inset: "52px 38px 76px", border: "1px solid rgba(255,255,255,.035)", borderRadius: 36, pointerEvents: "none", zIndex: 100 }} />
);
