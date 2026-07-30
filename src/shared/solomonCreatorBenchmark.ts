export const SOLOMON_CREATOR_BENCHMARK_SCHEMA_VERSION = "1" as const;
export const SOLOMON_CREATOR_BENCHMARK_ID = "solomon-creator-benchmark-v1" as const;
export const SOLOMON_CREATOR_BENCHMARK_FPS = 30 as const;
export const SOLOMON_CREATOR_BENCHMARK_DURATION_FRAMES = 300 as const;

export const SOLOMON_MOTION_COMPONENTS = [
  "CreatorHook",
  "AvatarCloseup",
  "AvatarPresenter",
  "AvatarReaction",
  "AvatarCTA",
  "KineticCaption",
  "EditorialClaim",
  "ProofLabel",
  "ProductCloseup",
  "CursorAction",
  "FocusMask",
  "CardExtract",
  "ApprovalState",
  "FailureResolution",
  "ImpactBenefit",
  "CreatorCTA",
  "ActiveEndHold"
] as const;

export type SolomonMotionComponent = typeof SOLOMON_MOTION_COMPONENTS[number];
export type BenchmarkNarrativeFunction = "hook" | "tension" | "proof" | "resolution" | "payoff" | "cta";
export type BenchmarkAvatarState = "hook_lean" | "concerned_pause" | "product_gaze" | "confirmation_reaction" | "direct_cta";
export type BenchmarkAvatarFraming = "tight_closeup" | "picture_in_picture" | "medium";
export type BenchmarkCaptionTreatment = "stomp" | "stack" | "proof_adjacent" | "cta_lockup";

export interface BenchmarkCaptionGroup {
  id: string;
  from: number;
  to: number;
  words: string[];
  treatment: BenchmarkCaptionTreatment;
  emphasis?: string[];
  placement: "top" | "center" | "proof_adjacent" | "bottom";
}

export interface BenchmarkScene {
  id: string;
  from: number;
  to: number;
  narrativeFunction: BenchmarkNarrativeFunction;
  viewerQuestion: string;
  narration: string;
  expectedVisibleResult: string;
  components: SolomonMotionComponent[];
  avatarState?: BenchmarkAvatarState;
  avatarFraming?: BenchmarkAvatarFraming;
  productProofId?: string;
  soundCueIds: string[];
  conceptual: boolean;
}

export interface BenchmarkProductProof {
  id: "tracker-interviewing-state-change";
  workflowId: "update-job-tracker";
  sourcePath: string;
  sourceSha256: string;
  approvedSourceInterval: { startMs: number; endMs: number };
  extractedSourceInterval: { startMs: number; endMs: number };
  crop: { x: number; y: number; width: number; height: number; sourceWidth: number; sourceHeight: number };
  stateChange: string;
  supportedClaimIds: string[];
  expectedVisibleResult: string;
  cursorPolicy: "SOURCE_CURSOR_BOUNDED";
  sourcePixelsAuthentic: true;
  fabricatedInterface: false;
  privacyReceipt: string;
}

export interface SolomonCreatorBenchmarkManifest {
  schemaVersion: typeof SOLOMON_CREATOR_BENCHMARK_SCHEMA_VERSION;
  id: typeof SOLOMON_CREATOR_BENCHMARK_ID;
  canvas: { width: 1080; height: 1920; fps: 30; durationInFrames: 300 };
  productName: "Solomon";
  renderer: {
    composition: "remotion";
    delivery: "ffmpeg";
    capture: "playwright";
    fallback: "existing_ffmpeg_creator_editorial";
  };
  script: string;
  scenes: BenchmarkScene[];
  captions: BenchmarkCaptionGroup[];
  productProof: BenchmarkProductProof;
  cta: {
    actionCount: 1;
    text: "REVIEW SOLOMON";
    disclosure: "PLACEHOLDER CTA · DESTINATION NOT VERIFIED";
    availabilityImplied: false;
  };
}

export interface BenchmarkAvatarMotionSample {
  swayPx: number;
  breathingScale: number;
  headTiltDeg: number;
  torsoLean: number;
  gazeX: number;
  eyeOpen: number;
  gestureProgress: number;
}

export const BENCHMARK_SCRIPT =
  "This opportunity just moved to interviewing—without losing the next step. Solomon keeps the update visible. Review it, then decide what happens next.";

export const BENCHMARK_HOOK_CANDIDATES = [
  {
    text: "This opportunity just moved to interviewing—without losing the next step.",
    supported: true,
    score: 24,
    rationale: "Shows a concrete captured state change and its reviewable outcome immediately."
  },
  {
    text: "One application changed. The next step stayed visible.",
    supported: true,
    score: 22,
    rationale: "Clear and factual, but less specific than the selected interviewing outcome."
  },
  {
    text: "Move an opportunity forward without losing its context.",
    supported: true,
    score: 20,
    rationale: "Outcome-led, but 'context' is more abstract than the visible next-step language."
  },
  {
    text: "Your tracker should show what changed and what comes next.",
    supported: true,
    score: 18,
    rationale: "Understandable but framed as a general opinion rather than a product result."
  },
  {
    text: "Keep the application and its next step in one reviewable place.",
    supported: true,
    score: 19,
    rationale: "Truthful and useful, but slower to establish the captured transformation."
  }
] as const;

export function createSolomonCreatorBenchmarkManifest(sourcePath: string): SolomonCreatorBenchmarkManifest {
  return {
    schemaVersion: SOLOMON_CREATOR_BENCHMARK_SCHEMA_VERSION,
    id: SOLOMON_CREATOR_BENCHMARK_ID,
    canvas: { width: 1080, height: 1920, fps: 30, durationInFrames: 300 },
    productName: "Solomon",
    renderer: {
      composition: "remotion",
      delivery: "ffmpeg",
      capture: "playwright",
      fallback: "existing_ffmpeg_creator_editorial"
    },
    script: BENCHMARK_SCRIPT,
    scenes: [
      scene("hook", 0, 54, "hook", "What concrete outcome happened?", "This opportunity just moved to interviewing", "The outcome is legible by frame 54.", ["CreatorHook", "AvatarCloseup", "KineticCaption"], "hook_lean", "tight_closeup", ["hook-impact"], false),
      scene("tension", 54, 90, "tension", "Will the next step disappear when status changes?", "without losing the next step", "A disclosed conceptual tension card breaks, then resolves toward the proof.", ["AvatarPresenter", "FailureResolution", "KineticCaption"], "concerned_pause", "tight_closeup", ["tension-pulse"], true),
      {
        ...scene("proof", 90, 195, "proof", "Did the application actually move?", "Solomon keeps the update visible", "Authentic Solomon pixels show Product Engineer move from Applied to Interviewing.", ["ProductCloseup", "ProofLabel", "CursorAction", "FocusMask", "EditorialClaim"], "product_gaze", "picture_in_picture", ["proof-whoosh", "source-click", "confirmation"], false),
        productProofId: "tracker-interviewing-state-change"
      },
      scene("payoff", 195, 240, "payoff", "What does this give the viewer?", "Review it, then decide", "The presenter reacts to a visible, reviewable update.", ["AvatarReaction", "ImpactBenefit", "KineticCaption"], "confirmation_reaction", "medium", ["payoff-rise"], false),
      scene("cta", 240, 300, "cta", "What is the single next action?", "what happens next", "A single direct placeholder CTA stays active through the final frame.", ["AvatarCTA", "CreatorCTA", "ActiveEndHold"], "direct_cta", "medium", ["cta-impact", "active-end-bed"], false)
    ],
    captions: [
      caption("caption-01", 0, 24, ["THIS", "OPPORTUNITY"], "stomp", "top", ["OPPORTUNITY"]),
      caption("caption-02", 24, 54, ["JUST", "MOVED", "TO", "INTERVIEWING"], "stomp", "top", ["INTERVIEWING"]),
      caption("caption-03", 54, 74, ["WITHOUT", "LOSING"], "stack", "center", ["WITHOUT"]),
      caption("caption-04", 74, 102, ["THE", "NEXT", "STEP"], "stack", "center", ["NEXT", "STEP"]),
      caption("caption-05", 122, 145, ["SOLOMON", "KEEPS"], "proof_adjacent", "proof_adjacent", ["SOLOMON"]),
      caption("caption-06", 145, 168, ["THE", "UPDATE", "VISIBLE"], "proof_adjacent", "proof_adjacent", ["VISIBLE"]),
      caption("caption-07", 185, 207, ["REVIEW", "IT"], "stack", "bottom", ["REVIEW"]),
      caption("caption-08", 207, 229, ["THEN", "DECIDE"], "stack", "bottom", ["DECIDE"]),
      caption("caption-09", 229, 258, ["WHAT", "HAPPENS", "NEXT"], "cta_lockup", "bottom", ["NEXT"])
    ],
    productProof: {
      id: "tracker-interviewing-state-change",
      workflowId: "update-job-tracker",
      sourcePath,
      sourceSha256: "5d415cad93657f98f4be9f00595b8344e7bbc393fad5b1d213763243db49e639",
      approvedSourceInterval: { startMs: 4_600, endMs: 22_967 },
      extractedSourceInterval: { startMs: 16_300, endMs: 19_800 },
      crop: { x: 30, y: 80, width: 760, height: 560, sourceWidth: 1440, sourceHeight: 900 },
      stateChange: "Product Engineer moves from Applied to Interviewing while the source cursor performs the bounded status action.",
      supportedClaimIds: ["claim-tracker", "claim-tracker-visible", "claim-tracker-next-step"],
      expectedVisibleResult: "Applied changes from 2 to 1, Interviewing changes from 0 to 1, and Product Engineer appears in Interviewing.",
      cursorPolicy: "SOURCE_CURSOR_BOUNDED",
      sourcePixelsAuthentic: true,
      fabricatedInterface: false,
      privacyReceipt: "Inherited from the approved deterministic Solomon capture; safe-demo mode states synthetic demo data only."
    },
    cta: {
      actionCount: 1,
      text: "REVIEW SOLOMON",
      disclosure: "PLACEHOLDER CTA · DESTINATION NOT VERIFIED",
      availabilityImplied: false
    }
  };
}

export function assertSolomonCreatorBenchmarkManifest(manifest: SolomonCreatorBenchmarkManifest): void {
  if (manifest.id !== SOLOMON_CREATOR_BENCHMARK_ID || manifest.schemaVersion !== "1") throw new Error("Benchmark identity is invalid.");
  if (manifest.canvas.width !== 1080 || manifest.canvas.height !== 1920 || manifest.canvas.fps !== 30 || manifest.canvas.durationInFrames !== 300) {
    throw new Error("Benchmark canvas must be 1080x1920, 30 fps and 300 frames.");
  }
  if (manifest.scenes[0]?.from !== 0 || manifest.scenes.at(-1)?.to !== 300) throw new Error("Benchmark scenes must cover all 300 frames.");
  for (let index = 0; index < manifest.scenes.length; index += 1) {
    const current = manifest.scenes[index]!;
    const previous = manifest.scenes[index - 1];
    if (current.to <= current.from || (previous && previous.to !== current.from)) throw new Error("Benchmark scenes must be contiguous and non-empty.");
  }
  const functions = new Set(manifest.scenes.map(({ narrativeFunction }) => narrativeFunction));
  for (const required of ["hook", "tension", "proof", "payoff", "cta"] as const) {
    if (!functions.has(required)) throw new Error(`Benchmark is missing ${required}.`);
  }
  if (manifest.scenes.find(({ narrativeFunction }) => narrativeFunction === "hook")!.to > 60) throw new Error("Concrete hook outcome must land by frame 60.");
  if (manifest.captions.some(({ words, from, to }) => words.length > 4 || to <= from)) throw new Error("Caption groups must be non-empty and no longer than four words.");
  if (!manifest.productProof.sourcePixelsAuthentic || manifest.productProof.fabricatedInterface) throw new Error("Benchmark proof must use authentic product pixels.");
  if (manifest.productProof.extractedSourceInterval.startMs < manifest.productProof.approvedSourceInterval.startMs ||
      manifest.productProof.extractedSourceInterval.endMs > manifest.productProof.approvedSourceInterval.endMs) {
    throw new Error("Benchmark proof interval falls outside the approved source interval.");
  }
  if (manifest.cta.actionCount !== 1 || manifest.cta.availabilityImplied || !manifest.cta.disclosure.includes("NOT VERIFIED")) {
    throw new Error("Benchmark CTA must be singular and visibly disclosed.");
  }
  const states = new Set(manifest.scenes.map(({ avatarState }) => avatarState).filter(Boolean));
  for (const required of ["hook_lean", "concerned_pause", "direct_cta"] as const) {
    if (!states.has(required)) throw new Error(`Benchmark avatar is missing ${required}.`);
  }
}

export function benchmarkPropsFromManifest(manifest: SolomonCreatorBenchmarkManifest): Record<string, unknown> {
  assertSolomonCreatorBenchmarkManifest(manifest);
  return JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
}

export function benchmarkAvatarMotionSample(frame: number, state: BenchmarkAvatarState): BenchmarkAvatarMotionSample {
  const stateIndex = ["hook_lean", "concerned_pause", "product_gaze", "confirmation_reaction", "direct_cta"].indexOf(state);
  const phase = ((frame % 42) + 42) % 42;
  const gestureProgress = phase <= 12
    ? phase / 12
    : phase <= 30
      ? 1 - ((phase - 12) / 18) * 0.1
      : Math.max(0, 0.9 * (1 - (phase - 30) / 11));
  return {
    swayPx: Math.sin((frame + stateIndex * 9) / 10.5) * (state === "concerned_pause" ? 5 : 9),
    breathingScale: 1 + Math.sin(frame / 8.5) * 0.008,
    headTiltDeg: state === "concerned_pause" ? -8 : state === "product_gaze" ? 11 : state === "direct_cta" ? -4 : 4,
    torsoLean: state === "hook_lean" ? 0.055 : state === "confirmation_reaction" ? -0.03 : 0,
    gazeX: state === "product_gaze" ? -16 : state === "direct_cta" ? 7 : 0,
    eyeOpen: frame % 71 >= 65 ? 0.18 : 1,
    gestureProgress
  };
}

export function auditBenchmarkAvatarMotion(manifest: SolomonCreatorBenchmarkManifest): {
  passed: boolean;
  longestUnchangedFrames: number;
  maximumAllowedUnchangedFrames: 45;
  distinctStoryStates: number;
  majorBeatChannelChanges: Array<{ from: string; to: string; changedChannels: number }>;
} {
  const avatarScenes = manifest.scenes.filter((scene): scene is BenchmarkScene & { avatarState: BenchmarkAvatarState } => Boolean(scene.avatarState));
  let longestUnchangedFrames = 0;
  for (const scene of avatarScenes) {
    let run = 0;
    let previous = "";
    for (let frame = 0; frame < scene.to - scene.from; frame += 1) {
      const current = JSON.stringify(Object.values(benchmarkAvatarMotionSample(frame, scene.avatarState)).map((value) => Number(value.toFixed(5))));
      run = current === previous ? run + 1 : 0;
      longestUnchangedFrames = Math.max(longestUnchangedFrames, run);
      previous = current;
    }
  }
  const majorBeatChannelChanges = avatarScenes.slice(1).map((scene, index) => {
    const previous = avatarScenes[index]!;
    const from = benchmarkAvatarMotionSample(12, previous.avatarState);
    const to = benchmarkAvatarMotionSample(12, scene.avatarState);
    const changedChannels = (Object.keys(from) as Array<keyof BenchmarkAvatarMotionSample>).filter((key) => Math.abs(from[key] - to[key]) > 0.0001).length;
    return { from: previous.avatarState, to: scene.avatarState, changedChannels };
  });
  const distinctStoryStates = new Set(avatarScenes.map(({ avatarState }) => avatarState)).size;
  return {
    passed: longestUnchangedFrames <= 45 && distinctStoryStates >= 3 && majorBeatChannelChanges.every(({ changedChannels }) => changedChannels >= 2),
    longestUnchangedFrames,
    maximumAllowedUnchangedFrames: 45,
    distinctStoryStates,
    majorBeatChannelChanges
  };
}

function scene(
  id: string,
  from: number,
  to: number,
  narrativeFunction: BenchmarkNarrativeFunction,
  viewerQuestion: string,
  narration: string,
  expectedVisibleResult: string,
  components: SolomonMotionComponent[],
  avatarState: BenchmarkAvatarState,
  avatarFraming: BenchmarkAvatarFraming,
  soundCueIds: string[],
  conceptual: boolean
): BenchmarkScene {
  return { id, from, to, narrativeFunction, viewerQuestion, narration, expectedVisibleResult, components, avatarState, avatarFraming, soundCueIds, conceptual };
}

function caption(
  id: string,
  from: number,
  to: number,
  words: string[],
  treatment: BenchmarkCaptionTreatment,
  placement: BenchmarkCaptionGroup["placement"],
  emphasis: string[]
): BenchmarkCaptionGroup {
  return { id, from, to, words, treatment, placement, emphasis };
}
