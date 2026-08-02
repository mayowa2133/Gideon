import type { CSSProperties } from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { RobotPerformance } from "../../shared/gideonRobotV6";
import type { SolomonCreatorStoryV6Manifest, V6Caption, V6CaptionPlacement, V6Scene } from "../../shared/solomonCreatorStoryV6";
import type { SolomonStorySource } from "../../shared/solomonCreatorStory";

const INK = "#07111f";
const NAVY = "#122c50";
const PAPER = "#f7f4ed";
const MINT = "#42e6b4";
const GREEN = "#087052";
const AMBER = "#ffbd59";
const CORAL = "#ff6f61";
const WHITE = "#fff";
const PRODUCT_FILES = { jobs: "proof-jobs.mp4", tracker: "proof-tracker.mp4", contacts: "proof-contacts.mp4", outreach: "proof-outreach.mp4" } as const;

export const SolomonCreatorStoryV6: React.FC<SolomonCreatorStoryV6Manifest> = (manifest) => (
  <AbsoluteFill style={{ background: INK, color: WHITE, fontFamily: "Arial, Helvetica, sans-serif", overflow: "hidden" }}>
    {manifest.scenes.map((scene) => (
      <Sequence key={scene.id} name={scene.id} from={scene.from} durationInFrames={scene.to - scene.from} premountFor={30}>
        <Scene scene={scene} manifest={manifest} />
      </Sequence>
    ))}
    {manifest.captions.map((caption) => (
      <Sequence key={caption.id} name={caption.id} from={caption.from} durationInFrames={caption.to - caption.from} premountFor={12}>
        <Caption caption={caption} />
      </Sequence>
    ))}
    <Audio src={staticFile("narration.wav")} />
    <Audio src={staticFile("sound-design.wav")} />
  </AbsoluteFill>
);

const Scene: React.FC<{ scene: V6Scene; manifest: SolomonCreatorStoryV6Manifest }> = ({ scene, manifest }) => {
  if (scene.kind === "product") return <ProductScene scene={scene} source={manifest.sources.find(({ id }) => id === scene.assetId)!} />;
  if (scene.kind === "editorial") return <EditorialScene scene={scene} />;
  if (scene.kind === "comparison") return <ComparisonScene scene={scene} />;
  return <RobotStudio scene={scene} />;
};

const RobotStudio: React.FC<{ scene: V6Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const performance = scene.performance!;
  const warning = performance.emotion === "concerned";
  const enter = spring({ frame, fps: 30, config: { damping: 17, stiffness: 125 }, durationInFrames: 20 });
  return (
    <AbsoluteFill style={{ background: warning ? "radial-gradient(circle at 50% 38%, #58232a, #180d16 60%, #07111f)" : "radial-gradient(circle at 50% 36%, #164b5b, #112d4d 52%, #07111f)" }}>
      <Studio frame={frame} warning={warning} />
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - enter) * 85}px)`, opacity: enter }}>
        <GideonRobot performance={performance} />
      </div>
      {scene.id === "cta" && <CtaCard frame={frame} />}
      {scene.id === "brand-sting" && (
        <AbsoluteFill style={{ zIndex: 20, background: INK, display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 82, fontWeight: 950, letterSpacing: 8 }}>GIDEON</div><div style={{ color: MINT, fontSize: 30, fontWeight: 900, letterSpacing: 5, marginTop: 14 }}>SOLOMON STORY</div></div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const Studio: React.FC<{ frame: number; warning: boolean }> = ({ frame, warning }) => (
  <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
    <div style={{ position: "absolute", left: -130, top: 230, width: 480, height: 720, background: warning ? "rgba(255,111,97,.18)" : "rgba(66,230,180,.13)", filter: "blur(95px)", transform: `translateX(${Math.sin(frame / 31) * 14}px)` }} />
    <div style={{ position: "absolute", right: 60, top: 250, width: 270, height: 500, border: "2px solid rgba(255,255,255,.1)", borderRadius: 34, background: "linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.015))" }} />
    <div style={{ position: "absolute", left: -40, right: -40, bottom: -90, height: 330, background: "linear-gradient(#17283d,#080f19)", transform: "perspective(650px) rotateX(65deg)", transformOrigin: "bottom" }} />
  </AbsoluteFill>
);

export const GideonRobot: React.FC<{ performance: RobotPerformance }> = ({ performance }) => {
  const frame = useCurrentFrame();
  const blinkPhase = frame % 91;
  const blink = blinkPhase >= 55 && blinkPhase <= 58 ? .12 : 1;
  const sway = Math.sin(frame / 23) * 10 + Math.sin(frame / 51) * 5;
  const breathe = 1 + Math.sin(frame / 15) * .008;
  const speechIndex = { rest: 0, soft: .28, medium: .5, strong: .75, impact: 1 }[performance.speechState];
  const speech = speechIndex * (.35 + Math.abs(Math.sin(frame * .58)) * .65);
  const gazeX = { camera: 0, product_left: -18, product_right: 18, caption: 0, cta: 0 }[performance.gaze];
  const gazeY = performance.gaze === "caption" ? -8 : performance.gaze === "cta" ? 12 : 0;
  const gesture = spring({ frame: Math.max(0, frame - performance.gestureLeadFrames), fps: 30, config: { damping: 16, stiffness: 120 }, durationInFrames: 22 });
  const left = ["point_left", "compare", "present_object", "thinking", "celebrate"].includes(performance.gesture) ? 120 : performance.gesture === "open_palm" ? 70 : 15;
  const right = ["point_right", "approval", "direct_emphasis", "cta_down", "celebrate"].includes(performance.gesture) ? 120 : performance.gesture === "compare" ? 65 : 12;
  const eyeY = performance.emotion === "concerned" ? 9 : performance.emotion === "surprised" ? 20 : 14;
  const shellStroke = performance.emotion === "concerned" ? CORAL : MINT;
  const framing = robotFraming(performance.framing);
  return (
    <div style={{ position: "absolute", width: 650, height: 930, ...framing, transform: `${framing.transform ?? ""} translateX(${sway}px) scale(${breathe * (1 + performance.lean * .04)})`, transformOrigin: "50% 75%" }}>
      <svg viewBox="0 0 650 930" width="650" height="930" style={{ overflow: "visible", filter: "drop-shadow(0 35px 45px rgba(0,0,0,.34))" }}>
        <defs>
          <linearGradient id="v6-shell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff"/><stop offset=".55" stopColor="#e8eef3"/><stop offset="1" stopColor="#b9c5d1"/></linearGradient>
          <linearGradient id="v6-body" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stopColor="#f9fcff"/><stop offset="1" stopColor="#aab9c7"/></linearGradient>
          <filter id="v6-glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g transform={`translate(325 245) rotate(${performance.headTurn * 9 + Math.sin(frame / 32) * 2}) translate(-325 -245)`}>
          <rect x="164" y="74" width="322" height="292" rx="104" fill="url(#v6-shell)" stroke="#fff" strokeWidth="9"/>
          <rect x="187" y="106" width="276" height="208" rx="74" fill="#061522" stroke={shellStroke} strokeOpacity=".28" strokeWidth="4"/>
          <rect x="288" y="42" width="74" height="43" rx="20" fill="#d9e1e8"/><circle cx="325" cy="42" r="12" fill={AMBER}/>
          <rect x="132" y="162" width="45" height="102" rx="22" fill="#c7d2dc"/><rect x="473" y="162" width="45" height="102" rx="22" fill="#c7d2dc"/>
          <g transform={`translate(${gazeX} ${gazeY}) scale(1 ${blink})`} style={{ transformOrigin: "325px 197px" }} filter="url(#v6-glow)">
            <ellipse cx="273" cy="195" rx={performance.emotion === "surprised" ? 29 : 25} ry={eyeY} fill={MINT}/><ellipse cx="377" cy="195" rx={performance.emotion === "surprised" ? 29 : 25} ry={eyeY} fill={MINT}/>
          </g>
          <g transform="translate(325 260)" fill={MINT} filter="url(#v6-glow)">
            {[-38,-19,0,19,38].map((x, index) => <rect key={x} x={x - 5} y={-5 - speech * (index === 2 ? 15 : index % 2 ? 8 : 3)} width="10" height={10 + speech * (index === 2 ? 30 : index % 2 ? 16 : 6)} rx="5" />)}
          </g>
        </g>
        <path d="M205 395 Q325 344 445 395 Q500 516 492 730 Q325 812 158 730 Q150 516 205 395Z" fill="url(#v6-body)" stroke="#fff" strokeWidth="9"/>
        <path d="M238 465 Q325 425 412 465 L399 614 Q325 658 251 614Z" fill="#112d4d" stroke={MINT} strokeOpacity=".5" strokeWidth="5"/>
        <circle cx="325" cy="532" r="42" fill={MINT}/><text x="325" y="550" textAnchor="middle" fill={INK} fontFamily="Arial" fontWeight="950" fontSize="48">G</text>
        <g transform={`translate(${performance.gesture === "point_left" ? -55 * gesture : performance.gesture === "thinking" ? 18 : 0} ${-left * gesture}) rotate(${performance.gesture === "point_left" ? -28 : performance.gesture === "thinking" ? -42 : -8} 150 690)`}>
          <path d="M194 450 Q104 530 105 675" fill="none" stroke="#d8e1e8" strokeWidth="82" strokeLinecap="round"/><circle cx="103" cy="700" r="54" fill="#f7fafc" stroke="#c5d0da" strokeWidth="7"/>
          <path d="M83 683 L42 638 M105 675 L92 616 M128 685 L142 628" stroke="#f7fafc" strokeWidth="20" strokeLinecap="round"/>
        </g>
        <g transform={`translate(${performance.gesture === "point_right" ? 55 * gesture : 0} ${-right * gesture}) rotate(${performance.gesture === "cta_down" ? 150 : performance.gesture === "point_right" ? 28 : 8} 500 690)`}>
          <path d="M456 450 Q546 530 545 675" fill="none" stroke="#d8e1e8" strokeWidth="82" strokeLinecap="round"/><circle cx="547" cy="700" r="54" fill="#f7fafc" stroke="#c5d0da" strokeWidth="7"/>
          <path d="M525 683 L488 636 M548 675 L548 614 M570 685 L591 630" stroke="#f7fafc" strokeWidth="20" strokeLinecap="round"/>
        </g>
        <path d="M208 742 Q325 802 442 742" fill="none" stroke={AMBER} strokeWidth="10" strokeLinecap="round"/>
      </svg>
    </div>
  );
};

const ProductScene: React.FC<{ scene: V6Scene; source: SolomonStorySource }> = ({ scene, source }) => {
  const frame = useCurrentFrame();
  const viewport = { left: 48, top: 335, width: 984, height: 1_185 };
  const sourceHeight = 1_185;
  const sourceWidth = sourceHeight * source.sourceWidth / source.sourceHeight;
  const progress = smooth(Math.min(1, frame / scene.camera!.settleFrames));
  const zoom = scene.camera!.zoomStart + (scene.camera!.zoomEnd - scene.camera!.zoomStart) * progress;
  const target = scene.focusTarget!;
  const targetCenterX = (target.x + target.width / 2) * sourceWidth;
  const targetCenterY = (target.y + target.height / 2) * sourceHeight;
  const left = clamp(viewport.width * scene.camera!.anchorX - targetCenterX * zoom, viewport.width - sourceWidth * zoom, 0);
  const top = clamp(viewport.height * scene.camera!.anchorY - targetCenterY * zoom, viewport.height - sourceHeight * zoom, 0);
  const focus = { left: left + target.x * sourceWidth * zoom, top: top + target.y * sourceHeight * zoom, width: target.width * sourceWidth * zoom, height: target.height * sourceHeight * zoom };
  const pointerX = left + (source.actionRegion.x + source.actionRegion.width / 2) * sourceWidth * zoom;
  const pointerY = top + (source.actionRegion.y + source.actionRegion.height / 2) * sourceHeight * zoom;
  const startFrames: Record<string, number> = { "hook-proof": 92, "role-proof": 30, "contact-proof": 76, "draft-proof": 65, "approval-proof": 108 };
  return (
    <AbsoluteFill style={{ background: PAPER, color: INK }}>
      <div style={{ position: "absolute", left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height, overflow: "hidden", borderRadius: 32, background: WHITE, border: "2px solid #d8ddd9", boxShadow: "0 36px 90px rgba(7,17,31,.2)", transform: `translateY(${Math.sin(frame / 11) * 1.8}px)` }}>
        <div style={{ position: "absolute", width: sourceWidth, height: sourceHeight, left, top, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
          <Video src={staticFile(PRODUCT_FILES[scene.assetId!])} trimBefore={startFrames[scene.id] ?? 0} muted objectFit="fill" style={{ width: "100%", height: "100%", filter: "saturate(1.05) contrast(1.02)" }} />
          {source.privacyMasks.map((mask) => <div key={`${mask.x}-${mask.y}`} style={{ position: "absolute", left: mask.x * sourceWidth, top: mask.y * sourceHeight, width: mask.width * sourceWidth, height: mask.height * sourceHeight, borderRadius: 9, background: "linear-gradient(135deg,#f7f4ed,#e4eee9)", border: "1px solid rgba(8,112,82,.3)", color: GREEN, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 900, letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{mask.label}</div>)}
        </div>
        <div style={{ position: "absolute", ...focus, borderRadius: 18, border: `4px solid ${MINT}`, boxShadow: "0 0 0 1px rgba(7,17,31,.2),0 0 30px rgba(66,230,180,.32)", pointerEvents: "none" }} />
        {scene.camera!.cursorRequired && <MousePointer x={pointerX} y={pointerY} frame={frame} />}
        <ProofChips scene={scene} />
      </div>
      <div style={{ position: "absolute", top: 286, left: 54, color: GREEN, fontSize: 20, letterSpacing: 2.4, fontWeight: 950 }}>VERIFIED SOLOMON PRODUCT PROOF</div>
    </AbsoluteFill>
  );
};

const MousePointer: React.FC<{ x: number; y: number; frame: number }> = ({ x, y, frame }) => {
  const enter = spring({ frame, fps: 30, config: { damping: 18, stiffness: 110 }, durationInFrames: 24 });
  const tap = interpolate(frame, [20, 24, 29], [1, .82, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <svg aria-label="Mouse pointer" viewBox="0 0 40 52" width="48" height="62" style={{ position: "absolute", zIndex: 8, left: x - 8 + (1 - enter) * 90, top: y - 8 + (1 - enter) * 62, transform: `scale(${tap})`, filter: "drop-shadow(0 3px 4px rgba(0,0,0,.38))" }}><path d="M4 3 L4 39 L14 30 L22 48 L30 44 L22 27 L36 27 Z" fill="#fff" stroke="#111827" strokeWidth="3" strokeLinejoin="round"/></svg>;
};

const ProofChips: React.FC<{ scene: V6Scene }> = ({ scene }) => {
  const labels = scene.id === "contact-proof" ? ["HIRING MANAGER", "DIRECT MATCH", "VERIFIED"] : scene.id === "approval-proof" ? ["DRAFT — NOT SENT", "EDITABLE", "YOU DECIDE"] : scene.id === "draft-proof" ? ["ROLE", "COMPANY", "CLEAR ASK"] : scene.id === "hook-proof" ? ["INTERVIEWING", "NEXT PERSON"] : ["ROLE + COMPANY"];
  return <div style={{ position: "absolute", left: 24, right: 24, bottom: 24, zIndex: 10, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 10 }}>{labels.map((label, index) => <span key={label} style={{ padding: "10px 16px", borderRadius: 999, background: index === labels.length - 1 ? GREEN : WHITE, color: index === labels.length - 1 ? WHITE : INK, border: `2px solid ${index === labels.length - 1 ? GREEN : "#cfdbd5"}`, boxShadow: "0 8px 22px rgba(7,17,31,.14)", fontSize: 19, fontWeight: 950 }}>{label}</span>)}</div>;
};

const EditorialScene: React.FC<{ scene: V6Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  if (scene.id === "five-tabs") {
    const labels = ["JOB POST", "LINKEDIN", "NOTES", "CONTACTS", "BLANK EMAIL"];
    return <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 42%,#702831,#2b1119 58%,#07111f)" }}>
      {labels.map((label, index) => { const enter = spring({ frame: Math.max(0, frame - index * 5), fps: 30, config: { damping: 13, stiffness: 160 }, durationInFrames: 20 }); return <div key={label} style={{ position: "absolute", left: index % 2 ? 560 : 70, top: 290 + Math.floor(index / 2) * 245, width: 430, height: 175, borderRadius: 28, display: "grid", placeItems: "center", color: WHITE, border: "2px solid rgba(255,255,255,.23)", background: "rgba(255,255,255,.08)", fontSize: 30, fontWeight: 950, transform: `translateY(${(1 - enter) * 75 + Math.sin((frame + index * 8) / 10) * 3}px) rotate(${(index % 2 ? 1 : -1) * (3 + index)}deg)`, opacity: enter }}>{label}</div>; })}
      <Disclosure text={scene.conceptualDisclosure!} />
    </AbsoluteFill>;
  }
  const parts = ["ROLE", "COMPANY", "WHY NOW", "CLEAR ASK"];
  return <AbsoluteFill style={{ background: "linear-gradient(145deg,#102b4c,#07111f)" }}>
    <div style={{ position: "absolute", left: 70, right: 70, top: 340, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>{parts.map((label, index) => { const enter = spring({ frame: Math.max(0, frame - index * 7), fps: 30, config: { damping: 14, stiffness: 145 }, durationInFrames: 22 }); return <div key={label} style={{ height: 300, borderRadius: 34, display: "grid", placeItems: "center", background: index === 3 ? MINT : WHITE, color: INK, border: `3px solid ${MINT}`, fontSize: 47, fontWeight: 950, transform: `translateY(${(1 - enter) * 90 + Math.sin((frame + index * 9) / 11) * 3}px) scale(${.86 + enter * .14})`, opacity: enter }}>{index + 1}. {label}</div>; })}</div>
    <Disclosure text={scene.conceptualDisclosure!} />
  </AbsoluteFill>;
};

const ComparisonScene: React.FC<{ scene: V6Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  if (scene.id === "generic-v-personal") return <AbsoluteFill style={{ background: PAPER, color: INK }}>
    <div style={{ position: "absolute", left: 55, right: 55, top: 310, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
      <ComparisonCard title="GENERIC" body="Hi, I wanted to connect about the role..." color={CORAL} crossed />
      <ComparisonCard title="PERSONALIZED" body="Senior Product Engineer · Faire · verified context" color={GREEN} />
    </div><GideonRobot performance={scene.performance!}/><Disclosure text={scene.conceptualDisclosure!}/>
  </AbsoluteFill>;
  const stage = ["payoff-job", "payoff-person", "payoff-proof", "payoff-draft"].indexOf(scene.id);
  const labels = ["JOB", "PERSON", "PROOF", "DRAFT"];
  return <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 42%,#118066,#082e2a 56%,#07111f)" }}>
    <div style={{ position: "absolute", left: 55, right: 55, top: 320, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>{labels.map((label, index) => { const active = index <= stage; const enter = spring({ frame: Math.max(0, frame - index * 4), fps: 30, config: { damping: 14, stiffness: 150 }, durationInFrames: 18 }); return <div key={label} style={{ height: 255, borderRadius: 34, display: "grid", placeItems: "center", background: active ? (index === 3 ? MINT : WHITE) : "rgba(255,255,255,.08)", color: active ? INK : "rgba(255,255,255,.3)", border: `3px solid ${active ? MINT : "rgba(255,255,255,.14)"}`, fontSize: 48, fontWeight: 950, transform: `scale(${.88 + enter * .12})`, opacity: active ? enter : .65 }}>{label}</div>; })}</div>
    <GideonRobot performance={scene.performance!}/>
  </AbsoluteFill>;
};

const ComparisonCard: React.FC<{ title: string; body: string; color: string; crossed?: boolean }> = ({ title, body, color, crossed }) => <div style={{ minHeight: 560, borderRadius: 34, background: WHITE, border: `4px solid ${color}`, padding: "34px", boxShadow: "0 28px 70px rgba(7,17,31,.16)", opacity: crossed ? .72 : 1 }}><div style={{ color, fontSize: 24, fontWeight: 950, letterSpacing: 2 }}>{title}</div><div style={{ marginTop: 70, fontSize: 38, lineHeight: 1.22, fontWeight: 850 }}>{body}</div>{crossed && <div style={{ height: 8, background: CORAL, transform: "rotate(-22deg) translateY(-80px)", borderRadius: 8 }}/>}</div>;
const Disclosure: React.FC<{ text: string }> = ({ text }) => <div style={{ position: "absolute", left: 45, bottom: 55, padding: "10px 16px", borderRadius: 12, background: "rgba(7,17,31,.72)", color: "rgba(255,255,255,.8)", fontSize: 16, fontWeight: 800, letterSpacing: 1.2 }}>{text}</div>;

const CtaCard: React.FC<{ frame: number }> = ({ frame }) => { const enter = spring({ frame: Math.max(0, frame - 18), fps: 30, config: { damping: 15, stiffness: 150 }, durationInFrames: 24 }); return <div style={{ position: "absolute", left: 70, right: 70, bottom: 150, zIndex: 12, padding: "28px 34px", borderRadius: 34, background: WHITE, color: INK, border: `4px solid ${MINT}`, boxShadow: "0 32px 90px rgba(0,0,0,.35)", transform: `translateY(${(1 - enter) * 90}px) scale(${.9 + enter * .1})` }}><div style={{ color: GREEN, fontSize: 26, fontWeight: 950, letterSpacing: 2 }}>ONE NEXT STEP</div><div style={{ fontSize: 67, fontWeight: 950, lineHeight: 1, marginTop: 8 }}>FOLLOW GIDEON</div><div style={{ fontSize: 27, fontWeight: 850, marginTop: 12 }}>for the full Solomon demo</div></div>; };

const Caption: React.FC<{ caption: V6Caption }> = ({ caption }) => {
  const frame = useCurrentFrame(); const { durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps: 30, config: { damping: caption.role === "editorial_takeover" ? 12 : 17, stiffness: 175 }, durationInFrames: Math.min(14, durationInFrames) });
  const exit = caption.role === "cta" ? 1 : interpolate(frame, [Math.max(0, durationInFrames - 4), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const onPaper = caption.role === "proof_label";
  return <div style={{ position: "absolute", left: 52, right: 52, zIndex: 50, ...captionPlacement(caption.placement), display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px 13px", opacity: exit, fontFamily: caption.role === "editorial_takeover" ? "Georgia, Times New Roman, serif" : "Arial, Helvetica, sans-serif", fontStyle: caption.role === "editorial_takeover" ? "italic" : "normal", transform: `translateY(${(1 - enter) * 45}px) scale(${.84 + enter * .16})` }}>{caption.words.map((word, index) => { const emphasis = caption.emphasis.includes(word); return <span key={`${word}-${index}`} style={{ padding: emphasis ? "8px 14px" : "8px 2px", borderRadius: 13, background: emphasis ? (onPaper ? GREEN : MINT) : "transparent", color: emphasis ? (onPaper ? WHITE : INK) : onPaper ? INK : WHITE, fontSize: caption.role === "editorial_takeover" ? 98 : caption.role === "cta" ? 72 : 63, lineHeight: .95, fontWeight: 950, letterSpacing: -2 }}>{word}</span>; })}</div>;
};

function captionPlacement(placement: V6CaptionPlacement): CSSProperties { if (placement === "top") return { top: 135 }; if (placement === "proof") return { top: 180 }; if (placement === "center") return { top: 700 }; return { bottom: 390 }; }
function robotFraming(framing: RobotPerformance["framing"]): CSSProperties { if (framing === "extreme_close") return { left: "50%", top: 180, transform: "translateX(-50%) scale(1.54)" }; if (framing === "close") return { left: "50%", top: 280, transform: "translateX(-50%) scale(1.35)" }; if (framing === "side_left") return { left: "30%", top: 405, transform: "translateX(-50%) scale(1.06)" }; if (framing === "side_right") return { left: "70%", top: 405, transform: "translateX(-50%) scale(1.06)" }; if (framing === "pip") return { left: "72%", top: 785, transform: "translateX(-50%) scale(.62)" }; if (framing === "three_quarter") return { left: "66%", top: 350, transform: "translateX(-50%) scale(1.18)" }; if (framing === "lower_reaction") return { left: "72%", top: 820, transform: "translateX(-50%) scale(.58)" }; if (framing === "cta_close") return { left: "50%", top: 130, transform: "translateX(-50%) scale(1.48)" }; return { left: "50%", top: 430, transform: "translateX(-50%) scale(1.02)" }; }
function smooth(value: number): number { return value * value * (3 - 2 * value); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
