import { z } from "zod";
import { directRobotPerformance, robotDirectionSchema, type RobotDirection } from "./gideonRobotV7";
import { createSolomonCreatorStoryManifest, type SolomonCaptureApproval, type SolomonStoryAssetId, type SolomonStorySource } from "./solomonCreatorStory";

export const SOLOMON_CREATOR_STORY_V7_ID = "solomon-creator-story-v7-robot" as const;
export const SOLOMON_CREATOR_STORY_V7_DURATION_FRAMES = 1_080 as const;
export type V7SceneKind = "product" | "robot" | "concept" | "comparison" | "payoff" | "cta";
export type V7CaptionRole = "conversational" | "memory_anchor" | "evidence" | "cta";

const HASHES: Record<SolomonStoryAssetId, string> = {
  jobs: "f01434def589919da1b77d1e2a6e57185cdbee43982b1440eb61f5e6122c6704",
  tracker: "d638462cb696da5d1724413a55baba58f19e4dd55e36fc39cafd461fecc99b8b",
  contacts: "a36e85e2b24f2a8c66b6b7b11a9f039ffc5a251e838097bf38c5ab4488e5c301",
  outreach: "9733ef9c20e54f909f4b57f5d41484ad1582dcb18e9680a7c182424d21c61dfc"
};

export const atomicClaimSchema = z.object({
  id: z.string().min(1),
  clause: z.string().min(1),
  assetId: z.enum(["jobs", "tracker", "contacts", "outreach"]),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  verifiedInterval: z.object({ startMs: z.number().nonnegative(), endMs: z.number().positive() }),
  proofRegion: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }),
  requiredReadableText: z.array(z.string().min(1)).min(1),
  proofStartFrame: z.number().int().nonnegative().max(1_079),
  actionFrame: z.number().int().nonnegative().max(1_079).optional(),
  resultFrame: z.number().int().nonnegative().max(1_079),
  qualification: z.string().min(1),
  approved: z.literal(true)
}).superRefine((claim, context) => {
  if (claim.verifiedInterval.endMs <= claim.verifiedInterval.startMs) context.addIssue({ code: "custom", message: "Atomic claim interval must be positive." });
  if (claim.proofRegion.x + claim.proofRegion.width > 1 || claim.proofRegion.y + claim.proofRegion.height > 1) context.addIssue({ code: "custom", message: "Atomic claim proof region leaves the source." });
  if (claim.resultFrame < claim.proofStartFrame) context.addIssue({ code: "custom", message: "Atomic claim result precedes proof." });
});

export interface V7Scene {
  id: string;
  from: number;
  to: number;
  kind: V7SceneKind;
  narrativeFunction: "hook" | "problem" | "proof" | "mechanism" | "trust" | "payoff" | "cta";
  narration: string;
  visibleResult: string;
  claimIds: string[];
  semanticEventFrames: number[];
  assetId?: SolomonStoryAssetId;
  focusTarget?: { x: number; y: number; width: number; height: number };
  camera?: { zoomStart: number; zoomEnd: number; anchorX: number; anchorY: number; settleFrames: number; cursorRequired: boolean };
  robot?: RobotDirection;
  conceptualDisclosure?: string;
  recipe: "status_result" | "person_reason" | "fragmentation_collapse" | "evidence_to_draft" | "generic_contextual" | "edit_decide" | "connected_result" | "robot_performance" | "solomon_cta";
}

export interface V7Caption {
  id: string;
  from: number;
  to: number;
  role: V7CaptionRole;
  text: string;
  emphasis: string[];
  placement: "top" | "seam" | "center" | "lower";
}

export interface SolomonCreatorStoryV7Manifest {
  schemaVersion: "7";
  id: typeof SOLOMON_CREATOR_STORY_V7_ID;
  canvas: { width: 1080; height: 1920; fps: 30; durationInFrames: 1080 };
  distributionObjective: {
    mode: "solomon_product_marketing";
    primaryBrand: "Solomon";
    publicFacingBrands: ["Solomon"];
    audience: string;
    promise: string;
    desiredAction: "platform_save";
    ctaText: "SAVE THIS SOLOMON WORKFLOW";
    destinationVerified: true;
    publicUrlVerified: false;
    commentAutomationVerified: false;
    accountIdentity: "SOLOMON";
  };
  script: string;
  sources: SolomonStorySource[];
  claims: z.infer<typeof atomicClaimSchema>[];
  hookClaimIds: ["status_changed", "contact_surfaced"];
  scenes: V7Scene[];
  captions: V7Caption[];
  finalBrand: "SOLOMON";
}

export const SOLOMON_CREATOR_STORY_V7_SCRIPT =
  "This job just moved to interviewing. And Solomon found the person who can help next. Normally, that means rebuilding context across the job post, LinkedIn, notes, contacts, and a blank email, copying everything from tab to tab. Solomon keeps the role and company attached, then shows why this person matters: they work at the target company, match the hiring function, and have verified supporting evidence. Watch that same context move into the message. The role, company, reason for reaching out, and clear ask become one editable draft. That is the difference between a generic opener and a message grounded in the opportunity. Solomon drafts it. You decide. One scattered job search becomes one connected next step: role, person, evidence, and message, ready for review. Save this Solomon workflow.";

export function createSolomonCreatorStoryV7Manifest(paths: Record<SolomonStoryAssetId, string>, captureApproval: SolomonCaptureApproval = { environment: "authenticated_safe_demo_fixture", publicReleaseApproved: false }): SolomonCreatorStoryV7Manifest {
  const sources = createSolomonCreatorStoryManifest(paths, captureApproval).sources.map((source) => source.id === "outreach" ? {
    ...source,
    privacyMasks: [...source.privacyMasks, { x: .39, y: .13, width: .6, height: .13, label: "PRIVATE RECIPIENT" }]
  } : source);
  const claims = [
    claim("status_changed", "The job moved to Interviewing.", "tracker", 0, 18, ["Interviewing"], { x: .4, y: .42, width: .27, height: .13 }),
    claim("contact_surfaced", "Solomon surfaced a relevant contact.", "contacts", 33, 48, ["Relevant contact"], { x: .02, y: .42, width: .49, height: .19 }),
    claim("role_company_attached", "The Senior Product Engineer role and Faire remain attached.", "jobs", 315, 333, ["Senior Product Engineer", "Faire"], { x: .03, y: .07, width: .48, height: .18 }),
    claim("contact_reason", "The contact has supported target-company and hiring-function relevance evidence.", "contacts", 375, 399, ["Hiring manager", "Direct match", "Verified"], { x: .02, y: .42, width: .49, height: .19 }),
    claim("draft_context", "The editable draft contains role and company context.", "outreach", 570, 600, ["Senior Product Engineer", "Faire"], { x: .4, y: .08, width: .57, height: .42 }),
    claim("draft_control", "The draft is not sent and remains editable for review.", "outreach", 855, 873, ["DRAFT — NOT SENT", "Edit"], { x: .4, y: .08, width: .57, height: .42 })
  ];
  const scenes: V7Scene[] = [
    product("hook-status", 0, 33, "hook", "This job just moved to interviewing.", "The changed stage is visible immediately beside a contained surprised Solomon robot host.", ["status_changed"], "tracker", { x: .4, y: .42, width: .27, height: .13 }, camera(1.42, 1.5, .53, .46, true), robot("hook-status", "hook", "surprised", "product_left", "direct_emphasis", "cameo", .98, 17, 33), "status_result", [0, 15, 27]),
    product("hook-contact", 33, 120, "hook", "And Solomon found the person who can help next.", "The relevant contact is visible by 1.1 seconds and answers the spoken promise.", ["contact_surfaced"], "contacts", { x: .02, y: .42, width: .49, height: .19 }, camera(1.42, 1.54, .5, .48, false), robot("hook-contact", "hook", "surprised", "product_right", "point_right", "cameo", .94, 39, 87), "person_reason", [33, 48, 66, 90, 114]),
    simple("problem-reaction", 120, 165, "robot", "problem", "Normally, that means rebuilding context", "The robot recoils as the first work surfaces arrive.", [], robot("problem-reaction", "problem", "concerned", "product_right", "open_palm", "host", .82, 22, 45), "robot_performance", [120, 138, 156]),
    simple("five-tools", 165, 315, "concept", "problem", "across the job post, LinkedIn, notes, contacts, and a blank email, copying everything from tab to tab.", "Recognizable work surfaces overlap, copy context, crowd the frame, then collapse toward Solomon.", [], robot("five-tools", "problem", "concerned", "product_left", "open_palm", "cameo", .76, 65, 150), "fragmentation_collapse", [165, 189, 213, 237, 261, 285, 309], "CONCEPTUAL WORKFLOW"),
    product("role-company", 315, 375, "proof", "Solomon keeps the role and company attached,", "The genuine opportunity crop makes the role and company readable.", ["role_company_attached"], "jobs", { x: .03, y: .07, width: .48, height: .18 }, camera(1.34, 1.46, .48, .32, false), undefined, "status_result", [315, 333, 357]),
    product("contact-reason", 375, 525, "proof", "then shows why this person matters: they work at the target company, match the hiring function, and have verified supporting evidence.", "The contact rationale dominates the frame with supported evidence labels.", ["contact_reason"], "contacts", { x: .02, y: .42, width: .49, height: .19 }, camera(1.48, 1.62, .48, .5, false), robot("contact-reason", "proof", "focused", "product_left", "point_left", "cameo", .84, 76, 150), "person_reason", [375, 399, 423, 447, 471, 495, 519]),
    simple("context-bridge", 525, 570, "robot", "mechanism", "Watch that same context move into the message.", "Opportunity and evidence chips visibly travel toward the message.", ["role_company_attached", "contact_reason"], robot("context-bridge", "mechanism", "focused", "product_right", "point_right", "host", .8, 22, 45), "evidence_to_draft", [525, 543, 561]),
    product("draft-assembly", 570, 690, "mechanism", "The role, company, reason for reaching out, and clear ask become one editable draft.", "Colour-linked evidence chips enter the genuine draft while its contextual phrases remain readable.", ["draft_context"], "outreach", { x: .42, y: .18, width: .55, height: .3 }, camera(1.5, 1.68, .52, .43, false), undefined, "evidence_to_draft", [570, 594, 618, 642, 666, 684]),
    product("readable-sentence", 690, 735, "proof", "", "A single genuine contextual sentence is isolated at phone-readable scale.", ["draft_context"], "outreach", { x: .42, y: .24, width: .55, height: .18 }, camera(1.62, 1.74, .52, .42, false), undefined, "evidence_to_draft", [690, 708, 726]),
    simple("generic-contextual", 735, 810, "comparison", "proof", "That is the difference between a generic opener and a message grounded in the opportunity.", "Equivalent opening sentences show a truthful generic-versus-contextual comparison.", ["draft_context"], robot("generic-contextual", "proof", "confident", "product_right", "point_right", "cameo", .78, 38, 75), "generic_contextual", [735, 756, 780, 801], "CONCEPTUAL COMPARISON USING VERIFIED DRAFT CONTEXT"),
    simple("human-control", 810, 855, "robot", "trust", "Solomon drafts it. You decide.", "A calm open-palm stop state introduces the review boundary once.", [], robot("human-control", "trust", "relieved", "camera", "approval", "host", .72, 22, 45), "robot_performance", [810, 828, 846]),
    product("edit-decide", 855, 885, "trust", "One scattered job search", "The genuine draft status and Edit control are shown with one purposeful cursor action.", ["draft_control"], "outreach", { x: .4, y: .08, width: .57, height: .42 }, camera(1.46, 1.56, .52, .4, true), undefined, "edit_decide", [855, 873]),
    product("connected-result", 885, 945, "payoff", "becomes one connected next step:", "A real Solomon opportunity result combines the role, relevant contact, evidence, and draft rather than category-only cards.", ["role_company_attached", "contact_reason", "draft_context", "draft_control"], "outreach", { x: .35, y: .06, width: .64, height: .72 }, camera(1.12, 1.24, .5, .45, false), robot("connected-result", "payoff", "confident", "product_left", "celebrate", "cameo", .9, 31, 60), "connected_result", [885, 909, 933]),
    simple("payoff-summary", 945, 978, "payoff", "payoff", "role, person, evidence, and message, ready for review.", "The finished genuine result remains dominant while the robot reacts with relief and confidence.", ["role_company_attached", "contact_reason", "draft_context", "draft_control"], robot("payoff-summary", "payoff", "relieved", "product_left", "open_palm", "cameo", .8, 17, 33), "connected_result", [945, 960, 975]),
    simple("solomon-cta", 978, 1_068, "cta", "cta", "Save this Solomon workflow.", "Solomon is the only public brand and the single platform-save action persists for three seconds.", [], robot("solomon-cta", "cta", "confident", "camera", "cta_down", "host", .94, 42, 90), "solomon_cta", [978, 1_002, 1_026, 1_050]),
    simple("solomon-sting", 1_068, 1_080, "cta", "cta", "", "A sub-one-second SOLOMON brand sting closes the video without Gideon branding.", [], undefined, "solomon_cta", [1_068, 1_079])
  ];
  const captions: V7Caption[] = [
    cap("c01", 0, 24, "conversational", "THIS JOB MOVED", ["MOVED"], "seam"), cap("c02", 33, 63, "conversational", "SOLOMON FOUND THE PERSON", ["PERSON"], "seam"),
    cap("c03", 126, 150, "conversational", "THE OLD WAY?", ["OLD"], "seam"), cap("c04", 174, 198, "memory_anchor", "FIVE TOOLS", ["FIVE"], "top"), cap("c05", 270, 294, "memory_anchor", "COPY IT ALL AGAIN", ["AGAIN"], "center"),
    cap("c06", 321, 345, "evidence", "ROLE + COMPANY", ["ROLE"], "top"), cap("c07", 381, 405, "evidence", "WHY THIS PERSON", ["WHY"], "top"), cap("c08", 465, 489, "evidence", "SUPPORTED MATCH", ["SUPPORTED"], "top"),
    cap("c09", 531, 555, "conversational", "CONTEXT MOVES WITH IT", ["MOVES"], "seam"), cap("c10", 582, 606, "evidence", "ROLE · COMPANY · REASON · ASK", ["REASON"], "top"), cap("c11", 696, 720, "evidence", "READ THE DIFFERENCE", ["DIFFERENCE"], "top"),
    cap("c12", 741, 765, "memory_anchor", "GENERIC", [], "top"), cap("c13", 780, 804, "memory_anchor", "GROUNDED", ["GROUNDED"], "top"), cap("c14", 816, 840, "conversational", "SOLOMON DRAFTS. YOU DECIDE.", ["YOU"], "seam"),
    cap("c15", 858, 882, "evidence", "EDIT · THEN DECIDE", ["DECIDE"], "top"), cap("c16", 891, 915, "memory_anchor", "ONE CONNECTED NEXT STEP", ["ONE"], "top"), cap("c17", 948, 972, "conversational", "ROLE · PERSON · EVIDENCE · MESSAGE", ["MESSAGE"], "seam"),
    cap("c20", 1_068, 1_080, "cta", "SOLOMON", ["SOLOMON"], "center")
  ];
  const manifest: SolomonCreatorStoryV7Manifest = {
    schemaVersion: "7", id: SOLOMON_CREATOR_STORY_V7_ID, canvas: { width: 1080, height: 1920, fps: 30, durationInFrames: 1_080 },
    distributionObjective: { mode: "solomon_product_marketing", primaryBrand: "Solomon", publicFacingBrands: ["Solomon"], audience: "People who want a connected, reviewable job-search workflow.", promise: "Solomon connects a job, relevant person, supporting evidence, and editable outreach draft.", desiredAction: "platform_save", ctaText: "SAVE THIS SOLOMON WORKFLOW", destinationVerified: true, publicUrlVerified: false, commentAutomationVerified: false, accountIdentity: "SOLOMON" },
    script: SOLOMON_CREATOR_STORY_V7_SCRIPT, sources, claims, hookClaimIds: ["status_changed", "contact_surfaced"], scenes, captions, finalBrand: "SOLOMON"
  };
  assertSolomonCreatorStoryV7Manifest(manifest);
  return manifest;
}

export function auditSolomonCreatorStoryV7(manifest: SolomonCreatorStoryV7Manifest) {
  const words = manifest.script.match(/[A-Za-z0-9']+/g)?.length ?? 0;
  const wpm = words / .6;
  const productFrames = manifest.scenes.filter(({ kind }) => kind === "product").reduce((sum, scene) => sum + scene.to - scene.from, 0);
  const hookClaims = manifest.hookClaimIds.map((id) => manifest.claims.find((claimItem) => claimItem.id === id));
  const lateHookClaims = hookClaims.filter((claimItem) => !claimItem || claimItem.proofStartFrame > 66).map((claimItem) => claimItem?.id ?? "missing");
  const missingClaims = manifest.scenes.flatMap(({ claimIds }) => claimIds).filter((id) => !manifest.claims.some((claimItem) => claimItem.id === id));
  const semanticGaps = manifest.scenes.flatMap((scene) => scene.semanticEventFrames.slice(1).map((frame, index) => ({ sceneId: scene.id, gap: frame - scene.semanticEventFrames[index]! }))).filter(({ gap }) => gap > 24);
  const longStaticProductScenes = manifest.scenes.filter(({ kind, to, from, semanticEventFrames }) => kind === "product" && to - from > 60 && semanticEventFrames.slice(1).some((frame, index) => frame - semanticEventFrames[index]! > 60)).map(({ id }) => id);
  const publicCopy = `${manifest.script} ${manifest.distributionObjective.ctaText} ${manifest.finalBrand} ${manifest.captions.map(({ text }) => text).join(" ")}`;
  const publicGideonReferences = publicCopy.match(/gideon/gi) ?? [];
  const unsupportedCta = /comment|send you|dm|link in bio|follow gideon/i.test(publicCopy) || !manifest.distributionObjective.destinationVerified;
  const captionCadenceViolations = manifest.captions.filter(({ from, to }) => to - from < 9 || to - from > 30).map(({ id }) => id);
  const robotScenes = manifest.scenes.filter(({ robot }) => robot);
  const eyeShapes = new Set(robotScenes.map(({ robot }) => robot!.eyeShape));
  const silhouettes = new Set(robotScenes.map(({ robot }) => `${robot!.scaleToken}:${robot!.handSilhouette}:${robot!.torsoRotate}`));
  const clippedFramingDeclarations = robotScenes.filter(({ robot }) => robot!.scaleToken === "host" && Math.abs(robot!.torsoTranslateY) > 80).map(({ id }) => id);
  const passed = wpm >= 210 && wpm <= 230 && productFrames / 1_080 >= .35 && productFrames / 1_080 <= .55 && lateHookClaims.length === 0 && missingClaims.length === 0 && semanticGaps.length === 0 && longStaticProductScenes.length === 0 && publicGideonReferences.length === 0 && !unsupportedCta && captionCadenceViolations.length === 0 && eyeShapes.size >= 4 && silhouettes.size >= 6 && clippedFramingDeclarations.length === 0;
  return { passed, words, wordsPerMinute: wpm, productOccupancy: productFrames / 1_080, lateHookClaims, missingClaims, semanticGaps, longStaticProductScenes, publicGideonReferences, unsupportedCta, captionCadenceViolations, eyeShapeCount: eyeShapes.size, silhouetteCount: silhouettes.size, clippedFramingDeclarations };
}

export function assertSolomonCreatorStoryV7Manifest(manifest: SolomonCreatorStoryV7Manifest): void {
  z.object({ schemaVersion: z.literal("7"), id: z.literal(SOLOMON_CREATOR_STORY_V7_ID), script: z.string(), sources: z.array(z.unknown()).length(4), claims: z.array(atomicClaimSchema).min(6), scenes: z.array(z.unknown()).min(14).max(22), captions: z.array(z.unknown()).min(12), finalBrand: z.literal("SOLOMON") }).parse(manifest);
  manifest.scenes.forEach((scene, index) => {
    if (scene.from !== (index === 0 ? 0 : manifest.scenes[index - 1]!.to) || scene.to <= scene.from) throw new Error(`V7 scene ${scene.id} is not contiguous.`);
    if (scene.kind === "product" && (!scene.assetId || !scene.focusTarget || !scene.camera)) throw new Error(`V7 product scene ${scene.id} lacks source targeting.`);
    if (scene.robot) robotDirectionSchema.parse(scene.robot);
  });
  if (manifest.scenes.at(-1)?.to !== 1_080) throw new Error("V7 scenes do not cover the complete timeline.");
  const narration = manifest.scenes.map(({ narration }) => narration).filter(Boolean).join(" ");
  if (narration !== manifest.script) throw new Error("V7 scene narration differs from the approved script.");
  if (manifest.sources.some((source) => source.sourceSha256 !== HASHES[source.id])) throw new Error("V7 source hash mismatch.");
  const audit = auditSolomonCreatorStoryV7(manifest);
  if (!audit.passed) throw new Error(`V7 quality contract failed: ${JSON.stringify(audit)}`);
}

function claim(id: string, clause: string, assetId: SolomonStoryAssetId, proofStartFrame: number, resultFrame: number, requiredReadableText: string[], proofRegion: { x: number; y: number; width: number; height: number }) {
  const intervals = { jobs: { startMs: 500, endMs: 10_000 }, tracker: { startMs: 500, endMs: 8_600 }, contacts: { startMs: 500, endMs: 9_800 }, outreach: { startMs: 500, endMs: 8_900 } } as const;
  return atomicClaimSchema.parse({ id, clause, assetId, sourceSha256: HASHES[assetId], verifiedInterval: intervals[assetId], proofRegion, requiredReadableText, proofStartFrame, actionFrame: proofStartFrame, resultFrame, qualification: "Supported only within the approved source interval and visible region; privacy masks remain mandatory.", approved: true });
}

function robot(sceneId: string, narrativeFunction: Parameters<typeof directRobotPerformance>[0]["narrativeFunction"], emotion: Parameters<typeof directRobotPerformance>[0]["emotion"], gazeTarget: Parameters<typeof directRobotPerformance>[0]["gazeTarget"], gesture: Parameters<typeof directRobotPerformance>[0]["gesture"], scaleToken: Parameters<typeof directRobotPerformance>[0]["scaleToken"], energy: number, emphasizedWordFrame: number, sceneDurationFrames: number) {
  return directRobotPerformance({ sceneId, narrativeFunction, emotion, gazeTarget, gesture, scaleToken, energy, sceneDurationFrames, emphasizedWordFrame, proofPosition: gazeTarget === "product_left" ? { x: .2, y: .35 } : gazeTarget === "product_right" ? { x: .8, y: .35 } : undefined, audioEnvelope: Array.from({ length: 36 }, (_, index) => index % 7 === 0 ? 0 : .25 + ((index * 17) % 60) / 100) });
}

function camera(zoomStart: number, zoomEnd: number, anchorX: number, anchorY: number, cursorRequired: boolean) { return { zoomStart, zoomEnd, anchorX, anchorY, settleFrames: 18, cursorRequired }; }
function product(id: string, from: number, to: number, narrativeFunction: V7Scene["narrativeFunction"], narration: string, visibleResult: string, claimIds: string[], assetId: SolomonStoryAssetId, focusTarget: NonNullable<V7Scene["focusTarget"]>, cameraPlan: NonNullable<V7Scene["camera"]>, robotPlan: RobotDirection | undefined, recipe: V7Scene["recipe"], semanticEventFrames: number[]): V7Scene { return { id, from, to, kind: "product", narrativeFunction, narration, visibleResult, claimIds, semanticEventFrames, assetId, focusTarget, camera: cameraPlan, robot: robotPlan, recipe }; }
function simple(id: string, from: number, to: number, kind: V7SceneKind, narrativeFunction: V7Scene["narrativeFunction"], narration: string, visibleResult: string, claimIds: string[], robotPlan: RobotDirection | undefined, recipe: V7Scene["recipe"], semanticEventFrames: number[], conceptualDisclosure?: string): V7Scene { return { id, from, to, kind, narrativeFunction, narration, visibleResult, claimIds, semanticEventFrames, robot: robotPlan, recipe, conceptualDisclosure }; }
function cap(id: string, from: number, to: number, role: V7CaptionRole, text: string, emphasis: string[], placement: V7Caption["placement"]): V7Caption { return { id, from, to, role, text, emphasis, placement }; }
