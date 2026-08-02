export const SOLOMON_CREATOR_STORY_SCHEMA_VERSION = "1" as const;
export const SOLOMON_CREATOR_STORY_ID = "solomon-creator-story-v2" as const;
export const SOLOMON_CREATOR_STORY_FPS = 30 as const;
export const SOLOMON_CREATOR_STORY_DURATION_FRAMES = 1_080 as const;

export type SolomonStoryAssetId = "jobs" | "tracker" | "contacts" | "outreach";
export type SolomonStorySceneKind = "presenter" | "product" | "editorial" | "comparison" | "cta";
export type SolomonHostPose =
  | "curious_hook"
  | "surprised_reaction"
  | "concerned_warning"
  | "point_left"
  | "point_right"
  | "open_palm"
  | "confident_confirmation"
  | "direct_emphasis"
  | "count_one"
  | "compare"
  | "thinking"
  | "present_object"
  | "approval"
  | "direct_viewer"
  | "cta_down"
  | "relaxed_hold";
export type SolomonHostFraming =
  | "extreme_close"
  | "close"
  | "medium"
  | "side_left"
  | "side_right"
  | "pip"
  | "desk"
  | "three_quarter"
  | "lower_reaction"
  | "cta_close";
export type SolomonHostEmotion = "curious" | "surprised" | "concerned" | "focused" | "relieved" | "confident";
export type SolomonCaptionRole = "spoken" | "editorial" | "proof" | "impact" | "cta";
export type SolomonCaptionPlacement = "top" | "center" | "lower" | "proof";
export type SolomonProductShotRecipe =
  | "status_change"
  | "target_magnification"
  | "evidence_highlight"
  | "approval_gate"
  | "final_result";

export interface SolomonProductCameraPlan {
  recipe: SolomonProductShotRecipe;
  anchorX: number;
  anchorY: number;
  zoomStart: number;
  zoomEnd: number;
  settleFrames: number;
  readabilityHoldFrames: number;
  cursorRequired: boolean;
  spotlightIntensity?: number;
}

export interface SolomonPrivacyMask {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface SolomonStorySource {
  id: SolomonStoryAssetId;
  workflowId: string;
  route: string;
  sourcePath: string;
  sourceSha256: string;
  sourceWidth: 1080;
  sourceHeight: 1350;
  verifiedSourceInterval: { startMs: number; endMs: number };
  extractedSourceInterval: { startMs: number; endMs: number };
  initialState: string;
  action: string;
  resultState: string;
  narrationPurpose: string;
  actionRegion: { x: number; y: number; width: number; height: number };
  resultRegion: { x: number; y: number; width: number; height: number };
  cursorPolicy: "gideon_pointer_overlay" | "no_cursor_required";
  privacyMasks: SolomonPrivacyMask[];
  environment: "authenticated_safe_demo_fixture" | "authenticated_genuine_environment";
  publicReleaseApproved: boolean;
  environmentReviewReceipt?: string;
  authentic: true;
  approved: true;
}

export interface SolomonCaptureApproval {
  environment: SolomonStorySource["environment"];
  publicReleaseApproved: boolean;
  environmentReviewReceipt?: string;
}

export interface SolomonStoryScene {
  id: string;
  from: number;
  to: number;
  kind: SolomonStorySceneKind;
  storyFunction: string;
  narration: string;
  visibleResult: string;
  assetId?: SolomonStoryAssetId;
  focusTarget?: { x: number; y: number; width: number; height: number };
  camera?: SolomonProductCameraPlan;
  host?: {
    pose: SolomonHostPose;
    emotion: SolomonHostEmotion;
    framing: SolomonHostFraming;
    gazeTarget: "camera" | "product_left" | "product_right" | "cta";
    speakingIntensity: number;
  };
  soundCueIds: string[];
  captionIds: string[];
  transitionBehavior: "hard_cut" | "eased_reframe" | "impact_reset" | "cta_resolve";
  deliberateHold?: boolean;
}

export interface SolomonStoryCaption {
  id: string;
  from: number;
  to: number;
  words: string[];
  emphasis: string[];
  role: SolomonCaptionRole;
  placement: SolomonCaptionPlacement;
  deliberateHold?: boolean;
}

export interface SolomonCreatorStoryManifest {
  schemaVersion: typeof SOLOMON_CREATOR_STORY_SCHEMA_VERSION;
  id: typeof SOLOMON_CREATOR_STORY_ID;
  productName: "Solomon";
  canvas: { width: 1080; height: 1920; fps: 30; durationInFrames: 1080 };
  script: string;
  sources: SolomonStorySource[];
  scenes: SolomonStoryScene[];
  captions: SolomonStoryCaption[];
  eventFrames: number[];
  cta: {
    actionCount: 0 | 1;
    text: string;
    destinationStatus: "unresolved_external_decision" | "verified_destination";
    verified: boolean;
    publicUrlImplied: boolean;
    destination: "platform_comment" | "unresolved";
    keyword?: "SOLOMON";
  };
}

export const SOLOMON_CREATOR_STORY_SCRIPT =
  "This job just hit Interviewing, and Solomon already knows who should help next. The status change pulls the role and company forward, then surfaces the person connected to the role and why they're relevant. Normally, you rebuild this across five tabs. Solomon keeps every piece connected, then turns that context into a personalized draft, not a generic template. Solomon makes the draft. You approve it. From job, to person, to proof, to draft. One opportunity becomes one clear next step. Type Solomon below and I'll send you the demo.";

const SOURCE_HASHES: Record<SolomonStoryAssetId, string> = {
  jobs: "f01434def589919da1b77d1e2a6e57185cdbee43982b1440eb61f5e6122c6704",
  tracker: "d638462cb696da5d1724413a55baba58f19e4dd55e36fc39cafd461fecc99b8b",
  contacts: "a36e85e2b24f2a8c66b6b7b11a9f039ffc5a251e838097bf38c5ab4488e5c301",
  outreach: "9733ef9c20e54f909f4b57f5d41484ad1582dcb18e9680a7c182424d21c61dfc"
};

export function createSolomonCreatorStoryManifest(
  paths: Record<SolomonStoryAssetId, string>,
  captureApproval: SolomonCaptureApproval = {
    environment: "authenticated_safe_demo_fixture",
    publicReleaseApproved: false
  }
): SolomonCreatorStoryManifest {
  const sources: SolomonStorySource[] = [
    source("jobs", "inspect-genuine-faire-role", "/jobs/:jobId", paths.jobs, { startMs: 500, endMs: 10_000 }, { startMs: 500, endMs: 9_800 },
      "The authenticated genuine Faire opportunity is open.", "The pointer moves from the role title to the published salary.",
      "Senior Product Engineer, Insider and Faire remain visible.", "Prove the specific role and company behind the story.",
      { x: 0.05, y: 0.18, width: 0.24, height: 0.05 }, { x: 0.03, y: 0.07, width: 0.48, height: 0.18 }, "gideon_pointer_overlay", captureApproval, []),
    source("tracker", "move-genuine-faire-role-to-interviewing", "/jobs/:jobId", paths.tracker, { startMs: 500, endMs: 8_600 }, { startMs: 500, endMs: 8_500 },
      "The genuine Faire role is in Discovered.", "The pointer selects Interviewing in the role stage control.",
      "The same genuine Faire role appears in Interviewing.", "Prove the status change without showing a full workflow.",
      { x: 0.51, y: 0.45, width: 0.11, height: 0.12 }, { x: 0.02, y: 0.42, width: 0.66, height: 0.13 }, "gideon_pointer_overlay", captureApproval, [
        { x: 0.02, y: 0.31, width: 0.96, height: 0.1, label: "PRIVATE CONTACT ACTIVITY" },
        { x: 0.02, y: 0.58, width: 0.96, height: 0.39, label: "PRIVATE CONTACT RESULTS" }
      ]),
    source("contacts", "inspect-genuine-faire-contact-evidence", "/jobs/:jobId", paths.contacts, { startMs: 500, endMs: 9_800 }, { startMs: 500, endMs: 9_700 },
      "The genuine Faire opportunity's live candidates are visible.", "The pointer reviews the verified hiring-manager evidence and draft action.",
      "A privacy-masked contact is visibly labelled as a direct, verified hiring-manager match.", "Prove the relevant person and evidence without publishing their identity.",
      { x: 0.11, y: 0.49, width: 0.12, height: 0.11 }, { x: 0.02, y: 0.42, width: 0.49, height: 0.19 }, "gideon_pointer_overlay", captureApproval, [
        { x: 0.035, y: 0.49, width: 0.25, height: 0.05, label: "RELEVANT CONTACT" },
        { x: 0.51, y: 0.49, width: 0.25, height: 0.05, label: "PRIVATE CONTACT" },
        { x: 0.035, y: 0.61, width: 0.24, height: 0.05, label: "PRIVATE CONTACT" },
        { x: 0.035, y: 0.83, width: 0.27, height: 0.05, label: "PRIVATE CONTACT" }
      ]),
    source("outreach", "review-genuine-faire-draft", "/messages", paths.outreach, { startMs: 500, endMs: 8_900 }, { startMs: 500, endMs: 8_800 },
      "The genuine Faire role and hiring manager are selected in Messages.", "The pointer reviews the saved role context, recipient, message, and review controls.",
      "The privacy-masked draft remains explicitly not sent and editable.", "Prove prepared outreach and the human review boundary without exposing a real contact.",
      { x: 0.28, y: 0.38, width: 0.12, height: 0.08 }, { x: 0.4, y: 0.08, width: 0.57, height: 0.42 }, "gideon_pointer_overlay", captureApproval, [
        { x: 0.0, y: 0.18, width: 0.4, height: 0.3, label: "CONTACT CONTEXT" },
        { x: 0.42, y: 0.12, width: 0.34, height: 0.04, label: "MESSAGE TO RELEVANT CONTACT" },
        { x: 0.42, y: 0.18, width: 0.27, height: 0.035, label: "REVIEW RECIPIENT" },
        { x: 0.42, y: 0.242, width: 0.17, height: 0.052, label: "PERSONALIZED OPENING" },
        { x: 0.41, y: 0.48, width: 0.58, height: 0.28, label: "SUPPORTING CONTEXT" }
      ])
  ];

  const scenes: SolomonStoryScene[] = [
    presenter("hook-close", 0, 36, "consequence hook", "This job just hit Interviewing,", "The creator begins in the closest framing with an asymmetric forward lean.", "curious_hook", "surprised", "extreme_close", "camera", 0.95, ["hook-impact"]),
    presenter("hook-consequence", 36, 66, "surprising promise", "and Solomon already knows who should help next.", "The creator points toward an incoming opportunity card before the first product cut.", "point_left", "focused", "three_quarter", "product_left", 0.9, ["promise-rise"]),
    product("status-pre", 66, 84, "trigger anticipation", "", "A tight dimmed crop isolates the current role stage.", "tracker", { x: 0.02, y: 0.42, width: 0.66, height: 0.13 }, ["status-hover"], {
      recipe: "status_change", anchorX: 0.5, anchorY: 0.48, zoomStart: 1.34, zoomEnd: 1.38, settleFrames: 10, readabilityHoldFrames: 8, cursorRequired: true, spotlightIntensity: 0.58
    }),
    product("status-click", 84, 99, "trigger click", "", "The arrow clicks Interviewing with tactile feedback.", "tracker", { x: 0.43, y: 0.43, width: 0.22, height: 0.12 }, ["status-click"], {
      recipe: "status_change", anchorX: 0.5, anchorY: 0.48, zoomStart: 1.38, zoomEnd: 1.43, settleFrames: 8, readabilityHoldFrames: 7, cursorRequired: true, spotlightIntensity: 0.62
    }),
    product("status-result", 99, 126, "visible consequence", "The status change", "Interviewing becomes the visible trigger for the next step.", "tracker", { x: 0.43, y: 0.43, width: 0.22, height: 0.12 }, ["status-confirm", "mechanism-start"], {
      recipe: "status_change", anchorX: 0.5, anchorY: 0.48, zoomStart: 1.38, zoomEnd: 1.34, settleFrames: 12, readabilityHoldFrames: 15, cursorRequired: true, spotlightIntensity: 0.56
    }),
    product("opportunity-role", 126, 165, "opportunity input", "pulls the role and company forward,", "Only the genuine role, company, and stage are allowed to dominate the frame.", "jobs", { x: 0.03, y: 0.07, width: 0.48, height: 0.18 }, ["role-lock"], {
      recipe: "target_magnification", anchorX: 0.48, anchorY: 0.3, zoomStart: 1.28, zoomEnd: 1.34, settleFrames: 14, readabilityHoldFrames: 25, cursorRequired: true, spotlightIntensity: 0.48
    }),
    comparison("opportunity-lock", 165, 210, "opportunity assembly", "", "Role and company lock into one moving opportunity card that feeds the contact reveal.", "present_object", ["company-lock", "card-snap"]),
    product("contact-reveal", 210, 270, "person reveal", "then surfaces the person connected to the role", "A privacy-masked contact card emerges from the same opportunity.", "contacts", { x: 0.02, y: 0.42, width: 0.49, height: 0.19 }, ["contact-reveal"], {
      recipe: "evidence_highlight", anchorX: 0.48, anchorY: 0.5, zoomStart: 1.28, zoomEnd: 1.34, settleFrames: 15, readabilityHoldFrames: 45, cursorRequired: true, spotlightIntensity: 0.54
    }),
    product("contact-proof", 270, 315, "relevance proof", "and why they're relevant.", "Hiring Manager, Direct, and Verified chips are isolated as visible evidence without naming the person.", "contacts", { x: 0.03, y: 0.51, width: 0.29, height: 0.08 }, ["evidence-chip-1", "evidence-chip-2", "evidence-chip-3"], {
      recipe: "evidence_highlight", anchorX: 0.46, anchorY: 0.5, zoomStart: 1.42, zoomEnd: 1.48, settleFrames: 12, readabilityHoldFrames: 33, cursorRequired: true, spotlightIntensity: 0.64
    }),
    editorial("problem-tabs", 315, 390, "old fragmented problem", "Normally, you rebuild this across five tabs.", "Five scattered tools appear on a red problem canvas before collapsing.", ["warning-hit", "tab-spread"]),
    comparison("mechanism-job-person", 390, 435, "connected mechanism one", "Solomon keeps every piece connected,", "A moving JOB → PERSON connector replaces static summary cards.", "compare", ["connector-one"]),
    comparison("mechanism-proof-draft", 435, 480, "connected mechanism two", "", "The connection extends through PROOF → DRAFT and changes from red to green.", "point_right", ["connector-two", "resolution-rise"]),
    product("draft-generated", 480, 540, "draft creation", "then turns that context into a personalized draft,", "The genuine message panel appears already tied to the saved job context.", "outreach", { x: 0.4, y: 0.08, width: 0.57, height: 0.42 }, ["draft-reveal"], {
      recipe: "target_magnification", anchorX: 0.5, anchorY: 0.38, zoomStart: 1.22, zoomEnd: 1.28, settleFrames: 15, readabilityHoldFrames: 45, cursorRequired: true, spotlightIntensity: 0.48
    }),
    product("personalization-proof", 540, 615, "readable personalization", "not a generic template.", "A readable sentence highlights the genuine role and company context inside the draft.", "outreach", { x: 0.42, y: 0.24, width: 0.55, height: 0.2 }, ["proof-highlight-role", "proof-highlight-company"], {
      recipe: "target_magnification", anchorX: 0.5, anchorY: 0.44, zoomStart: 1.52, zoomEnd: 1.58, settleFrames: 16, readabilityHoldFrames: 59, cursorRequired: true, spotlightIntensity: 0.68
    }),
    product("approval-gate", 615, 690, "human approval", "Solomon makes the draft. You approve it.", "DRAFT — NOT SENT and Edit become the only active controls.", "outreach", { x: 0.4, y: 0.11, width: 0.57, height: 0.34 }, ["approval-focus", "approval-confirm"], {
      recipe: "approval_gate", anchorX: 0.5, anchorY: 0.4, zoomStart: 1.38, zoomEnd: 1.43, settleFrames: 14, readabilityHoldFrames: 46, cursorRequired: true, spotlightIntensity: 0.64
    }),
    comparison("transformation-payoff", 690, 825, "memorable transformation", "From job, to person, to proof, to draft.", "The four-stage mechanism completes as one connected system, not four static nouns.", "count_one", ["payoff-job", "payoff-person", "payoff-proof", "payoff-draft"]),
    presenter("summary", 825, 945, "creator summary", "One opportunity becomes one clear next step.", "A desk-shot creator gathers the connected mechanism into one next-action card.", "approval", "confident", "desk", "product_right", 0.72, ["summary-lift"]),
    cta("cta-action", 945, 1_056, "platform-native conversion", "Type Solomon below and I'll send you the demo.", "The creator moves to a direct CTA close-up, points down, and holds the keyword and account action.", "cta_down", "confident", "cta_close", "cta", 0.92, ["cta-impact", "cta-keyword"]),
    cta("brand-sting", 1_056, 1_080, "brand sting", "", "A sub-one-second Solomon brand sting preserves the CTA through the final frame.", "direct_viewer", "confident", "extreme_close", "camera", 0.18, ["brand-sting", "active-end-bed"])
  ];

  const captions: SolomonStoryCaption[] = [
    caption("c01", 0, 18, ["THIS", "JOB"], ["JOB"], "spoken", "lower"),
    caption("c02", 18, 36, ["HIT", "INTERVIEWING"], ["INTERVIEWING"], "impact", "lower"),
    caption("c03", 36, 51, ["SOLOMON", "ALREADY", "KNOWS"], ["KNOWS"], "spoken", "lower"),
    caption("c04", 51, 66, ["WHO", "HELPS", "NEXT"], ["NEXT"], "impact", "lower"),
    caption("c05", 72, 84, ["THE", "TRIGGER"], ["TRIGGER"], "proof", "top"),
    caption("c06", 84, 99, ["INTERVIEWING"], ["INTERVIEWING"], "proof", "top"),
    caption("c07", 105, 123, ["TRIGGERS", "THE", "NEXT", "STEP"], ["NEXT"], "proof", "top"),
    caption("c08", 132, 150, ["ROLE", "+", "COMPANY"], ["ROLE", "COMPANY"], "proof", "top"),
    caption("c09", 168, 186, ["STAY", "ATTACHED"], ["ATTACHED"], "impact", "top"),
    caption("c10", 216, 234, ["THE", "RIGHT", "PERSON"], ["PERSON"], "proof", "top"),
    caption("c11", 276, 294, ["WHY", "THEY'RE", "RELEVANT"], ["RELEVANT"], "proof", "top"),
    caption("c12", 321, 339, ["FIVE", "TABS"], ["FIVE"], "impact", "center"),
    caption("c13", 354, 372, ["REBUILD", "IT", "YOURSELF"], ["YOURSELF"], "editorial", "center"),
    caption("c14", 396, 414, ["CONTEXT", "ATTACHED"], ["ATTACHED"], "editorial", "top"),
    caption("c15", 423, 441, ["JOB", "→", "PERSON"], ["PERSON"], "impact", "top"),
    caption("c16", 450, 468, ["PROOF", "→", "DRAFT"], ["DRAFT"], "impact", "top"),
    caption("c17", 489, 507, ["PERSONALIZED", "DRAFT"], ["PERSONALIZED"], "proof", "top"),
    caption("c18", 552, 570, ["NOT", "A", "TEMPLATE"], ["NOT"], "proof", "top"),
    caption("c19", 621, 639, ["SOLOMON", "DRAFTS"], ["DRAFTS"], "proof", "top"),
    caption("c20", 648, 666, ["YOU", "APPROVE"], ["YOU"], "impact", "top"),
    caption("c21", 684, 702, ["JOB"], ["JOB"], "impact", "center"),
    caption("c22", 720, 738, ["PERSON"], ["PERSON"], "impact", "center"),
    caption("c23", 756, 774, ["PROOF"], ["PROOF"], "impact", "center"),
    caption("c24", 792, 810, ["DRAFT"], ["DRAFT"], "impact", "center"),
    caption("c25", 840, 858, ["ONE", "OPPORTUNITY"], ["OPPORTUNITY"], "spoken", "lower"),
    caption("c26", 876, 894, ["ONE", "CLEAR", "NEXT", "STEP"], ["CLEAR"], "impact", "lower"),
    caption("c27", 954, 972, ["COMMENT", "SOLOMON"], ["SOLOMON"], "cta", "lower"),
    caption("c28", 990, 1_008, ["I'LL", "SEND", "THE", "DEMO"], ["DEMO"], "cta", "lower"),
    caption("c29", 1_056, 1_080, ["SOLOMON"], ["SOLOMON"], "cta", "lower", true)
  ];
  for (const scene of scenes) {
    scene.captionIds = captions
      .filter((captionItem) => captionItem.from < scene.to && captionItem.to > scene.from)
      .map(({ id }) => id);
  }

  return {
    schemaVersion: SOLOMON_CREATOR_STORY_SCHEMA_VERSION,
    id: SOLOMON_CREATOR_STORY_ID,
    productName: "Solomon",
    canvas: { width: 1080, height: 1920, fps: 30, durationInFrames: 1_080 },
    script: SOLOMON_CREATOR_STORY_SCRIPT,
    sources,
    scenes,
    captions,
    eventFrames: Array.from(new Set([
      ...scenes.flatMap(({ from, to }) => [
        ...Array.from({ length: Math.ceil((to - from) / 15) }, (_, index) => Math.min(to - 1, from + index * 15)),
        to - 1
      ]),
      ...captions.flatMap(({ from, to }) => [from, to - 1])
    ])).sort((a, b) => a - b),
    cta: {
      actionCount: 1,
      text: "COMMENT ‘SOLOMON’",
      destinationStatus: "verified_destination",
      verified: true,
      publicUrlImplied: false,
      destination: "platform_comment",
      keyword: "SOLOMON"
    }
  };
}

export function assertSolomonCreatorStoryManifest(manifest: SolomonCreatorStoryManifest): void {
  if (manifest.id !== SOLOMON_CREATOR_STORY_ID || manifest.schemaVersion !== "1") throw new Error("Solomon story identity is invalid.");
  if (manifest.canvas.width !== 1080 || manifest.canvas.height !== 1920 || manifest.canvas.fps !== 30 || manifest.canvas.durationInFrames !== 1_080) {
    throw new Error("Solomon story must be 1080x1920, 30 fps, and 1080 frames.");
  }
  if (manifest.scenes[0]?.from !== 0 || manifest.scenes.at(-1)?.to !== 1_080) throw new Error("Scenes must cover the complete 36-second timeline.");
  manifest.scenes.forEach((scene, index) => {
    if (scene.to <= scene.from || (index > 0 && manifest.scenes[index - 1]!.to !== scene.from)) throw new Error(`Scene ${scene.id} is not contiguous.`);
    if (scene.kind === "product" && (!scene.assetId || !scene.focusTarget || !scene.camera)) throw new Error(`Product scene ${scene.id} lacks authenticated proof targeting.`);
    if (!scene.transitionBehavior || !Array.isArray(scene.captionIds)) throw new Error(`Scene ${scene.id} lacks structured editorial metadata.`);
  });
  if (manifest.sources.length !== 4 || manifest.sources.some(({ authentic, approved }) => !authentic || !approved)) throw new Error("All four product sources must be authentic and approved.");
  manifest.sources.forEach((sourceItem) => {
    if (sourceItem.sourceSha256 !== SOURCE_HASHES[sourceItem.id]) throw new Error(`Unexpected source hash for ${sourceItem.id}.`);
    if (sourceItem.extractedSourceInterval.startMs < sourceItem.verifiedSourceInterval.startMs ||
      sourceItem.extractedSourceInterval.endMs > sourceItem.verifiedSourceInterval.endMs) throw new Error(`Source interval for ${sourceItem.id} is outside verified evidence.`);
    if (sourceItem.publicReleaseApproved && (
      sourceItem.environment !== "authenticated_genuine_environment" ||
      !sourceItem.environmentReviewReceipt?.trim()
    )) throw new Error(`Source ${sourceItem.id} has invalid release approval provenance.`);
  });
  const hostScenes = manifest.scenes.filter((scene) => scene.host);
  hostScenes.slice(1).forEach((scene, index) => {
    if (scene.host!.pose === hostScenes[index]!.host!.pose) throw new Error(`Adjacent host scenes repeat ${scene.host!.pose}.`);
  });
  if (manifest.captions.some(({ words, from, to, deliberateHold }) =>
    words.length > 5 || to <= from || from < 0 || to > 1_080 || (!deliberateHold && to - from > 18))) {
    throw new Error("Caption phrases must contain one to five words, use 0.3–0.6 second rhythm unless annotated, and remain inside the timeline.");
  }
  if (manifest.cta.actionCount > 1 || manifest.cta.publicUrlImplied) throw new Error("The CTA state must never imply an unverified destination.");
  if (/placeholder|todo|nexusreach/i.test(`${manifest.script} ${manifest.cta.text}`)) throw new Error("Public-facing copy contains forbidden placeholder or legacy naming.");
}

export function auditSolomonStoryRetention(manifest: SolomonCreatorStoryManifest): {
  passed: boolean;
  releaseReady: boolean;
  longestDeclaredEventGapFrames: number;
  maximumDeclaredEventGapFrames: 18;
  repeatedAdjacentHostPoses: string[];
  productScenesWithoutProofTargets: string[];
  missingSourceManifestEntries: string[];
  inconsistentProductGazeScenes: string[];
  cursorOutsideVisibleCropScenes: string[];
  excessiveCameraVelocityScenes: string[];
  excessiveCameraAccelerationScenes: string[];
  abruptCameraDirectionChangeScenes: string[];
  captionCadenceViolations: string[];
  placeholderOrDebugText: string[];
  unverifiedCta: boolean;
  unapprovedSourceIds: string[];
  nonReleaseSourceIds: string[];
} {
  const longestDeclaredEventGapFrames = manifest.eventFrames.slice(1).reduce((longest, frame, index) =>
    Math.max(longest, frame - manifest.eventFrames[index]!), 0);
  const hostScenes = manifest.scenes.filter((scene) => scene.host);
  const repeatedAdjacentHostPoses = hostScenes.slice(1)
    .filter((scene, index) => scene.host!.pose === hostScenes[index]!.host!.pose)
    .map(({ id }) => id);
  const productScenesWithoutProofTargets = manifest.scenes
    .filter((scene) => scene.kind === "product" && (!scene.assetId || !scene.focusTarget || !scene.camera))
    .map(({ id }) => id);
  const productScenes = manifest.scenes.filter((scene) => scene.kind === "product");
  const missingSourceManifestEntries = productScenes
    .filter(({ assetId }) => !manifest.sources.some(({ id }) => id === assetId))
    .map(({ id }) => id);
  const inconsistentProductGazeScenes = productScenes
    .filter(({ host, focusTarget }) => host && focusTarget && (
      (focusTarget.x + focusTarget.width / 2 < 0.5 && host.gazeTarget !== "product_left") ||
      (focusTarget.x + focusTarget.width / 2 >= 0.5 && host.gazeTarget !== "product_right")
    ))
    .map(({ id }) => id);
  const cursorOutsideVisibleCropScenes: string[] = [];
  const excessiveCameraVelocityScenes: string[] = [];
  const excessiveCameraAccelerationScenes: string[] = [];
  const abruptCameraDirectionChangeScenes: string[] = [];
  for (const scene of productScenes) {
    if (!scene.camera || !scene.focusTarget || !scene.assetId) continue;
    const sourceItem = manifest.sources.find(({ id }) => id === scene.assetId);
    if (!sourceItem) continue;
    const samples = Array.from({ length: scene.to - scene.from }, (_, frame) => sampleSolomonProductCamera(scene, frame, sourceItem));
    if (scene.camera.cursorRequired && samples.some(({ cursorVisible }) => !cursorVisible)) cursorOutsideVisibleCropScenes.push(scene.id);
    const velocities = samples.slice(1).map((sample, index) => Math.hypot(sample.left - samples[index]!.left, sample.top - samples[index]!.top));
    const accelerations = velocities.slice(1).map((velocity, index) => Math.abs(velocity - velocities[index]!));
    if (Math.max(0, ...velocities) > 72) excessiveCameraVelocityScenes.push(scene.id);
    if (Math.max(0, ...accelerations) > 16) excessiveCameraAccelerationScenes.push(scene.id);
    const directionChanges = samples.slice(2).filter((sample, index) => {
      const a = samples[index]!;
      const b = samples[index + 1]!;
      const firstX = b.left - a.left;
      const firstY = b.top - a.top;
      const nextX = sample.left - b.left;
      const nextY = sample.top - b.top;
      const firstMagnitude = Math.hypot(firstX, firstY);
      const nextMagnitude = Math.hypot(nextX, nextY);
      const dot = firstX * nextX + firstY * nextY;
      return firstMagnitude > 1.5 && nextMagnitude > 1.5 && dot < -0.5 * firstMagnitude * nextMagnitude;
    });
    if (directionChanges.length > 0) abruptCameraDirectionChangeScenes.push(scene.id);
  }
  const captionCadenceViolations = manifest.captions
    .filter(({ from, to, deliberateHold }) => !deliberateHold && (to - from < 9 || to - from > 18))
    .map(({ id }) => id);
  const publicCopy = [
    manifest.script,
    manifest.cta.text,
    ...manifest.scenes.flatMap(({ storyFunction, narration, visibleResult }) => [storyFunction, narration, visibleResult]),
    ...manifest.captions.flatMap(({ words }) => words)
  ];
  const placeholderOrDebugText = publicCopy.filter((copy) => /placeholder|todo|debug|nexusreach/i.test(copy));
  const unverifiedCta = manifest.cta.actionCount !== 1 || !manifest.cta.verified || manifest.cta.publicUrlImplied;
  const unapprovedSourceIds = manifest.sources.filter(({ authentic, approved }) => !authentic || !approved).map(({ id }) => id);
  const nonReleaseSourceIds = manifest.sources
    .filter(({ environment, publicReleaseApproved, environmentReviewReceipt }) =>
      environment !== "authenticated_genuine_environment" ||
      !publicReleaseApproved ||
      !environmentReviewReceipt?.trim())
    .map(({ id }) => id);
  return {
    passed: longestDeclaredEventGapFrames <= 18 &&
      repeatedAdjacentHostPoses.length === 0 &&
      productScenesWithoutProofTargets.length === 0 &&
      missingSourceManifestEntries.length === 0 &&
      inconsistentProductGazeScenes.length === 0 &&
      cursorOutsideVisibleCropScenes.length === 0 &&
      excessiveCameraVelocityScenes.length === 0 &&
      excessiveCameraAccelerationScenes.length === 0 &&
      abruptCameraDirectionChangeScenes.length === 0 &&
      captionCadenceViolations.length === 0 &&
      placeholderOrDebugText.length === 0 &&
      unapprovedSourceIds.length === 0,
    releaseReady: longestDeclaredEventGapFrames <= 18 &&
      repeatedAdjacentHostPoses.length === 0 &&
      productScenesWithoutProofTargets.length === 0 &&
      missingSourceManifestEntries.length === 0 &&
      inconsistentProductGazeScenes.length === 0 &&
      cursorOutsideVisibleCropScenes.length === 0 &&
      excessiveCameraVelocityScenes.length === 0 &&
      excessiveCameraAccelerationScenes.length === 0 &&
      abruptCameraDirectionChangeScenes.length === 0 &&
      captionCadenceViolations.length === 0 &&
      placeholderOrDebugText.length === 0 &&
      unapprovedSourceIds.length === 0 &&
      nonReleaseSourceIds.length === 0 &&
      !unverifiedCta,
    longestDeclaredEventGapFrames,
    maximumDeclaredEventGapFrames: 18,
    repeatedAdjacentHostPoses,
    productScenesWithoutProofTargets,
    missingSourceManifestEntries,
    inconsistentProductGazeScenes,
    cursorOutsideVisibleCropScenes,
    excessiveCameraVelocityScenes,
    excessiveCameraAccelerationScenes,
    abruptCameraDirectionChangeScenes,
    captionCadenceViolations,
    placeholderOrDebugText,
    unverifiedCta,
    unapprovedSourceIds,
    nonReleaseSourceIds
  };
}

export function sampleSolomonProductCamera(
  scene: SolomonStoryScene,
  localFrame: number,
  sourceItem: Pick<SolomonStorySource, "actionRegion" | "sourceWidth" | "sourceHeight">
): {
  left: number;
  top: number;
  zoom: number;
  targetRect: { left: number; top: number; width: number; height: number };
  cursor: { x: number; y: number };
  cursorVisible: boolean;
} {
  if (!scene.focusTarget || !scene.camera) throw new Error(`Scene ${scene.id} has no product camera plan.`);
  const viewportWidth = 968;
  const viewportHeight = 1_130;
  const baseHeight = viewportHeight;
  const baseWidth = baseHeight * (sourceItem.sourceWidth / sourceItem.sourceHeight);
  const settleProgress = quinticSmoothStep(clamp(localFrame / Math.max(1, scene.camera.settleFrames), 0, 1));
  const holdProgress = clamp((localFrame - scene.camera.settleFrames) / Math.max(1, (scene.to - scene.from) - scene.camera.settleFrames - 1), 0, 1);
  const holdZoomDrift = scene.assetId === "outreach" ? 0.3 : 0.12;
  const finalZoom = scene.camera.zoomEnd + holdProgress * holdZoomDrift;
  const zoom = scene.camera.zoomStart + (finalZoom - scene.camera.zoomStart) * settleProgress;
  const cursorSourceX = (sourceItem.actionRegion.x + sourceItem.actionRegion.width / 2) * baseWidth;
  const cursorSourceY = (sourceItem.actionRegion.y + sourceItem.actionRegion.height / 2) * baseHeight;
  const targetCenterX = (scene.focusTarget.x + scene.focusTarget.width / 2) * baseWidth;
  const targetCenterY = (scene.focusTarget.y + scene.focusTarget.height / 2) * baseHeight;
  const startLeft = clamp(
    viewportWidth * scene.camera.anchorX - targetCenterX * scene.camera.zoomStart,
    viewportWidth - baseWidth * scene.camera.zoomStart,
    0
  );
  const startTop = clamp(
    viewportHeight * scene.camera.anchorY - targetCenterY * scene.camera.zoomStart,
    viewportHeight - baseHeight * scene.camera.zoomStart,
    0
  );
  const desiredLeft = clamp(
    viewportWidth * scene.camera.anchorX - targetCenterX * zoom,
    viewportWidth - baseWidth * zoom,
    0
  );
  const desiredTop = clamp(
    viewportHeight * scene.camera.anchorY - targetCenterY * zoom,
    viewportHeight - baseHeight * zoom,
    0
  );
  const interpolatedLeft = startLeft + (desiredLeft - startLeft) * settleProgress;
  const interpolatedTop = startTop + (desiredTop - startTop) * settleProgress;
  const left = scene.camera.cursorRequired
    ? clamp(
        interpolatedLeft,
        Math.max(viewportWidth - baseWidth * zoom, 12 - cursorSourceX * zoom),
        Math.min(0, viewportWidth - 12 - cursorSourceX * zoom)
      )
    : interpolatedLeft;
  const top = scene.camera.cursorRequired
    ? clamp(
        interpolatedTop,
        Math.max(viewportHeight - baseHeight * zoom, 12 - cursorSourceY * zoom),
        Math.min(0, viewportHeight - 12 - cursorSourceY * zoom)
      )
    : interpolatedTop;
  const targetRect = {
    left: left + scene.focusTarget.x * baseWidth * zoom,
    top: top + scene.focusTarget.y * baseHeight * zoom,
    width: scene.focusTarget.width * baseWidth * zoom,
    height: scene.focusTarget.height * baseHeight * zoom
  };
  const cursor = {
    x: left + cursorSourceX * zoom,
    y: top + cursorSourceY * zoom
  };
  return {
    left,
    top,
    zoom,
    targetRect,
    cursor,
    cursorVisible: cursor.x >= 12 && cursor.x <= viewportWidth - 12 && cursor.y >= 12 && cursor.y <= viewportHeight - 12
  };
}

export function auditSolomonStoryLayout(manifest: SolomonCreatorStoryManifest): {
  passed: boolean;
  safeFrame: { left: 38; top: 52; right: 1042; bottom: 1844 };
  captionViolations: string[];
  presenterFaceCaptionCollisions: string[];
  ctaPersistsThroughFinalFrame: boolean;
} {
  const safeFrame = { left: 38, top: 52, right: 1042, bottom: 1844 } as const;
  const placementBounds: Record<SolomonCaptionPlacement, { top: number; bottom: number }> = {
    top: { top: 145, bottom: 285 },
    proof: { top: 185, bottom: 325 },
    center: { top: 700, bottom: 930 },
    lower: { top: 1_310, bottom: 1_515 }
  };
  const captionViolations = manifest.captions
    .filter(({ placement }) => {
      const bounds = placementBounds[placement];
      return bounds.top < safeFrame.top || bounds.bottom > safeFrame.bottom;
    })
    .map(({ id }) => id);
  const presenterScenes = manifest.scenes.filter(({ host }) => Boolean(host));
  const presenterFaceCaptionCollisions = manifest.captions.flatMap((caption) => {
    if (caption.placement !== "top" && caption.placement !== "proof") return [];
    return presenterScenes
      .filter((scene) => caption.from < scene.to && caption.to > scene.from && scene.host?.framing !== "pip")
      .map((scene) => `${caption.id}:${scene.id}`);
  });
  const finalCaption = manifest.captions.filter(({ role }) => role === "cta").at(-1);
  const ctaScene = manifest.scenes.filter(({ kind }) => kind === "cta").at(-1);
  const ctaPersistsThroughFinalFrame = manifest.cta.verified === true &&
    finalCaption?.to === manifest.canvas.durationInFrames &&
    ctaScene?.to === manifest.canvas.durationInFrames &&
    manifest.cta.actionCount === 1;
  return {
    passed: captionViolations.length === 0 && presenterFaceCaptionCollisions.length === 0,
    safeFrame,
    captionViolations,
    presenterFaceCaptionCollisions,
    ctaPersistsThroughFinalFrame
  };
}

function source(
  id: SolomonStoryAssetId,
  workflowId: string,
  route: string,
  sourcePath: string,
  verifiedSourceInterval: SolomonStorySource["verifiedSourceInterval"],
  extractedSourceInterval: SolomonStorySource["extractedSourceInterval"],
  initialState: string,
  action: string,
  resultState: string,
  narrationPurpose: string,
  actionRegion: SolomonStorySource["actionRegion"],
  resultRegion: SolomonStorySource["resultRegion"],
  cursorPolicy: SolomonStorySource["cursorPolicy"],
  captureApproval: SolomonCaptureApproval,
  privacyMasks: SolomonStorySource["privacyMasks"]
): SolomonStorySource {
  return {
    id, workflowId, route, sourcePath, sourceSha256: SOURCE_HASHES[id], sourceWidth: 1080, sourceHeight: 1350,
    verifiedSourceInterval, extractedSourceInterval,
    initialState, action, resultState, narrationPurpose, actionRegion, resultRegion, cursorPolicy, privacyMasks,
    environment: captureApproval.environment,
    publicReleaseApproved: captureApproval.publicReleaseApproved,
    environmentReviewReceipt: captureApproval.environmentReviewReceipt,
    authentic: true, approved: true
  };
}

function presenter(
  id: string, from: number, to: number, storyFunction: string, narration: string, visibleResult: string,
  pose: SolomonHostPose, emotion: SolomonHostEmotion, framing: SolomonHostFraming,
  gazeTarget: "camera" | "product_left" | "product_right" | "cta",
  speakingIntensity: number, soundCueIds: string[]
): SolomonStoryScene {
  return {
    id, from, to, kind: "presenter", storyFunction, narration, visibleResult, soundCueIds,
    captionIds: [],
    transitionBehavior: "hard_cut",
    host: { pose, emotion, framing, gazeTarget, speakingIntensity }
  };
}

function product(
  id: string, from: number, to: number, storyFunction: string, narration: string, visibleResult: string,
  assetId: SolomonStoryAssetId, focusTarget: NonNullable<SolomonStoryScene["focusTarget"]>, soundCueIds: string[],
  camera?: SolomonProductCameraPlan
): SolomonStoryScene {
  const targetCenter = focusTarget.x + focusTarget.width / 2;
  return {
    id, from, to, kind: "product", storyFunction, narration, visibleResult, assetId, focusTarget, soundCueIds,
    captionIds: [],
    transitionBehavior: "eased_reframe",
    camera: camera ?? {
      recipe: id.includes("detail") ? "target_magnification" : "evidence_highlight",
      anchorX: targetCenter < 0.5 ? 0.46 : 0.54,
      anchorY: 0.46,
      zoomStart: 1.02,
      zoomEnd: id.includes("detail") ? 1.5 : 1.34,
      settleFrames: 26,
      readabilityHoldFrames: 30,
      cursorRequired: false
    }
  };
}

function editorial(id: string, from: number, to: number, storyFunction: string, narration: string, visibleResult: string, soundCueIds: string[]): SolomonStoryScene {
  return {
    id, from, to, kind: "editorial", storyFunction, narration, visibleResult, soundCueIds,
    captionIds: [], transitionBehavior: "impact_reset", deliberateHold: true
  };
}

function comparison(
  id: string, from: number, to: number, storyFunction: string, narration: string, visibleResult: string,
  pose: SolomonHostPose, soundCueIds: string[]
): SolomonStoryScene {
  return {
    id, from, to, kind: "comparison", storyFunction, narration, visibleResult, soundCueIds,
    captionIds: [],
    transitionBehavior: "impact_reset",
    host: { pose, emotion: pose === "concerned_warning" ? "concerned" : "confident", framing: "pip", gazeTarget: "product_right", speakingIntensity: 0.62 }
  };
}

function cta(
  id: string, from: number, to: number, storyFunction: string, narration: string, visibleResult: string,
  pose: SolomonHostPose, emotion: SolomonHostEmotion, framing: SolomonHostFraming,
  gazeTarget: "camera" | "product_left" | "product_right" | "cta",
  speakingIntensity: number, soundCueIds: string[]
): SolomonStoryScene {
  return {
    id, from, to, kind: "cta", storyFunction, narration, visibleResult, soundCueIds,
    captionIds: [],
    transitionBehavior: "cta_resolve",
    deliberateHold: true,
    host: { pose, emotion, framing, gazeTarget, speakingIntensity }
  };
}

function caption(
  id: string, from: number, to: number, words: string[], emphasis: string[],
  role: SolomonCaptionRole, placement: SolomonCaptionPlacement, deliberateHold = false
): SolomonStoryCaption {
  return { id, from, to, words, emphasis, role, placement, deliberateHold };
}

function quinticSmoothStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
