// Transcribes the hand-authored V22 manifest into a CreativeBlueprint.
//
// This is the parity harness for the generic renderer. Writing the blueprint by
// hand would be eighteen scenes of transcription errors; deriving it mechanically
// makes the correspondence between the two models explicit, re-runnable, and
// reviewable as a diff when either side changes.
//
// It is deliberately a one-way, one-off tool. The generic path's input is a
// blueprint; V22's manifest is the thing being replaced. When the generic
// renderer reproduces this film, this script's job is done and the fixture it
// writes becomes the regression baseline.
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  SOLOMON_CREATOR_STORY_V22_ID,
  SOLOMON_CREATOR_STORY_V22_HOOK,
  SOLOMON_CREATOR_STORY_V22_CTA,
  createSolomonCreatorStoryV22Manifest
} = require("../dist/main/shared/solomonCreatorStoryV22.js");
const { V22_BACKDROPS } = require("../dist/main/shared/creatorStoryV22Quality.js");

// The crop rects live in the composition, not the manifest, because V22 authored
// them as JSX constants. Parsing them here is the same regex report-crop-framing
// uses, and it is temporary: once the resolver exists, crops come from the
// screen inventory and this block goes away with the rest of the transcription.
const compositionSource = await fs.readFile(path.join(root, "src", "remotion", "solomonCreatorStoryV22", "SolomonCreatorStoryV22.tsx"), "utf8");
const CROPS = {};
for (const match of compositionSource.match(/const CROPS=\{([\s\S]*?)\} satisfies/)[1].matchAll(/(\w+):\{x:(\d+),y:(\d+),width:(\d+),height:(\d+),trim:(\d+)(,motion:\{frames:(\d+),step:(\d+),hold:(\d+)\})?/g))
  CROPS[match[1]] = { x: +match[2], y: +match[3], width: +match[4], height: +match[5], trim: +match[6], ...(match[7] ? { motion: { frames: +match[8], step: +match[9], hold: +match[10] } } : {}) };

// Which crop each scene shows, read off the composition by hand once. The
// mapping is the thing the resolver replaces; recording it explicitly is what
// lets the parity render prove the templates before the resolver exists.
const SCENE_CROPS = {
  status: ["trackerBefore", "trackerAfter"],
  contact: ["contactCard"], reasons: ["contactProof"],
  friction: ["opportunityHeader", "contactCard", "opportunityPanel", "contactProof", "outreachBlank"],
  five: ["opportunityHeader", "contactCard", "opportunityPanel", "contactProof", "outreachBlank"],
  collapse: ["opportunityHeader"],
  role: ["opportunityTitle"], reason: ["contactHeader"],
  signature: ["opportunityHeader", "contactCard", "contactProof", "message"],
  signature_proof: ["opportunityHeader", "contactCard", "contactProof", "message"],
  draft: ["outreachDraftCard", "messageDraftEdit"],
  grounded: ["message"], control: ["messageEdit"],
  payoff: ["trackerAfter", "opportunityHeader", "contactCard", "message", "outreachBlank"],
  result: ["trackerAfter", "contactCard", "contactProof", "message"],
  hook: [], sting: [], cta: []
};
const ASSET_FOR_CROP = {
  trackerBefore: "tracker_before", trackerAfter: "tracker_after",
  opportunityHeader: "opportunity", opportunityTitle: "opportunity", opportunityPanel: "opportunity",
  contactCard: "contact", contactProof: "contact", contactHeader: "contact",
  outreachBlank: "outreach_blank", outreachDraftCard: "outreach_blank",
  message: "outreach_complete", messageDraftEdit: "outreach_complete", messageEdit: "outreach_complete"
};
function cropsForScene(sceneId) {
  return (SCENE_CROPS[sceneId] ?? []).map((key) => {
    const crop = CROPS[key];
    if (!crop) throw new Error(`Scene ${sceneId} names an unknown crop: ${key}`);
    return { assetId: ASSET_FOR_CROP[key], x: crop.x, y: crop.y, width: crop.width, height: crop.height, trim: crop.trim, ...(crop.motion ? { motion: crop.motion } : {}) };
  });
}

const FPS = 30;
const frameMs = (frame) => Math.round((frame / FPS) * 1000);

// V22 families are story beats; blueprint purposes are the six-part arc every
// creator video shares. Several families map to the same purpose, which is
// correct -- `role`, `reason` and `grounded` are all proof.
const PURPOSE = {
  hook: "hook", status: "demo", contact: "proof", reasons: "proof", friction: "problem",
  five_surfaces: "problem", collapse: "demo", role: "proof", signature: "demo",
  draft: "demo", grounded: "proof", control: "proof", payoff: "payoff",
  result: "payoff", cta: "cta", sting: "cta"
};

// The V22 layout modes and CreatorShotType describe the same eight compositions
// under different names. This is the mapping the template library keys on.
const SHOT_TYPE = {
  hero: "presenter_fullscreen",
  host: "presenter_fullscreen",
  presenter_close: "presenter_fullscreen",
  split: "split_presenter_product",
  split_close: "split_presenter_product",
  product: "product_fullscreen",
  detail: "product_fullscreen",
  cta: "cta_end_card"
};

// A scene declares its layout rects; the mode is recovered from their shape
// because the manifest stores the solved rects, not the mode name.
function shotTypeForScene(scene) {
  const product = scene.layout.find(({ kind }) => kind === "product");
  const mascot = scene.layout.find(({ kind }) => kind === "mascot");
  const cta = scene.layout.find(({ kind }) => kind === "cta");
  if (cta) return SHOT_TYPE.cta;
  if (product && mascot) return SHOT_TYPE.split;
  if (product) return product.bottom >= .9 ? SHOT_TYPE.detail : SHOT_TYPE.product;
  if (mascot) return mascot.top <= .32 ? SHOT_TYPE.presenter_close : SHOT_TYPE.host;
  return SHOT_TYPE.product;
}

// Content pattern is the axis CreatorShotType does not carry. Eighteen scenes
// resolve onto four shot types but the film draws them with seventeen
// components, so the pattern is what tells a template whether the product region
// swaps state under a cursor, scatters, converges, or holds one band.
// Keyed by scene id because V22's families do not separate these either:
// `reasons` and `reason` share a family and draw differently.
const CONTENT_PATTERN = {
  hook: "ambient", sting: "ambient",
  status: "state_swap",
  contact: "evidence_band", reasons: "evidence_band", role: "evidence_band",
  reason: "evidence_band", grounded: "evidence_band", control: "evidence_band",
  draft: "evidence_band",
  friction: "card_field", five: "card_field", collapse: "card_field", payoff: "card_field",
  signature: "filmstrip", signature_proof: "filmstrip",
  result: "composed_board",
  cta: "comment_card"
};

// What each pattern needs beyond its crops, read off the V22 components once.
// This is the part a generated blueprint will have to author for itself, and
// writing it down is what turns fifteen bespoke components into seven
// parameterised ones.
const CONTENT_OPTIONS = {
  status: { arrangement: "row", swapAt: .31, pills: ["APPLIED", "INTERVIEWING"], cursor: { fromX: 875, fromY: 980, toX: 727, toY: 1005, clickAt: 9 } },
  contact: { labels: ["AVERY CHEN", "SENIOR TECHNICAL RECRUITER", "NORTHSTAR LABS"] },
  reasons: { labels: ["WORKS AT NORTHSTAR LABS", "RELEVANT RECRUITING ROLE", "SUPPORTING EVIDENCE INCLUDED"] },
  role: { labels: ["PRODUCT ENGINEER", "NORTHSTAR LABS"] },
  reason: { labels: ["WORKS AT NORTHSTAR LABS", "RELEVANT RECRUITING ROLE", "SUPPORTING EVIDENCE INCLUDED"] },
  grounded: { highlight: true, pills: ["GENERIC OPENER", "ROLE + RELEVANCE"] },
  control: { labels: ["SAVE EDIT", "CANCEL \u00b7 SEND UNTOUCHED"], note: "NOTHING SENDS WITHOUT YOU", cursor: { fromX: 890, fromY: 1040, toX: 660, toY: 985, clickAt: 78 } },
  draft: { swapAt: .28, note: "SAVE EDIT \u00b7 DRAFT NOT SENT" },
  friction: { arrangement: "flank" },
  five: { arrangement: "grid", labels: ["JOB POST", "PROFILE", "NOTES", "CONTACTS", "BLANK MESSAGE"] },
  collapse: { arrangement: "converge" },
  payoff: { arrangement: "converge" },
  signature: { arrangement: "row", labels: ["JOB", "PERSON", "PROOF", "MESSAGE"] },
  signature_proof: { arrangement: "row", labels: ["JOB", "PERSON", "PROOF", "MESSAGE"] },
  result: {}, hook: {}, sting: {}, cta: {}
};

const PRESENTER_LAYOUT = {
  hero_close: "close_up", host: "medium", presenter_close: "close_up",
  cameo_left: "split_left", cameo_right: "split_right", absent: "medium"
};
const EXPRESSION = {
  happy: "excited", friendly: "confident", focused: "explanatory", concerned: "neutral",
  skeptical: "explanatory", wink: "confident", direct_cta: "confident", surprised: "excited"
};
const GESTURE_INTENT = {
  wave: "open_hand", open_palm: "open_hand", presentation_palm: "open_hand",
  stop_palm: "emphasis", celebration: "emphasis", approval: "emphasis",
  true_point_left: "point", true_point_right: "point", point_down: "point",
  bookmark_tap: "point", bookmark_hold: "none", thinking_hand: "none", rest_mitt: "none"
};

function presenterCue(scene) {
  const { mascot } = scene;
  const rect = scene.layout.find(({ kind }) => kind === "mascot");
  const visible = mascot.role !== "absent";
  return {
    visible,
    layout: PRESENTER_LAYOUT[mascot.role] ?? "medium",
    // Focus is the presenter box centre, which is what the rig solves against.
    crop: rect
      ? { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2, scale: 1 }
      : { x: .5, y: .78, scale: 1 },
    position: "center",
    scale: rect ? Number((rect.right - rect.left).toFixed(3)) : 0,
    expression: EXPRESSION[mascot.face] ?? "neutral",
    gestureIntent: GESTURE_INTENT[mascot.right?.gesture] ?? GESTURE_INTENT[mascot.left?.gesture] ?? "none",
    motionIntensity: mascot.torso && Math.abs(mascot.torso.lean) > .4 ? "energetic" : "subtle",
    eyeline: mascot.gazePath?.some(({ target }) => target === "product") ? "product_left" : "camera",
    backgroundTreatment: "transparent",
    disclosure: "synthetic_presenter",
    sourceScriptId: SOLOMON_CREATOR_STORY_V22_ID,
    sourceScriptUpdatedAt: new Date(0).toISOString()
  };
}

function backdropFor(token) {
  const backdrop = V22_BACKDROPS[token];
  if (!backdrop) throw new Error(`Unknown V22 backdrop token: ${token}`);
  return { token, tier: backdrop.tier, luma: backdrop.luma, css: backdrop.css, foreground: backdrop.foreground };
}

// `background.kind` is kept alongside `backdrop` so the ffmpeg render path in
// media.ts, which switches on it, still has something meaningful to read.
const BACKGROUND_KIND = { bright: "light", mid: "brand", deep: "dark" };

const captureReceiptPath = path.join(root, "tmp", "solomon-creator-story-v22-performance", "remotion-public");
const sources = ["tracker_before", "tracker_after", "opportunity", "contact", "outreach_blank", "outreach_complete"];
const inputs = sources.map((id) => ({ id, path: path.join(captureReceiptPath, `proof-${id.replace(/_/g, "-")}.mp4`), sha256: "0".repeat(64), domEvidence: [] }));
const manifest = createSolomonCreatorStoryV22Manifest(inputs, "0".repeat(64));

const scenes = manifest.scenes.map((scene) => {
  const backdrop = backdropFor(scene.backdrop);
  return {
    id: scene.id,
    startMs: frameMs(scene.from),
    endMs: frameMs(scene.to),
    purpose: PURPOSE[scene.family] ?? "demo",
    shotType: shotTypeForScene(scene),
    contentPattern: CONTENT_PATTERN[scene.id] ?? "evidence_band",
    contentOptions: CONTENT_OPTIONS[scene.id] ?? {},
    presenter: presenterCue(scene),
    productAssetIds: scene.assetIds,
    supportedClaimIds: scene.claimIds,
    // Captions live on the blueprint's scenes in the app model but are authored
    // film-wide here; the renderer windows them, so they stay empty per scene and
    // the film-level list is authoritative.
    captions: [],
    typography: [],
    background: { kind: BACKGROUND_KIND[backdrop.tier] },
    backdrop,
    transition: { kind: scene.transition.type === "cut" ? "none" : scene.transition.type, durationMs: 0 },
    focus: { x: scene.camera.focus.x, y: scene.camera.focus.y, scale: scene.camera.scaleTo },
    minimumReadableDwellMs: 600,
    audioCues: [],
    ...(cropsForScene(scene.id).length ? { productCrop: cropsForScene(scene.id)[0], productCrops: cropsForScene(scene.id) } : {}),
    layoutRects: scene.layout,
    groupStartMs: frameMs(scene.groupFrom)
  };
});

const blueprint = {
  schemaVersion: "1",
  id: "solomon-creator-story-v22-parity",
  templateId: "reference-creator-video-v1",
  templateVersion: 1,
  targetDurationMs: frameMs(manifest.scenes.at(-1).to),
  pacePreset: "reference_fast",
  estimatedWordsPerMinute: 180,
  hook: SOLOMON_CREATOR_STORY_V22_HOOK,
  cta: SOLOMON_CREATOR_STORY_V22_CTA,
  brandKit: {
    productName: "Solomon",
    primaryColor: "#39f2b5",
    secondaryColor: "#087052",
    accentColor: "#ff9d18",
    backgroundColor: "#07111f",
    captionStyle: "kinetic_bold",
    ctaStyle: "comment_keyword"
  },
  claimIds: [...new Set(manifest.scenes.flatMap(({ claimIds }) => claimIds))],
  productAssets: [],
  scenes,
  renderPolicy: { canvas: { width: 1080, height: 1920, fps: FPS }, targetLufs: -14, loudnessToleranceLu: .5, ctaDurationMs: 3400 },
  qualityPolicy: {
    requireEvidenceBackedClaims: true, requireCaptionSafeArea: true, requireAudioAlignment: true,
    requireCta: true, requireAvatarDisclosure: true, maxVisualChangesPerTenSeconds: 12, minProductTextScale: 1
  },
  compiledAt: new Date(0).toISOString()
};

const target = path.join(root, "fixtures", "creator-story", "solomon-v22.blueprint.json");
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(target, `${JSON.stringify(blueprint, null, 2)}\n`);

const shotCounts = scenes.reduce((counts, scene) => ({ ...counts, [scene.shotType]: (counts[scene.shotType] ?? 0) + 1 }), {});
const patternCounts = scenes.reduce((counts, scene) => ({ ...counts, [scene.contentPattern]: (counts[scene.contentPattern] ?? 0) + 1 }), {});
const missingPattern = scenes.filter((scene) => !CONTENT_PATTERN[scene.id]);
if (missingPattern.length) throw new Error(`No content pattern for: ${missingPattern.map(({ id }) => id).join(", ")}`);
process.stdout.write(`${scenes.length} scenes -> ${path.relative(root, target)}\n`);
process.stdout.write(`duration ${blueprint.targetDurationMs}ms, ${blueprint.claimIds.length} claims\n`);
process.stdout.write(`shot types: ${Object.entries(shotCounts).map(([type, count]) => `${type} ${count}`).join(", ")}\n`);
process.stdout.write(`patterns:   ${Object.entries(patternCounts).map(([type, count]) => `${type} ${count}`).join(", ")}\n`);
process.stdout.write(`crops:      ${scenes.reduce((total, scene) => total + (scene.productCrops?.length ?? 0), 0)} across ${scenes.filter((scene) => scene.productCrops).length} scenes\n`);
