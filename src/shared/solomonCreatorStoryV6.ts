import { z } from "zod";
import {
  auditRobotPerformance,
  creativeDirectionSchema,
  ctaPolicySchema,
  evidenceBindingSchema,
  robotPerformanceSchema,
  type CreativeDirection,
  type CtaPolicy,
  type EvidenceBinding,
  type RobotPerformance
} from "./gideonRobotV6";
import {
  createSolomonCreatorStoryManifest,
  type SolomonCaptureApproval,
  type SolomonStoryAssetId,
  type SolomonStorySource
} from "./solomonCreatorStory";

export const SOLOMON_CREATOR_STORY_V6_ID = "solomon-creator-story-v6-robot" as const;
export const SOLOMON_CREATOR_STORY_V6_SCHEMA_VERSION = "6" as const;
export const SOLOMON_CREATOR_STORY_V6_FPS = 30 as const;
export const SOLOMON_CREATOR_STORY_V6_DURATION_FRAMES = 1_080 as const;

export type V6SceneKind = "presenter" | "product" | "editorial" | "comparison" | "cta";
export type V6CaptionRole = "spoken_emphasis" | "editorial_takeover" | "proof_label" | "cta";
export type V6CaptionPlacement = "top" | "center" | "lower" | "proof";

export interface V6CameraPlan {
  anchorX: number;
  anchorY: number;
  zoomStart: number;
  zoomEnd: number;
  settleFrames: number;
  cursorRequired: boolean;
  focusMode: "selective_crop" | "outline" | "spotlight";
}

export interface V6Scene {
  id: string;
  from: number;
  to: number;
  kind: V6SceneKind;
  storyFunction: string;
  narration: string;
  visibleResult: string;
  assetId?: SolomonStoryAssetId;
  focusTarget?: { x: number; y: number; width: number; height: number };
  camera?: V6CameraPlan;
  performance?: RobotPerformance;
  evidenceClaimIds: string[];
  conceptualDisclosure?: string;
  deliberateHold?: boolean;
}

export interface V6Caption {
  id: string;
  from: number;
  to: number;
  words: string[];
  emphasis: string[];
  role: V6CaptionRole;
  placement: V6CaptionPlacement;
  deliberateHold?: boolean;
}

export interface V6BeatBinding {
  beatId: string;
  narrationStartFrame: number;
  visualProofFrame: number;
  toleranceFrames: 9;
  claimId?: string;
}

export interface SolomonCreatorStoryV6Manifest {
  schemaVersion: typeof SOLOMON_CREATOR_STORY_V6_SCHEMA_VERSION;
  id: typeof SOLOMON_CREATOR_STORY_V6_ID;
  productName: "Solomon";
  canvas: { width: 1080; height: 1920; fps: 30; durationInFrames: 1080 };
  creativeDirection: CreativeDirection;
  script: string;
  sources: SolomonStorySource[];
  evidenceBindings: EvidenceBinding[];
  scenes: V6Scene[];
  captions: V6Caption[];
  beatBindings: V6BeatBinding[];
  eventFrames: number[];
  cta: CtaPolicy;
}

export const SOLOMON_CREATOR_STORY_V6_SCRIPT =
  "This Faire role just moved to Interviewing, and Solomon surfaced the person who can help next. Normally, you would rebuild that next step across five tabs: the job post, LinkedIn, notes, contacts, and a blank email. Solomon keeps the Senior Product Engineer role and Faire together. Then it shows why this contact is relevant: hiring manager, direct match, verified. That evidence follows the opportunity into a four-part draft: the role, the company, the reason for reaching out, and a clear ask. So the message is personalized, not another generic template. And nothing is sent automatically. Solomon prepares the draft; you review and edit every word. One job becomes one relevant person, visible proof, and a draft ready for your decision. Follow Gideon for the full Solomon demo.";

const HASHES: Record<SolomonStoryAssetId, string> = {
  jobs: "f01434def589919da1b77d1e2a6e57185cdbee43982b1440eb61f5e6122c6704",
  tracker: "d638462cb696da5d1724413a55baba58f19e4dd55e36fc39cafd461fecc99b8b",
  contacts: "a36e85e2b24f2a8c66b6b7b11a9f039ffc5a251e838097bf38c5ab4488e5c301",
  outreach: "9733ef9c20e54f909f4b57f5d41484ad1582dcb18e9680a7c182424d21c61dfc"
};

const manifestRuntimeSchema = z.object({
  schemaVersion: z.literal("6"),
  id: z.literal(SOLOMON_CREATOR_STORY_V6_ID),
  productName: z.literal("Solomon"),
  canvas: z.object({ width: z.literal(1080), height: z.literal(1920), fps: z.literal(30), durationInFrames: z.literal(1080) }),
  creativeDirection: creativeDirectionSchema,
  script: z.string().min(1),
  sources: z.array(z.object({ id: z.enum(["jobs", "tracker", "contacts", "outreach"]), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), authentic: z.literal(true), approved: z.literal(true) }).passthrough()).length(4),
  evidenceBindings: z.array(evidenceBindingSchema).min(4),
  scenes: z.array(z.object({
    id: z.string().min(1), from: z.number().int().nonnegative(), to: z.number().int().positive(),
    kind: z.enum(["presenter", "product", "editorial", "comparison", "cta"]), storyFunction: z.string().min(1),
    narration: z.string(), visibleResult: z.string().min(1), assetId: z.enum(["jobs", "tracker", "contacts", "outreach"]).optional(),
    focusTarget: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
    camera: z.object({ anchorX: z.number(), anchorY: z.number(), zoomStart: z.number(), zoomEnd: z.number(), settleFrames: z.number().int().min(8), cursorRequired: z.boolean(), focusMode: z.enum(["selective_crop", "outline", "spotlight"]) }).optional(),
    performance: robotPerformanceSchema.optional(), evidenceClaimIds: z.array(z.string()), conceptualDisclosure: z.string().optional(), deliberateHold: z.boolean().optional()
  })).min(14).max(22),
  captions: z.array(z.object({ id: z.string(), from: z.number().int(), to: z.number().int(), words: z.array(z.string()).min(1).max(5), emphasis: z.array(z.string()), role: z.enum(["spoken_emphasis", "editorial_takeover", "proof_label", "cta"]), placement: z.enum(["top", "center", "lower", "proof"]), deliberateHold: z.boolean().optional() })),
  beatBindings: z.array(z.object({ beatId: z.string(), narrationStartFrame: z.number().int(), visualProofFrame: z.number().int(), toleranceFrames: z.literal(9), claimId: z.string().optional() })),
  eventFrames: z.array(z.number().int()),
  cta: ctaPolicySchema
});

export function createSolomonCreatorStoryV6Manifest(
  paths: Record<SolomonStoryAssetId, string>,
  captureApproval: SolomonCaptureApproval = { environment: "authenticated_safe_demo_fixture", publicReleaseApproved: false }
): SolomonCreatorStoryV6Manifest {
  const sources = createSolomonCreatorStoryManifest(paths, captureApproval).sources;
  const evidenceBindings: EvidenceBinding[] = [
    evidence("status", "The Faire role is in Interviewing.", "tracker", { startMs: 500, endMs: 8_600 }, { x: 0.02, y: 0.42, width: 0.66, height: 0.13 }),
    evidence("role-company", "The opportunity is Senior Product Engineer at Faire.", "jobs", { startMs: 500, endMs: 10_000 }, { x: 0.03, y: 0.07, width: 0.48, height: 0.18 }),
    evidence("contact-relevance", "The contact is a direct, verified hiring-manager match.", "contacts", { startMs: 500, endMs: 9_800 }, { x: 0.02, y: 0.42, width: 0.49, height: 0.19 }),
    evidence("draft-context", "The draft includes role and company context and remains editable and not sent.", "outreach", { startMs: 500, endMs: 8_900 }, { x: 0.4, y: 0.08, width: 0.57, height: 0.42 })
  ];
  const scenes: V6Scene[] = [
    scene("hook-robot", 0, 39, "presenter", "consequence hook", "This Faire role just moved to Interviewing,", "Gideon leans into camera before the consequence.", perf("surprised", "camera", "direct_emphasis", "extreme_close", "impact", .96, .62, 0), []),
    scene("hook-proof", 39, 135, "product", "proof by 2.2 seconds", "and Solomon surfaced the person who can help next.", "Interviewing and the next-person consequence share one focal crop.", undefined, ["status"], "tracker", { x: .02, y: .42, width: .66, height: .13 }, camera(.5, .48, 1.26, 1.32, true, "outline")),
    scene("problem-setup", 135, 171, "presenter", "problem reaction", "Normally, you would rebuild that next step", "Gideon reacts toward the scattered workflow.", perf("concerned", "product_left", "point_left", "side_right", "strong", .8, .22, -.45), []),
    scene("five-tabs", 171, 304, "editorial", "fragmented old way", "across five tabs: the job post, LinkedIn, notes, contacts, and a blank email.", "Five abstract tool cards scatter then collapse; no product pixels are implied.", undefined, [], undefined, undefined, undefined, "CONCEPTUAL WORKFLOW ILLUSTRATION"),
    scene("role-proof", 304, 388, "product", "role and company proof", "Solomon keeps the Senior Product Engineer role and Faire together.", "The genuine role and company remain readable in a selected crop.", undefined, ["role-company"], "jobs", { x: .03, y: .07, width: .48, height: .18 }, camera(.47, .3, 1.22, 1.3, false, "selective_crop")),
    scene("contact-intro", 388, 408, "presenter", "contact setup", "Then it shows why this contact is relevant:", "Gideon turns and presents the incoming evidence.", perf("curious", "product_right", "present_object", "side_left", "medium", .66, .12, .5), []),
    scene("contact-proof", 408, 498, "product", "relevance evidence", "hiring manager, direct match, verified.", "Three genuine relevance labels remain readable and privacy masked.", undefined, ["contact-relevance"], "contacts", { x: .03, y: .49, width: .34, height: .13 }, camera(.46, .5, 1.34, 1.44, false, "spotlight")),
    scene("draft-bridge", 498, 525, "presenter", "evidence handoff", "That evidence follows the opportunity", "Gideon guides the viewer from proof toward the draft.", perf("focused", "product_left", "point_left", "three_quarter", "strong", .78, .3, -.4), []),
    scene("draft-four-parts", 525, 615, "editorial", "four-part draft anatomy", "into a four-part draft: the role, the company, the reason for reaching out, and a clear ask.", "Four disclosed conceptual labels assemble around a product-shaped draft frame.", undefined, [], undefined, undefined, undefined, "CONCEPTUAL DRAFT ANATOMY"),
    scene("draft-proof", 615, 692, "product", "personalized draft proof", "So the message is personalized,", "The genuine draft crop visibly contains role and company context.", undefined, ["draft-context"], "outreach", { x: .42, y: .18, width: .55, height: .3 }, camera(.52, .43, 1.34, 1.48, false, "selective_crop")),
    scene("generic-v-personal", 692, 768, "comparison", "before and after", "not another generic template.", "Generic and personalized states contrast with the product proof clearly separated.", perf("confident", "caption", "compare", "pip", "strong", .72, .15, 0), ["draft-context"], undefined, undefined, undefined, "CONCEPTUAL COMPARISON; RIGHT SIDE REFERENCES VERIFIED PRODUCT PROOF"),
    scene("approval-warning", 768, 805, "presenter", "automation boundary", "And nothing is sent automatically.", "Gideon pauses and signals the human checkpoint.", perf("concerned", "camera", "open_palm", "close", "impact", .9, .45, 0), []),
    scene("approval-proof", 805, 894, "product", "editable approval gate", "Solomon prepares the draft; you review and edit every word.", "Draft, not sent, and edit controls remain readable.", undefined, ["draft-context"], "outreach", { x: .4, y: .08, width: .57, height: .42 }, camera(.52, .4, 1.28, 1.38, true, "outline")),
    scene("payoff-job", 894, 926, "comparison", "payoff one", "One job becomes", "The verified job card enters the payoff chain.", perf("focused", "product_right", "count_one", "lower_reaction", "strong", .72, .1, .45), ["role-company"]),
    scene("payoff-person", 926, 958, "comparison", "payoff two", "one relevant person,", "A privacy-safe person card attaches to the job.", perf("relieved", "product_left", "point_left", "lower_reaction", "strong", .74, .15, -.45), ["contact-relevance"]),
    scene("payoff-proof", 958, 990, "comparison", "payoff three", "visible proof,", "The relevance evidence attaches next.", perf("confident", "caption", "approval", "pip", "strong", .76, .1, 0), ["contact-relevance"]),
    scene("payoff-draft", 990, 1_021, "comparison", "payoff four", "and a draft ready for your decision.", "The connected chain resolves into one editable draft.", perf("relieved", "product_right", "celebrate", "side_left", "impact", .94, .38, .5), ["draft-context"]),
    scene("cta", 1_021, 1_056, "cta", "single verified action", "Follow Gideon for the full Solomon demo.", "Gideon points to one platform-native follow action and holds it.", perf("confident", "cta", "cta_down", "cta_close", "impact", .92, .4, 0), []),
    scene("brand-sting", 1_056, 1_080, "cta", "brand resolution", "", "The Gideon and Solomon identity persists through the final frame.", perf("confident", "camera", "neutral", "extreme_close", "rest", .2, 0, 0), [], undefined, undefined, undefined, undefined, true)
  ];
  const captions: V6Caption[] = [
    cap("c01", 0, 24, ["THIS", "FAIRE", "ROLE"], ["FAIRE"], "spoken_emphasis", "lower"), cap("c02", 27, 51, ["MOVED", "TO", "INTERVIEWING"], ["INTERVIEWING"], "spoken_emphasis", "lower"),
    cap("c03", 78, 102, ["WHO", "HELPS", "NEXT?"], ["NEXT?"], "proof_label", "top"), cap("c04", 141, 165, ["NORMALLY..."], ["NORMALLY..."], "spoken_emphasis", "lower"),
    cap("c05", 177, 201, ["FIVE", "TABS"], ["FIVE"], "editorial_takeover", "center"), cap("c06", 252, 276, ["REBUILD", "EVERYTHING"], ["EVERYTHING"], "editorial_takeover", "center"),
    cap("c07", 310, 334, ["ROLE", "+", "COMPANY"], ["ROLE", "COMPANY"], "proof_label", "top"), cap("c08", 390, 408, ["WHY", "THEY'RE", "RELEVANT"], ["RELEVANT"], "spoken_emphasis", "lower"),
    cap("c09", 414, 438, ["HIRING", "MANAGER"], ["MANAGER"], "proof_label", "top"), cap("c10", 444, 468, ["DIRECT", "MATCH"], ["DIRECT"], "proof_label", "top"), cap("c11", 474, 498, ["VERIFIED"], ["VERIFIED"], "proof_label", "top"),
    cap("c12", 504, 525, ["EVIDENCE", "FOLLOWS"], ["EVIDENCE"], "spoken_emphasis", "lower"),
    cap("c17", 621, 645, ["PERSONALIZED"], ["PERSONALIZED"], "proof_label", "top"), cap("c18", 711, 735, ["NOT", "GENERIC"], ["NOT"], "editorial_takeover", "center"),
    cap("c19", 774, 798, ["NOTHING", "SENT"], ["NOTHING"], "spoken_emphasis", "lower"), cap("c20", 811, 835, ["DRAFT", "—", "NOT", "SENT"], ["NOT", "SENT"], "proof_label", "top"), cap("c21", 852, 876, ["YOU", "REVIEW"], ["YOU"], "proof_label", "top"),
    cap("c22", 900, 924, ["ONE", "JOB"], ["JOB"], "spoken_emphasis", "lower"), cap("c23", 930, 954, ["ONE", "PERSON"], ["PERSON"], "spoken_emphasis", "lower"), cap("c24", 960, 984, ["VISIBLE", "PROOF"], ["PROOF"], "spoken_emphasis", "lower"), cap("c25", 994, 1_018, ["READY", "FOR", "YOU"], ["YOU"], "spoken_emphasis", "lower"),
    cap("c26", 1_023, 1_039, ["FOLLOW", "GIDEON"], ["GIDEON"], "cta", "lower"), cap("c27", 1_040, 1_056, ["FULL", "SOLOMON", "DEMO"], ["SOLOMON"], "cta", "lower"), cap("c28", 1_056, 1_080, ["GIDEON", "×", "SOLOMON"], ["SOLOMON"], "cta", "lower", true)
  ];
  const beatBindings: V6BeatBinding[] = [
    bind("hook", 0, 0), bind("hook-proof", 39, 39, "status"), bind("five-tabs", 171, 171), bind("role-company", 304, 304, "role-company"),
    bind("contact", 408, 408, "contact-relevance"), bind("draft-anatomy", 525, 525), bind("draft", 615, 615, "draft-context"), bind("approval", 805, 805, "draft-context"), bind("payoff", 894, 894), bind("cta", 1_021, 1_021)
  ];
  const manifest: SolomonCreatorStoryV6Manifest = {
    schemaVersion: "6", id: SOLOMON_CREATOR_STORY_V6_ID, productName: "Solomon",
    canvas: { width: 1080, height: 1920, fps: 30, durationInFrames: 1_080 },
    creativeDirection: {
      audience: "Founders and product teams evaluating practical AI-assisted job-search workflows.",
      promise: "Turn one opportunity into a relevant person and an editable, evidence-grounded outreach draft.",
      consequenceHook: "A status change immediately reveals who can help next.",
      tone: ["credible", "warm", "fast", "product-led"],
      pacing: { targetWordsPerMinute: 215, targetVisualStates: 19 },
      visualGrammar: ["robot_studio", "product_proof", "editorial_takeover", "split_comparison", "cta"],
      palette: { ink: "#07111f", paper: "#f7f4ed", mint: "#42e6b4", amber: "#ffbd59", coral: "#ff6f61" },
      typography: { spoken: "Arial Black", editorial: "Georgia Italic" },
      productFocus: "selective_crop",
      forbidden: ["speech bubbles", "global dimming", "unsupported delivery CTA", "continuous workflow navigation", "lip-sync implication"]
    },
    script: SOLOMON_CREATOR_STORY_V6_SCRIPT, sources, evidenceBindings, scenes, captions, beatBindings,
    eventFrames: Array.from(new Set([...scenes.flatMap(({ from, to }) => [from, to - 1]), ...captions.flatMap(({ from, to }) => [from, to - 1])])).sort((a, b) => a - b),
    cta: { actionCount: 1, text: "FOLLOW GIDEON", destination: "platform_follow", destinationVerified: true, publicUrlImplied: false, deliveryPromised: false }
  };
  assertSolomonCreatorStoryV6Manifest(manifest);
  return manifest;
}

export function auditSolomonCreatorStoryV6(manifest: SolomonCreatorStoryV6Manifest) {
  const words = manifest.script.match(/[A-Za-z0-9']+/g)?.length ?? 0;
  const wpm = words / (manifest.canvas.durationInFrames / manifest.canvas.fps / 60);
  const productFrames = manifest.scenes.filter(({ kind }) => kind === "product").reduce((sum, sceneItem) => sum + sceneItem.to - sceneItem.from, 0);
  const productOccupancy = productFrames / manifest.canvas.durationInFrames;
  const beatTimingViolations = manifest.beatBindings.filter(({ narrationStartFrame, visualProofFrame, toleranceFrames }) => Math.abs(narrationStartFrame - visualProofFrame) > toleranceFrames).map(({ beatId }) => beatId);
  const captionCadenceViolations = manifest.captions.filter(({ from, to, deliberateHold }) => !deliberateHold && (to - from < 9 || to - from > 24)).map(({ id }) => id);
  const productScenesWithoutEvidence = manifest.scenes.filter(({ kind, evidenceClaimIds }) => kind === "product" && evidenceClaimIds.length === 0).map(({ id }) => id);
  const missingClaims = manifest.scenes.flatMap(({ evidenceClaimIds }) => evidenceClaimIds).filter((claimId) => !manifest.evidenceBindings.some((binding) => binding.claimId === claimId));
  const cursorPolicyViolations = manifest.scenes.filter(({ kind, camera, storyFunction }) => kind === "product" && camera?.cursorRequired && !/approval|proof by/i.test(storyFunction)).map(({ id }) => id);
  const robot = auditRobotPerformance(manifest.scenes);
  const publicCopy = `${manifest.script} ${manifest.cta.text}`;
  const forbiddenCopy = /comment|send you|nexusreach|placeholder|todo/i.test(publicCopy);
  const proofByFrame = manifest.scenes.find(({ evidenceClaimIds }) => evidenceClaimIds.length > 0)?.from ?? Infinity;
  const passed = wpm >= 205 && wpm <= 225 && productOccupancy >= .3 && productOccupancy <= .45 && proofByFrame <= 66 && beatTimingViolations.length === 0 && captionCadenceViolations.length === 0 && productScenesWithoutEvidence.length === 0 && missingClaims.length === 0 && cursorPolicyViolations.length === 0 && !forbiddenCopy && robot.passed;
  return { passed, words, wordsPerMinute: wpm, productOccupancy, proofByFrame, beatTimingViolations, captionCadenceViolations, productScenesWithoutEvidence, missingClaims, cursorPolicyViolations, forbiddenCopy, robot };
}

export function assertSolomonCreatorStoryV6Manifest(manifest: SolomonCreatorStoryV6Manifest): void {
  manifestRuntimeSchema.parse(manifest);
  manifest.scenes.forEach((sceneItem, index) => {
    if (sceneItem.to <= sceneItem.from || (index === 0 ? sceneItem.from !== 0 : manifest.scenes[index - 1]!.to !== sceneItem.from)) throw new Error(`V6 scene ${sceneItem.id} is not contiguous.`);
    if (sceneItem.kind === "product" && (!sceneItem.assetId || !sceneItem.focusTarget || !sceneItem.camera)) throw new Error(`V6 product scene ${sceneItem.id} lacks proof targeting.`);
    if ((sceneItem.kind === "editorial" || sceneItem.kind === "comparison") && !sceneItem.conceptualDisclosure && sceneItem.evidenceClaimIds.length === 0) throw new Error(`V6 conceptual scene ${sceneItem.id} lacks disclosure.`);
  });
  if (manifest.scenes.at(-1)?.to !== 1_080) throw new Error("V6 scenes must cover the full timeline.");
  if (manifest.sources.some((sourceItem) => sourceItem.sourceSha256 !== HASHES[sourceItem.id])) throw new Error("V6 source hash mismatch.");
  const narration = manifest.scenes.map(({ narration }) => narration).filter(Boolean).join(" ");
  if (narration !== manifest.script) throw new Error("V6 scene narration must exactly match the approved script.");
  const audit = auditSolomonCreatorStoryV6(manifest);
  if (!audit.passed) throw new Error(`V6 manifest quality gates failed: ${JSON.stringify(audit)}`);
}

function evidence(claimId: string, claim: string, assetId: SolomonStoryAssetId, verifiedInterval: { startMs: number; endMs: number }, visibleRegion: { x: number; y: number; width: number; height: number }): EvidenceBinding {
  return evidenceBindingSchema.parse({ claimId, claim, assetId, sourceSha256: HASHES[assetId], verifiedInterval, visibleRegion, approved: true });
}

function perf(emotion: RobotPerformance["emotion"], gaze: RobotPerformance["gaze"], gesture: RobotPerformance["gesture"], framing: RobotPerformance["framing"], speechState: RobotPerformance["speechState"], energy: number, lean: number, headTurn: number): RobotPerformance {
  return robotPerformanceSchema.parse({ emotion, gaze, gesture, framing, speechState, energy, lean, headTurn, gestureLeadFrames: 5, gazeLeadFrames: 3, semantic: true });
}

function camera(anchorX: number, anchorY: number, zoomStart: number, zoomEnd: number, cursorRequired: boolean, focusMode: V6CameraPlan["focusMode"]): V6CameraPlan {
  return { anchorX, anchorY, zoomStart, zoomEnd, settleFrames: 15, cursorRequired, focusMode };
}

function scene(id: string, from: number, to: number, kind: V6SceneKind, storyFunction: string, narration: string, visibleResult: string, performance: RobotPerformance | undefined, evidenceClaimIds: string[], assetId?: SolomonStoryAssetId, focusTarget?: V6Scene["focusTarget"], cameraPlan?: V6CameraPlan, conceptualDisclosure?: string, deliberateHold?: boolean): V6Scene {
  return { id, from, to, kind, storyFunction, narration, visibleResult, performance, evidenceClaimIds, assetId, focusTarget, camera: cameraPlan, conceptualDisclosure, deliberateHold };
}

function cap(id: string, from: number, to: number, words: string[], emphasis: string[], role: V6CaptionRole, placement: V6CaptionPlacement, deliberateHold = false): V6Caption {
  return { id, from, to, words, emphasis, role, placement, deliberateHold };
}

function bind(beatId: string, narrationStartFrame: number, visualProofFrame: number, claimId?: string): V6BeatBinding {
  return { beatId, narrationStartFrame, visualProofFrame, toleranceFrames: 9, claimId };
}
