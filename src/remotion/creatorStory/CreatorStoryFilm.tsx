import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { v22CameraTransform } from "../../shared/creatorStoryV22Quality";
import type { FilmCaption, FilmScene } from "../../shared/creatorStoryFilm";
import { MascotLayer } from "../solomonCreatorStoryV22/MascotLayer";
import { Disclosure, INK, MINT } from "./primitives";
import { SceneTemplate } from "./templates";

// The generic film. Everything product-specific now lives in the blueprint that
// produced these scenes; this file only knows about frames, cameras, captions
// and a presenter.
//
// The mascot layer is imported from the V22 tree rather than copied. It is
// already product-neutral -- the mascot is Gideon's, not Solomon's -- and it
// carries the persistence that stops the presenter re-fading at every scene
// boundary, which was a defect for eleven versions before it was fixed.

export interface CreatorStoryFilmProps {
  scenes: FilmScene[];
  captions: FilmCaption[];
  narrationSrc: string;
  soundDesignSrc?: string;
  disclosure?: { fromFrame: number; durationInFrames: number };
}

export const CreatorStoryFilm: React.FC<CreatorStoryFilmProps> = ({ scenes, captions, narrationSrc, soundDesignSrc, disclosure }) =>
  <AbsoluteFill style={{ background: INK, color: INK, fontFamily: "Manrope Variable,Manrope,sans-serif", overflow: "hidden" }}>
    {scenes.map((scene) => (
      <Sequence key={scene.id} from={scene.from} durationInFrames={scene.to - scene.from} premountFor={30} name={scene.id}>
        <EditorialCamera scene={scene}><SceneTemplate scene={scene} /></EditorialCamera>
      </Sequence>
    ))}
    <MascotLayer scenes={scenes} />
    {captions.map((caption) => (
      <Sequence key={caption.id} from={caption.from} durationInFrames={caption.to - caption.from} premountFor={10}>
        <CaptionLayer caption={caption} scenes={scenes} />
      </Sequence>
    ))}
    {disclosure && <Sequence from={disclosure.fromFrame} durationInFrames={disclosure.durationInFrames}><Disclosure /></Sequence>}
    <Audio src={staticFile(narrationSrc)} />
    {soundDesignSrc && <Audio src={staticFile(soundDesignSrc)} />}
  </AbsoluteFill>;

// The camera is locked off. Through V20 it applied a translate and a scale that
// changed every frame, to every scene, and the resulting sub-pixel resampling
// was what made held content shimmer -- while the motion metric, decoding at
// 180x320 and 5fps, scored the churn as a point in the film's favour. The
// transform is a pure function so held-stability can assert frame-to-frame
// identity without a Remotion context; this is only the wiring.
const EditorialCamera: React.FC<React.PropsWithChildren<{ scene: FilmScene }>> = ({ scene, children }) => {
  const frame = useCurrentFrame();
  const camera = v22CameraTransform({ from: scene.from, to: scene.to, typography: scene.typography, camera: scene.camera }, frame);
  return <AbsoluteFill data-cs-camera={scene.camera.recipe} data-cs-calm={camera.calm ? "true" : "false"} style={{ transform: camera.transform, transformOrigin: `${scene.camera.focus.x * 100}% ${scene.camera.focus.y * 100}%` }}>{children}</AbsoluteFill>;
};

// Kinetic typography: 1-2 word groups swapped every ~14 frames rather than one
// chip held for the whole window, so the words on screen track the words being
// spoken. Emphasis is carried by size and a small rise on a fixed centre line --
// three lanes and a left/right split read as busy, with the eye chasing the type
// instead of reading it.
//
// Tone and halo come from the scene's backdrop rather than a token lookup, which
// is the one change from V22: the film no longer needs to know a palette exists.
// The four voices a caption speaks in. Both families are already loaded by the
// composition's font gate, so this changes how they are used rather than what is
// available: editorial beats keep the Fraunces serif and grow, product claims
// take the heavier Manrope and give the frame back to the crop.
const REGISTERS: Record<string, { size: number; top: number; family: string; weight: number }> = {
  emotion: { size: 104, top: 96, family: "Fraunces Variable,serif", weight: 900 },
  payoff_reaction: { size: 112, top: 88, family: "Fraunces Variable,serif", weight: 900 },
  cta: { size: 104, top: 96, family: "Fraunces Variable,serif", weight: 900 },
  attention: { size: 84, top: 118, family: "Fraunces Variable,serif", weight: 850 },
  interpretation: { size: 72, top: 132, family: "Manrope Variable,sans-serif", weight: 950 },
  default: { size: 80, top: 116, family: "Fraunces Variable,serif", weight: 900 }
};

const CaptionLayer: React.FC<{ caption: FilmCaption; scenes: FilmScene[] }> = ({ caption, scenes }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps: 30, config: { damping: 17, stiffness: 185 }, durationInFrames: 10 });
  // Fade out over the last ten frames of the window. Dropping this in the port
  // cost a phantom cut: a 116px Fraunces word vanishing in a single frame is a
  // large block of pixels changing at once, and ffmpeg's scene detector scores
  // that as a boundary. The parity render came back with 19 shots against 18 and
  // the extra one sat 0.33s inside `sting`, on no scene boundary at all.
  const opacity = interpolate(frame, [Math.max(0, durationInFrames - 10), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const local = frame + caption.from;
  // The group being spoken; failing that, the one most recently spoken.
  //
  // The fallback used to be `at(-1)`, and it is why a frame-space bug looked
  // like a design choice rather than a defect: every caption whose groups were
  // in the wrong space matched nothing, took the last group, and rendered a
  // legible, uncollided, perfectly plausible final fragment of the line. It
  // survived a thirty-six frame review because each frame showed *a* caption.
  //
  // The most recent started group is also the right answer for the real case
  // this has to handle, which is the pause between two spoken groups: forced
  // alignment leaves genuine gaps, and the words on screen during one should be
  // the words just said, not the words that end the sentence.
  const group = caption.wordGroups.find((item) => local >= item.from && local < item.to)
    ?? [...caption.wordGroups].reverse().find((item) => local >= item.from)
    ?? caption.wordGroups[0];
  if (!group) return null;
  const sinceSwap = local - group.from;
  const pop = spring({ frame: Math.max(0, sinceSwap), fps: 30, config: { damping: 20, stiffness: 190 }, durationInFrames: 12 });
  // Ease the chip back in across a swap. The text changes in one frame and the
  // block resizes with it; ffmpeg's scene detector read that as a cut, and two
  // caption groups started registering as shots once they were aligned to real
  // speech. Spreading the change over four frames keeps the kinetic feel.
  const swapFade = Math.min(1, .30 + Math.max(0, sinceSwap) / 6 * .70);
  const active = scenes.find((scene) => local >= scene.from && local < scene.to) ?? scenes[0]!;
  const tone = active.backdrop.foreground;
  // Halo in the opposite direction, so the type separates from product pixels as
  // well as from the backdrop, without reintroducing a chip.
  const halo = active.backdrop.tier === "deep" ? "rgba(7,17,31,.55)" : "rgba(255,255,255,.62)";
  const text = group.text;
  const highlightIndex = caption.highlight ? text.toLowerCase().indexOf(caption.highlight.toLowerCase()) : -1;
  const pre = highlightIndex >= 0 ? text.slice(0, highlightIndex) : text;
  const highlighted = highlightIndex >= 0 ? text.slice(highlightIndex, highlightIndex + (caption.highlight?.length ?? 0)) : "";
  const post = highlightIndex >= 0 ? text.slice(highlightIndex + (caption.highlight?.length ?? 0)) : "";
  // How the line is set, from what the beat is doing.
  //
  // Every caption in the film used to be Fraunces 900 at one of two sizes, so a
  // hook, a caution and a product claim shared a voice and the composition
  // changed slower than the narration did. The register is read off the scene's
  // own narrative purpose -- already carried for the presenter -- so nothing new
  // has to be authored per film.
  //
  // Proof beats take the sans and sit lower and smaller on purpose. The claim on
  // those frames is the crop; a serif headline over it competes with the thing
  // it is introducing, and the evidence should be the largest thing on screen.
  const register = REGISTERS[active.mascot.narrativePurpose] ?? REGISTERS.default!;
  const size = group.emphasis ? Math.round(register.size * 1.18) : register.size;
  const bandTop = group.emphasis ? register.top - 30 : register.top;
  const scale = (.9 + .1 * pop) * (group.emphasis ? 1.04 : 1);
  return <div data-cs-caption={caption.id} data-cs-word-group={group.text} style={{ position: "absolute", left: 60, right: 60, top: bandTop, display: "flex", justifyContent: "center", zIndex: 70, opacity: opacity * swapFade, transform: `translateY(${(1 - enter) * -22}px)` }}>
    <div style={{ fontFamily: register.family, color: tone, fontSize: size, lineHeight: .94, textAlign: "center", fontWeight: register.weight, textShadow: `0 0 26px ${halo},0 2px 10px ${halo}`, transform: `scale(${scale})`, transformOrigin: "50% 0%" }}>
      {pre}{highlighted && <span style={{ color: MINT }}>{highlighted}</span>}{post}
    </div>
  </div>;
};
