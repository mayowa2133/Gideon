import type { CSSProperties } from "react";
import { Audio, Video } from "@remotion/media";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import type {
  SolomonCaptionPlacement,
  SolomonCreatorStoryManifest,
  SolomonHostEmotion,
  SolomonHostFraming,
  SolomonHostPose,
  SolomonStoryCaption,
  SolomonStoryScene,
  SolomonStorySource
} from "../../shared/solomonCreatorStory";
import { sampleSolomonProductCamera } from "../../shared/solomonCreatorStory";

const INK = "#07111f";
const NAVY = "#102447";
const PAPER = "#f5f3ed";
const GREEN = "#0b6b4b";
const MINT = "#45e0b3";
const AMBER = "#ffbc57";
const RED = "#ff635f";
const WHITE = "#ffffff";
const SAFE_X = 58;

const PRODUCT_FILES = {
  jobs: "proof-jobs.mp4",
  tracker: "proof-tracker.mp4",
  contacts: "proof-contacts.mp4",
  outreach: "proof-outreach.mp4"
} as const;

export const SolomonCreatorStory: React.FC<SolomonCreatorStoryManifest> = (manifest) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: INK, color: WHITE, fontFamily: "Arial, Helvetica, sans-serif", overflow: "hidden" }}>
      <AmbientBackground frame={frame} />
      {manifest.scenes.map((scene) => (
        <Sequence key={scene.id} name={`${scene.storyFunction}: ${scene.id}`} from={scene.from} durationInFrames={scene.to - scene.from} premountFor={30}>
          <StoryScene scene={scene} manifest={manifest} />
        </Sequence>
      ))}
      {manifest.captions.map((caption) => (
        <Sequence key={caption.id} name={caption.id} from={caption.from} durationInFrames={caption.to - caption.from} premountFor={15}>
          <KineticCaption caption={caption} />
        </Sequence>
      ))}
      <Audio src={staticFile("narration.wav")} volume={1} />
      <Audio src={staticFile("sound-design.wav")} volume={1} />
      <SafeFrame />
    </AbsoluteFill>
  );
};

const StoryScene: React.FC<{ scene: SolomonStoryScene; manifest: SolomonCreatorStoryManifest }> = ({ scene, manifest }) => {
  if (scene.kind === "product") return <ProductScene scene={scene} manifest={manifest} />;
  if (scene.kind === "editorial") return <EditorialScene scene={scene} />;
  if (scene.kind === "comparison") return <ComparisonScene scene={scene} />;
  return <PresenterScene scene={scene} />;
};

const PresenterScene: React.FC<{ scene: SolomonStoryScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const entrance = 0.68 + spring({ frame: frame + 7, fps: 30, config: { damping: 19, stiffness: 135, mass: 0.72 }, durationInFrames: 18 }) * 0.32;
  const warning = scene.host?.emotion === "concerned";
  const resolved = scene.host?.emotion === "relieved" || scene.host?.emotion === "confident";
  const spotlightX = scene.host?.framing === "side_left" ? "30%" : scene.host?.framing === "side_right" ? "70%" : "50%";
  return (
    <AbsoluteFill style={{
      background: warning
        ? "radial-gradient(circle at 50% 40%, #5b2026 0%, #170e17 58%, #07111f 100%)"
        : resolved
          ? `radial-gradient(circle at ${spotlightX} 42%, #0f634d 0%, #0a2d2b 48%, #07111f 100%)`
          : `radial-gradient(circle at ${spotlightX} 40%, #1c416d 0%, #102447 45%, #07111f 100%)`
    }}>
      <StudioEnvironment frame={frame} warning={warning} resolved={resolved} />
      <div style={{ position: "absolute", inset: 0, opacity: entrance, transform: `translateY(${(1 - entrance) * 70}px) scale(${0.94 + entrance * 0.06 + (scene.id === "hook-close" ? Math.min(frame, 35) / 35 * 0.04 : 0)})` }}>
        <SolomonHost {...scene.host!} />
      </div>
      {scene.id === "hook-consequence" && (
        <div style={{ position: "absolute", left: 62, top: 390, width: 410, padding: "25px 28px", borderRadius: 28, background: WHITE, color: INK, border: `3px solid ${MINT}`, boxShadow: "0 25px 70px rgba(0,0,0,.28)", transform: `translateX(${(1 - entrance) * -120}px) rotate(-3deg)` }}>
          <div style={{ fontSize: 20, color: GREEN, fontWeight: 950, letterSpacing: 2 }}>INTERVIEWING</div>
          <div style={{ marginTop: 15, fontSize: 34, fontWeight: 950 }}>WHO HELPS NEXT?</div>
        </div>
      )}
      {scene.id === "summary" && (
        <div style={{ position: "absolute", right: 70, top: 430, width: 430, padding: "30px", borderRadius: 30, background: WHITE, color: INK, border: `3px solid ${MINT}`, boxShadow: "0 30px 80px rgba(0,0,0,.3)", transform: `translateX(${(1 - entrance) * 100}px) rotate(2deg)` }}>
          <div style={{ fontSize: 20, color: GREEN, fontWeight: 950, letterSpacing: 2 }}>NEXT ACTION</div>
          <div style={{ marginTop: 20, fontSize: 38, lineHeight: 1.04, fontWeight: 950 }}>ONE CLEAR<br />NEXT STEP</div>
        </div>
      )}
      {scene.id === "cta-action" && <CreatorCtaCard frame={frame} />}
      {scene.id === "brand-sting" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(7,17,31,.8)", zIndex: 20 }}>
          <div style={{ textAlign: "center", transform: `scale(${0.86 + entrance * 0.14})` }}>
            <div style={{ fontSize: 88, fontWeight: 950, letterSpacing: 8, color: WHITE }}>SOLOMON</div>
            <div style={{ marginTop: 18, fontSize: 26, fontWeight: 900, letterSpacing: 5, color: MINT }}>COMMENT FOR THE DEMO</div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

const StudioEnvironment: React.FC<{ frame: number; warning: boolean; resolved: boolean }> = ({ frame, warning, resolved }) => (
  <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
    <div style={{ position: "absolute", left: -80, top: 220, width: 390, height: 700, background: warning ? "rgba(255,99,95,.14)" : "rgba(69,224,179,.12)", filter: "blur(80px)", transform: `translateX(${Math.sin(frame / 30) * 18}px)` }} />
    <div style={{ position: "absolute", right: 58, top: 210, width: 260, height: 520, borderRadius: 28, border: "2px solid rgba(255,255,255,.1)", background: "linear-gradient(145deg, rgba(255,255,255,.08), rgba(255,255,255,.015))" }}>
      {[0, 1, 2].map((index) => <div key={index} style={{ position: "absolute", left: 28, right: 28, top: 110 + index * 125, height: 8, borderRadius: 8, background: "rgba(255,255,255,.11)" }} />)}
    </div>
    <div style={{ position: "absolute", left: 74, top: 480, width: 100, height: 270, borderRadius: 60, background: "#0a1323", border: "5px solid rgba(255,255,255,.12)", boxShadow: resolved ? "0 0 50px rgba(69,224,179,.25)" : "0 0 50px rgba(90,150,255,.16)" }}>
      <div style={{ position: "absolute", left: 35, top: -62, width: 30, height: 84, borderRadius: 18, background: "#152641" }} />
    </div>
    <div style={{ position: "absolute", left: -40, right: -40, bottom: -100, height: 330, background: "linear-gradient(#172337, #070d16)", transform: "perspective(600px) rotateX(64deg)", transformOrigin: "bottom" }} />
  </AbsoluteFill>
);

const CreatorCtaCard: React.FC<{ frame: number }> = ({ frame }) => {
  const enter = spring({ frame: Math.max(0, frame - 12), fps: 30, config: { damping: 15, stiffness: 150 }, durationInFrames: 24 });
  return (
    <div style={{ position: "absolute", left: 74, right: 74, bottom: 160, zIndex: 10, padding: "30px 34px", borderRadius: 34, background: WHITE, color: INK, border: `4px solid ${MINT}`, boxShadow: "0 30px 90px rgba(0,0,0,.36)", transform: `translateY(${(1 - enter) * 90}px) scale(${0.92 + enter * 0.08})` }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: GREEN, letterSpacing: 2 }}>COMMENT</div>
      <div style={{ marginTop: 8, fontSize: 72, lineHeight: 0.95, fontWeight: 950, letterSpacing: -2 }}>“SOLOMON”</div>
      <div style={{ marginTop: 14, fontSize: 28, fontWeight: 850 }}>and I’ll send you the demo</div>
    </div>
  );
};

const ProductScene: React.FC<{ scene: SolomonStoryScene; manifest: SolomonCreatorStoryManifest }> = ({ scene, manifest }) => {
  const startFrames: Record<string, number> = {
    "status-pre": 72,
    "status-click": 96,
    "status-result": 130,
    "opportunity-role": 30,
    "contact-reveal": 45,
    "contact-proof": 84,
    "draft-generated": 45,
    "personalization-proof": 72,
    "approval-gate": 112
  };
  return (
    <AbsoluteFill style={{ background: PAPER, color: INK }}>
      <ProductFocus
        scene={scene}
        source={manifest.sources.find(({ id }) => id === scene.assetId)!}
        assetId={scene.assetId!}
        startFrom={startFrames[scene.id] ?? 0}
      />
    </AbsoluteFill>
  );
};

export const ProductFocus: React.FC<{
  scene: SolomonStoryScene;
  source: SolomonStorySource;
  assetId: NonNullable<SolomonStoryScene["assetId"]>;
  startFrom: number;
}> = ({ scene, source, assetId, startFrom }) => {
  const frame = useCurrentFrame();
  const viewportWidth = 968;
  const viewportHeight = 1_130;
  const baseHeight = 1_130;
  const baseWidth = baseHeight * (source.sourceWidth / source.sourceHeight);
  const proofViewport = { top: 350, height: viewportHeight };
  const camera = sampleSolomonProductCamera(scene, frame, source);
  const pointerArrival = spring({
    frame,
    fps: 30,
    config: { damping: 18, stiffness: 110, mass: 0.72 },
    durationInFrames: 28
  });
  const pointerTap = scene.id === "tracker-action"
    ? interpolate(frame, [36, 40, 45], [1, 0.82, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })
    : scene.id === "status-click"
      ? interpolate(frame, [6, 9, 13], [1, 0.8, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })
      : 1;
  const clickRipple = scene.id === "status-click"
    ? interpolate(frame, [7, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : scene.id === "approval-gate"
      ? interpolate(frame, [28, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 0;
  const spotlightOpacity = scene.camera?.spotlightIntensity ?? 0.45;
  return (
    <div style={{
      position: "absolute", left: 56, top: proofViewport.top, width: viewportWidth, height: proofViewport.height, overflow: "hidden",
      borderRadius: 28, background: WHITE, border: "2px solid #d8d6cf",
      boxShadow: "0 38px 100px rgba(7,17,31,.24)"
    }}>
      <div style={{
        position: "absolute",
        width: baseWidth,
        height: baseHeight,
        left: camera.left,
        top: camera.top,
        transform: `scale(${camera.zoom})`,
        transformOrigin: "0 0"
      }}>
        <Video
          src={staticFile(PRODUCT_FILES[assetId])}
          trimBefore={startFrom}
          playbackRate={1}
          muted
          objectFit="fill"
          style={{ width: "100%", height: "100%" }}
        />
        {source.privacyMasks.map((mask) => (
          <div
            key={`${source.id}-${mask.x}-${mask.y}`}
            style={{
              position: "absolute",
              left: mask.x * baseWidth,
              top: mask.y * baseHeight,
              width: mask.width * baseWidth,
              height: mask.height * baseHeight,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
              borderRadius: 10,
              border: "1px solid rgba(11,107,75,.32)",
              background: "linear-gradient(135deg, #f6f3eb 0%, #e5eee9 100%)",
              color: GREEN,
              fontSize: 14,
              fontWeight: 950,
              letterSpacing: 1.2,
              whiteSpace: "nowrap"
            }}
          >
            {mask.label}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: camera.targetRect.left,
          top: camera.targetRect.top,
          width: camera.targetRect.width,
          height: camera.targetRect.height,
          borderRadius: 20,
          border: `3px solid rgba(69,224,179,${0.42 + spotlightOpacity * 0.45})`,
          boxShadow: `0 0 0 1800px rgba(7,17,31,${spotlightOpacity}), 0 0 34px rgba(69,224,179,.36)`,
          pointerEvents: "none",
          zIndex: 5
        }}
      />
      {clickRipple > 0 && clickRipple < 1 && (
        <div
          style={{
            position: "absolute",
            zIndex: 7,
            left: camera.cursor.x - 28 - clickRipple * 28,
            top: camera.cursor.y - 28 - clickRipple * 28,
            width: 56 + clickRipple * 56,
            height: 56 + clickRipple * 56,
            borderRadius: "50%",
            border: `4px solid rgba(69,224,179,${1 - clickRipple})`,
            opacity: 1 - clickRipple
          }}
        />
      )}
      {source.cursorPolicy === "gideon_pointer_overlay" && (
        <svg
          aria-label="Mouse pointer"
          viewBox="0 0 40 52"
          width="48"
          height="62"
          style={{
            position: "absolute",
            zIndex: 8,
            left: camera.cursor.x - 8 + (1 - pointerArrival) * 96,
            top: camera.cursor.y - 8 + (1 - pointerArrival) * 68,
            transform: `scale(${pointerTap})`,
            transformOrigin: "7px 7px",
            filter: "drop-shadow(0 3px 4px rgba(0,0,0,.38))"
          }}
        >
          <path
            d="M4 3 L4 39 L14 30 L22 48 L30 44 L22 27 L36 27 Z"
            fill="#ffffff"
            stroke="#111827"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <ProductProofCallout scene={scene} />
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 32px rgba(7,17,31,.06)", pointerEvents: "none" }} />
    </div>
  );
};

const ProductProofCallout: React.FC<{ scene: SolomonStoryScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const enter = spring({ frame: Math.max(0, frame - 5), fps: 30, config: { damping: 17, stiffness: 150 }, durationInFrames: 18 });
  const chips = scene.id === "contact-proof"
    ? ["HIRING MANAGER", "DIRECT MATCH", "VERIFIED"]
    : scene.id === "draft-generated"
      ? ["ROLE", "COMPANY", "CONTACT"]
      : scene.id === "personalization-proof"
        ? ["ROLE CONTEXT", "COMPANY CONTEXT", "PERSONALIZED ASK"]
        : scene.id === "approval-gate"
          ? ["DRAFT — NOT SENT", "EDITABLE", "HUMAN CHECKPOINT"]
          : scene.id === "status-result"
            ? ["NEXT STEP ACTIVE"]
            : [];
  if (chips.length === 0) return null;
  return (
    <div style={{
      position: "absolute",
      zIndex: 12,
      left: 28,
      right: 28,
      bottom: 28,
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 10,
      transform: `translateY(${(1 - enter) * 42}px)`,
      opacity: enter
    }}>
      {chips.map((chip, index) => (
        <div key={chip} style={{
          padding: "10px 16px",
          borderRadius: 999,
          background: index === chips.length - 1 ? GREEN : "rgba(255,255,255,.96)",
          color: index === chips.length - 1 ? WHITE : INK,
          border: `2px solid ${index === chips.length - 1 ? GREEN : "#cfdad5"}`,
          fontSize: 20,
          fontWeight: 950,
          letterSpacing: 0.7,
          boxShadow: "0 8px 24px rgba(7,17,31,.16)"
        }}>{chip}</div>
      ))}
    </div>
  );
};

const EditorialScene: React.FC<{ scene: SolomonStoryScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const impact = spring({ frame, fps: 30, config: { damping: 12, stiffness: 180, mass: 0.64 }, durationInFrames: 22 });
  const isPayoff = scene.id === "payoff-reset";
  if (scene.id === "problem-tabs") {
    const labels = ["JOB POSTING", "LINKEDIN", "NOTES", "CONTACT SHEET", "EMAIL DRAFT"];
    const collapse = interpolate(frame, [52, 74], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <AbsoluteFill style={{ background: "radial-gradient(circle at 52% 42%, #66212b 0%, #281017 54%, #07111f 100%)" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(110deg, rgba(255,99,95,.12), transparent 50%)" }} />
        {labels.map((label, index) => {
          const column = index % 2;
          const row = Math.floor(index / 2);
          const targetX = column === 0 ? 70 : 560;
          const targetY = 300 + row * 250;
          const rotation = (index % 2 ? 1 : -1) * (4 + index * 0.8) * (1 - collapse);
          return (
            <div key={label} style={{
              position: "absolute",
              left: targetX + collapse * (500 - targetX),
              top: targetY + collapse * (760 - targetY),
              width: 420 - collapse * 260,
              height: 180 - collapse * 120,
              borderRadius: 28,
              border: "2px solid rgba(255,255,255,.22)",
              background: "rgba(255,255,255,.08)",
              backdropFilter: "blur(10px)",
              color: WHITE,
              display: "grid",
              placeItems: "center",
              fontSize: 28,
              fontWeight: 950,
              letterSpacing: 2,
              transform: `rotate(${rotation}deg) scale(${0.92 + impact * 0.08})`,
              opacity: 1 - collapse * 0.68,
              boxShadow: "0 28px 70px rgba(0,0,0,.24)"
            }}>{label}</div>
          );
        })}
        <div style={{ position: "absolute", left: 50, bottom: 22, transform: "scale(.54)", transformOrigin: "bottom left" }}>
          <SolomonHost pose="concerned_warning" emotion="concerned" framing="lower_reaction" gazeTarget="product_right" speakingIntensity={0.78} />
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{
      background: isPayoff
        ? `radial-gradient(circle at ${50 + Math.sin(frame / 16) * 4}% ${45 + Math.cos(frame / 19) * 3}%, #158667, ${GREEN} 48%, #07372b)`
        : `radial-gradient(circle at ${45 + Math.sin(frame / 18) * 4}% ${42 + Math.cos(frame / 20) * 3}%, #17365f, ${NAVY} 46%, ${INK})`,
      display: "grid", placeItems: "center"
    }}>
      <div style={{
        position: "absolute", inset: 80, border: `2px solid ${isPayoff ? MINT : "rgba(255,255,255,.13)"}`, borderRadius: 44,
        transform: `scale(${0.985 + Math.sin(frame / 20) * 0.005 + impact * 0.01})`
      }} />
    </AbsoluteFill>
  );
};

const ComparisonScene: React.FC<{ scene: SolomonStoryScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const spread = spring({ frame, fps: 30, config: { damping: 17, stiffness: 120 }, durationInFrames: 24 });
  const warning = scene.id === "warning-b";
  if (warning) {
    return (
      <AbsoluteFill style={{ background: "linear-gradient(150deg, #281017, #07111f)" }}>
        {["ROLE", "PEOPLE", "EVIDENCE", "OUTREACH"].map((label, index) => (
          <div key={label} style={{
            position: "absolute", width: 400, height: 220, borderRadius: 34, border: "2px solid rgba(255,255,255,.2)",
            background: "rgba(255,255,255,.055)", display: "grid", placeItems: "center", fontSize: 39, fontWeight: 950,
            left: index % 2 === 0 ? 74 - (1 - spread) * 120 : 606 + (1 - spread) * 120,
            top: index < 2 ? 380 - (1 - spread) * 80 : 710 + (1 - spread) * 90,
            transform: `rotate(${(index % 2 ? 1 : -1) * (4 + (1 - spread) * 8)}deg)`
          }}>{label}</div>
        ))}
        <SolomonHost {...scene.host!} />
      </AbsoluteFill>
    );
  }
  if (scene.id === "opportunity-lock") {
    const travel = spring({ frame, fps: 30, config: { damping: 16, stiffness: 105 }, durationInFrames: 35 });
    return (
      <AbsoluteFill style={{ background: "linear-gradient(150deg, #f7f4ec, #dcebe4)", color: INK }}>
        <div style={{ position: "absolute", left: 78, right: 78, top: 520, height: 420 }}>
          <div style={{
            position: "absolute", left: 20 + travel * 160, top: 40, width: 560, padding: "34px 38px", borderRadius: 32,
            background: WHITE, border: `3px solid ${GREEN}`, boxShadow: "0 26px 70px rgba(7,17,31,.18)"
          }}>
            <div style={{ color: GREEN, fontSize: 22, fontWeight: 950, letterSpacing: 2 }}>OPPORTUNITY</div>
            <div style={{ marginTop: 22, fontSize: 42, fontWeight: 950 }}>Senior Product Engineer</div>
            <div style={{ marginTop: 10, fontSize: 30, color: "#53615c" }}>Faire · Interviewing</div>
          </div>
          <div style={{ position: "absolute", left: 500, top: 176, width: 250, height: 8, borderRadius: 9, background: `linear-gradient(90deg, ${GREEN} ${travel * 100}%, #cfd8d3 ${travel * 100}%)` }} />
          <div style={{ position: "absolute", right: 0, top: 118, width: 210, height: 122, borderRadius: 28, border: "3px dashed #aebbb5", display: "grid", placeItems: "center", color: GREEN, fontSize: 24, fontWeight: 950, opacity: travel }}>
            FIND PERSON
          </div>
        </div>
        <SolomonHost pose="present_object" emotion="focused" framing="lower_reaction" gazeTarget="product_left" speakingIntensity={0.35} />
      </AbsoluteFill>
    );
  }
  if (scene.id === "mechanism-job-person" || scene.id === "mechanism-proof-draft") {
    const secondHalf = scene.id === "mechanism-proof-draft";
    const labels = ["JOB", "PERSON", "PROOF", "DRAFT"];
    return (
      <AbsoluteFill style={{ background: secondHalf ? "linear-gradient(150deg, #082f2b, #07111f)" : "linear-gradient(150deg, #162d4e, #07111f)" }}>
        <div style={{ position: "absolute", left: 120, top: 300, bottom: 250, width: 500 }}>
          {labels.map((label, index) => {
            const visible = secondHalf ? true : index < 2;
            const itemEnter = spring({ frame: Math.max(0, frame - index * 5), fps: 30, config: { damping: 16, stiffness: 145 }, durationInFrames: 25 });
            return (
              <div key={label} style={{
                position: "absolute", left: index % 2 === 0 ? 0 : 310, top: index * 220,
                width: 260, height: 140, borderRadius: 28,
                display: "grid", placeItems: "center", fontSize: 34, fontWeight: 950, letterSpacing: 2,
                background: visible ? (index === 3 ? MINT : WHITE) : "rgba(255,255,255,.06)",
                color: visible ? INK : "rgba(255,255,255,.24)",
                border: `3px solid ${visible ? MINT : "rgba(255,255,255,.12)"}`,
                transform: `translateY(${(1 - itemEnter) * 70}px) scale(${0.9 + itemEnter * 0.1})`,
                opacity: visible ? itemEnter : 0.42,
                boxShadow: visible ? "0 25px 60px rgba(0,0,0,.28)" : "none"
              }}>{label}</div>
            );
          })}
          {[0, 1, 2].map((index) => (
            <div key={index} style={{ position: "absolute", left: index % 2 === 0 ? 236 : 426, top: 125 + index * 220, fontSize: 60, fontWeight: 950, color: index < (secondHalf ? 3 : 1) ? MINT : "rgba(255,255,255,.17)", transform: "rotate(48deg)" }}>→</div>
          ))}
        </div>
        <SolomonHost pose={secondHalf ? "point_right" : "compare"} emotion={secondHalf ? "relieved" : "focused"} framing="side_right" gazeTarget="product_left" speakingIntensity={0.62} />
      </AbsoluteFill>
    );
  }
  if (scene.id === "transformation-payoff") {
    const labels = ["JOB", "PERSON", "PROOF", "DRAFT"];
    return (
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 46%, #1b9a76 0%, #0b6b4b 52%, #07372b 100%)" }}>
        <div style={{ position: "absolute", left: 68, right: 68, top: 290, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {labels.map((label, index) => {
            const reveal = spring({ frame: Math.max(0, frame - index * 26), fps: 30, config: { damping: 14, stiffness: 155 }, durationInFrames: 25 });
            return (
              <div key={label} style={{
                minHeight: 250, borderRadius: 34, background: index === 3 ? MINT : WHITE, color: INK,
                display: "grid", placeItems: "center", fontSize: 52, fontWeight: 950, letterSpacing: 2,
                border: "3px solid rgba(255,255,255,.72)", boxShadow: "0 28px 74px rgba(0,0,0,.24)",
                transform: `translateY(${(1 - reveal) * 120}px) rotate(${(1 - reveal) * (index % 2 ? 5 : -5)}deg) scale(${0.78 + reveal * 0.22})`,
                opacity: reveal
              }}>{label}</div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 50, right: 50, bottom: 240, textAlign: "center", fontSize: 30, fontWeight: 950, letterSpacing: 4, color: WHITE }}>
          ONE CONNECTED NEXT STEP
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: `linear-gradient(145deg, ${PAPER}, #ddeee7)`, color: INK }}>
      <div style={{ position: "absolute", left: 64, right: 64, top: 300, display: "grid", gridTemplateColumns: "1fr", gap: 22 }}>
        {(scene.id === "connected-context"
          ? [["ROLE", "Senior Product Engineer"], ["COMPANY", "Faire"], ["CONTACT", "Preshoth Paramalingam"]]
          : [["OPPORTUNITY", "Senior Product Engineer · Faire"], ["CONTACT", "Preshoth · Verified hiring manager"], ["NEXT STEP", "Review the draft"]]
        ).map(([label, value], index) => (
          <div key={label} style={{
            minHeight: 210, borderRadius: 30, background: WHITE, border: `3px solid ${index === 2 ? GREEN : "#d3ddd8"}`,
            padding: "30px 34px", boxShadow: "0 22px 65px rgba(7,17,31,.14)",
            transform: `translateY(${(1 - spread) * (index + 1) * 52 + Math.sin((frame + index * 8) / 20) * 3}px)`
          }}>
            <div style={{ color: GREEN, fontSize: 22, letterSpacing: 2.4, fontWeight: 950 }}>{label}</div>
            <div style={{ marginTop: 38, fontSize: 43, lineHeight: 1.08, fontWeight: 950 }}>{value}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const SolomonHost: React.FC<{
  pose: SolomonHostPose;
  emotion: SolomonHostEmotion;
  framing: SolomonHostFraming;
  gazeTarget: "camera" | "product_left" | "product_right" | "cta";
  speakingIntensity: number;
}> = ({ pose, emotion, framing, gazeTarget, speakingIntensity }) => {
  const frame = useCurrentFrame();
  const blinkPhase = frame % 83;
  const blink = (blinkPhase >= 26 && blinkPhase <= 29) || (blinkPhase >= 67 && blinkPhase <= 69) ? 0.12 : 1;
  const breathe = 1 + Math.sin(frame / 13.3) * 0.009;
  const speechBob = Math.sin(frame / 3.7) * speakingIntensity * 2.4;
  const sway = Math.sin(frame / 19.4) * 13 + Math.sin(frame / 47) * 7;
  const poseBeat = spring({ frame: frame % 60, fps: 30, config: { damping: 17, stiffness: 115 }, durationInFrames: 20 });
  const leftIdle = Math.sin(frame / 10.5) * 8;
  const rightIdle = Math.cos(frame / 12.7) * 7;
  const gazeX = (gazeTarget === "product_left" ? -18 : gazeTarget === "product_right" ? 18 : gazeTarget === "cta" ? 0 : 0) + Math.sin(frame / 18) * 4;
  const headTilt = emotion === "concerned" ? -9 : emotion === "curious" ? 6 : emotion === "surprised" ? -3 : emotion === "confident" ? 3 : 0;
  const headTurn = gazeTarget === "product_left" ? -6 : gazeTarget === "product_right" ? 6 : 0;
  const framingStyle = hostFraming(framing);
  const leftLift = pose === "point_left" ? 145
    : pose === "open_palm" ? 72
      : pose === "cta_down" ? -35
        : pose === "concerned_warning" ? 35
          : pose === "compare" ? 112
            : pose === "thinking" ? 155
              : pose === "present_object" ? 95
                : pose === "approval" ? 48
                  : pose === "count_one" ? 118
                    : 12;
  const rightLift = pose === "point_right" ? 145
    : pose === "open_palm" ? 38
      : pose === "surprised_reaction" ? 95
        : pose === "confident_confirmation" ? 55
          : pose === "compare" ? 54
            : pose === "present_object" ? 128
              : pose === "approval" ? 104
                : pose === "direct_viewer" ? 82
                  : pose === "count_one" ? 35
                    : 8;
  const forwardLean = pose === "curious_hook" || pose === "direct_emphasis" ? 1.035 : pose === "concerned_warning" ? 0.985 : 1;
  const torsoRotation = pose === "point_left" || pose === "present_object" ? -4.5
    : pose === "point_right" || pose === "approval" ? 4.5
      : pose === "compare" ? -2.5
        : 0;
  const weightShift = pose === "cta_down" ? -22 : pose === "thinking" ? 18 : Math.sin(frame / 31) * 5;
  const eyeColor = emotion === "concerned" ? AMBER : MINT;
  const voicePulse = speakingIntensity * (
    0.34 +
    Math.abs(Math.sin(frame * 0.73)) * 0.42 +
    Math.abs(Math.sin(frame * 0.29 + 1.2)) * 0.24
  );
  const browLift = emotion === "surprised" ? -16 : emotion === "concerned" ? 10 : emotion === "curious" ? -7 : 0;
  const browSlant = emotion === "concerned" ? 10 : emotion === "curious" ? -5 : 0;
  return (
    <div style={{
      position: "absolute", width: 640, height: 920, ...framingStyle,
      transform: `${framingStyle.transform ?? ""} translate(${sway + weightShift}px, ${speechBob}px) rotate(${torsoRotation}deg) scale(${breathe * forwardLean})`,
      transformOrigin: "50% 72%"
    }}>
      <svg viewBox="0 0 640 920" width="640" height="920" style={{ overflow: "visible", filter: "drop-shadow(0 30px 38px rgba(0,0,0,.34))" }}>
        <defs>
          <linearGradient id={`story-jacket-${pose}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#233a65" /><stop offset="1" stopColor="#081120" /></linearGradient>
          <linearGradient id={`story-mask-${pose}`} x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#c8cfda" /></linearGradient>
          <filter id={`story-eye-${pose}`}><feGaussianBlur stdDeviation="7" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g transform={`translate(320 238) rotate(${headTilt + Math.sin(frame / 29) * 2.5}) skewX(${headTurn}) translate(-320 -238)`}>
          <path d="M205 102 Q320 22 437 103 L420 354 Q320 434 218 354Z" fill={`url(#story-mask-${pose})`} stroke="#fff" strokeWidth="8" />
          <path d="M215 110 Q323 46 431 112 L408 185 Q315 147 225 190Z" fill="#17284c" />
          <g transform={`translate(${gazeX} 0) scale(1 ${blink})`} style={{ transformOrigin: "320px 220px" }} filter={`url(#story-eye-${pose})`}>
            <ellipse cx="274" cy="220" rx={emotion === "surprised" ? 31 : 26} ry={emotion === "concerned" ? 9 : emotion === "surprised" ? 20 : 14} fill={eyeColor} />
            <ellipse cx="361" cy="218" rx={emotion === "surprised" ? 31 : 26} ry={emotion === "concerned" ? 11 : emotion === "surprised" ? 20 : 14} fill={emotion === "concerned" ? MINT : eyeColor} />
          </g>
          <g
            fill="none"
            stroke="#17284c"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.82"
            transform={`translate(0 ${browLift})`}
          >
            <path d={`M242 ${184 + browSlant} Q274 169 304 ${184 - browSlant}`} />
            <path d={`M336 ${184 - browSlant} Q368 169 398 ${184 + browSlant}`} />
          </g>
          <g opacity={0.18 + voicePulse * 0.78} filter={`url(#story-eye-${pose})`}>
            <rect x={282 - voicePulse * 18} y="286" width={76 + voicePulse * 36} height="11" rx="6" fill={MINT} />
            <rect x={305 - voicePulse * 8} y="306" width={30 + voicePulse * 16} height="7" rx="4" fill={emotion === "concerned" ? AMBER : MINT} opacity="0.72" />
          </g>
          <g opacity="0.48" transform={`translate(0 ${emotion === "concerned" ? -3 : 0})`}>
            {[-32, -16, 0, 16, 32].map((offset, index) => (
              <rect key={offset} x={316 + offset} y={332 + Math.abs(index - 2) * 2} width="9" height={index === 2 ? 18 : 13} rx="4" fill="#17284c" />
            ))}
          </g>
        </g>
        <path d="M157 420 Q320 346 486 420 L560 890 L82 890Z" fill={`url(#story-jacket-${pose})`} stroke="#29416f" strokeWidth="8" />
        <path d="M320 408 L320 890" stroke={AMBER} strokeWidth="12" opacity="0.86" />
        <path d="M149 468 Q82 555 70 760" fill="none" stroke="#12213e" strokeWidth="96" strokeLinecap="round" />
        <path d="M491 468 Q558 560 568 760" fill="none" stroke="#12213e" strokeWidth="96" strokeLinecap="round" />
        <g transform={`translate(${pose === "point_left" ? -58 * poseBeat : pose === "cta_down" ? -34 : pose === "compare" ? -30 : 0} ${-leftLift * poseBeat + leftIdle}) rotate(${pose === "point_left" ? -24 : pose === "cta_down" ? 165 : pose === "thinking" ? -38 : -7} 100 760)`}>
          <ellipse cx="102" cy="785" rx="62" ry="77" fill="#f3efe7" stroke="#d7d3ca" strokeWidth="8" />
          <path d={pose === "count_one" ? "M99 750 L99 650" : "M77 755 L43 700 M99 750 L87 686 M122 754 L134 690"} stroke="#f3efe7" strokeWidth="25" strokeLinecap="round" />
        </g>
        <g transform={`translate(${pose === "point_right" ? 60 * poseBeat : pose === "present_object" ? 36 : 0} ${-rightLift * poseBeat + rightIdle}) rotate(${pose === "point_right" ? 25 : pose === "surprised_reaction" ? 13 : pose === "approval" ? 22 : 8} 540 760)`}>
          <ellipse cx="538" cy="785" rx="62" ry="77" fill="#f3efe7" stroke="#d7d3ca" strokeWidth="8" />
          <path d="M513 754 L482 694 M538 750 L534 682 M561 755 L578 695" stroke="#f3efe7" strokeWidth="25" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
};

const KineticCaption: React.FC<{ caption: SolomonStoryCaption }> = ({ caption }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps: 30, config: { damping: caption.role === "impact" ? 12 : 17, stiffness: 180, mass: 0.66 }, durationInFrames: Math.min(14, durationInFrames) });
  const exit = caption.role === "cta"
    ? 1
    : interpolate(frame, [Math.max(0, durationInFrames - 4), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const placement = captionPlacement(caption.placement);
  const onPaper = caption.placement === "top" || caption.placement === "proof";
  const fontFamily = caption.role === "editorial" ? "Georgia, 'Times New Roman', serif" : "Arial, Helvetica, sans-serif";
  const continuousScale = 1 + Math.sin(frame / 14.5) * (caption.role === "editorial" ? 0.008 : 0.004);
  const continuousX = Math.sin(frame / 18) * (caption.role === "editorial" ? 5 : 2.5);
  return (
    <div style={{
      position: "absolute", left: SAFE_X, right: SAFE_X, zIndex: 50, ...placement, opacity: exit,
      display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "9px 14px", fontFamily,
      fontStyle: caption.role === "editorial" ? "italic" : "normal",
      transform: `translate(${continuousX}px, ${(1 - enter) * (caption.role === "impact" ? -58 : 38)}px) scale(${(0.82 + enter * 0.18) * continuousScale})`
    }}>
      {caption.words.map((word, index) => {
        const emphasized = caption.emphasis.includes(word);
        const stagger = spring({ frame: Math.max(0, frame - index * 2), fps: 30, config: { damping: 15, stiffness: 180 }, durationInFrames: 12 });
        return (
          <span key={`${caption.id}-${word}-${index}`} style={{
            padding: emphasized ? "8px 15px" : "8px 2px", borderRadius: 14,
            background: emphasized ? (onPaper ? GREEN : MINT) : "transparent",
            color: emphasized ? WHITE : onPaper ? INK : WHITE,
            fontSize: caption.role === "editorial" ? 104 : caption.role === "impact" || caption.role === "cta" ? 76 : 64,
            lineHeight: 0.94, fontWeight: 950, letterSpacing: -2,
            transform: `translateY(${(1 - stagger) * 24}px) rotate(${(1 - stagger) * (index % 2 ? 2.5 : -2.5)}deg)`
          }}>{word}</span>
        );
      })}
    </div>
  );
};

const AmbientBackground: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{
    pointerEvents: "none",
    background: `radial-gradient(circle at ${18 + Math.sin(frame / 37) * 5}% ${28 + Math.cos(frame / 43) * 4}%, rgba(69,224,179,.08), transparent 34%)`
  }} />
);

const SafeFrame: React.FC = () => (
  <div style={{ position: "absolute", inset: "52px 38px 76px", border: "1px solid rgba(255,255,255,.03)", borderRadius: 36, pointerEvents: "none", zIndex: 100 }} />
);

function captionPlacement(placement: SolomonCaptionPlacement): CSSProperties {
  if (placement === "top") return { top: 145 };
  if (placement === "center") return { top: 700 };
  if (placement === "proof") return { top: 185 };
  return { bottom: 405 };
}

function hostFraming(framing: SolomonHostFraming): CSSProperties {
  if (framing === "extreme_close") return { left: "50%", top: 190, transform: "translateX(-50%) scale(1.58)" };
  if (framing === "close") return { left: "50%", top: 285, transform: "translateX(-50%) scale(1.4)" };
  if (framing === "side_left") return { left: "28%", top: 420, transform: "translateX(-50%) scale(1.04)" };
  if (framing === "side_right") return { left: "72%", top: 420, transform: "translateX(-50%) scale(1.04)" };
  if (framing === "pip") return { left: "53%", top: 60, transform: "translateX(-50%) scale(.72)" };
  if (framing === "desk") return { left: "34%", top: 460, transform: "translateX(-50%) scale(1.08)" };
  if (framing === "three_quarter") return { left: "70%", top: 350, transform: "translateX(-50%) scale(1.22)" };
  if (framing === "lower_reaction") return { left: "72%", top: 710, transform: "translateX(-50%) scale(.78)" };
  if (framing === "cta_close") return { left: "50%", top: 170, transform: "translateX(-50%) scale(1.55)" };
  return { left: "50%", top: 430, transform: "translateX(-50%) scale(1.03)" };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
