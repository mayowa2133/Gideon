import { describe, expect, it } from "vitest";
import {
  assertCreatorEditorialEdl,
  buildKineticCaptions,
  compileCreatorEditorial,
  creatorEditorialTemplateV1,
  editorialChangedSceneIds,
  estimateWords,
  evaluateCreatorEditorial,
  projectCreatorEditorialOntoEditDecisionList,
  selectEditorialActionEvent,
  type EditorialNarrationBeat
} from "./creatorEditorial";
import type { CreativeBlueprint, EditDecisionList, ProductEvidenceAsset } from "./types";

const sha = (digit: string): string => digit.repeat(64);

function asset(id: string, hashDigit: string): ProductEvidenceAsset {
  return {
    id,
    kind: "interaction_clip",
    label: id,
    sourceMomentIds: [`moment-${id}`],
    sourceEvidenceIds: [`evidence-${id}`],
    supportedClaimIds: [`claim-${id}`],
    sourceStartMs: 0,
    sourceEndMs: 5_000,
    clipPath: `/private/${id}.mp4`,
    contentHash: sha(hashDigit),
    maskingStatus: "masked",
    crop: { x: 0.52, y: 0.43, scale: 1.32 },
    readableRegion: { x: 0.08, y: 0.08, width: 0.84, height: 0.78 },
    provenance: "captured_product",
    approvalStatus: "approved",
    factualUseAllowed: true
  };
}

const assets = [asset("jobs", "a"), asset("tracker", "b"), asset("contacts", "c"), asset("outreach", "d")];
const claims = assets.map(({ id }) => `claim-${id}`);

function blueprint(): CreativeBlueprint {
  return {
    schemaVersion: "1",
    id: "blueprint-editorial-fixture",
    templateId: "creator-product-explainer",
    templateVersion: 1,
    targetDurationMs: 35_000,
    pacePreset: "energetic",
    estimatedWordsPerMinute: 195,
    hook: "Find the right next move.",
    cta: "See what Solomon can organize for you.",
    brandKit: {
      productName: "Solomon",
      primaryColor: "#101A33",
      secondaryColor: "#F4F1E8",
      accentColor: "#39D3C4",
      backgroundColor: "#071526",
      captionStyle: "kinetic_bold",
      ctaStyle: "learn_more"
    },
    claimIds: claims,
    productAssets: assets,
    scenes: [],
    renderPolicy: { canvas: { width: 1080, height: 1920, fps: 30 }, targetLufs: -14, loudnessToleranceLu: 1, ctaDurationMs: 3_000 },
    qualityPolicy: { requireEvidenceBackedClaims: true, requireCaptionSafeArea: true, requireAudioAlignment: true, requireCta: true, requireAvatarDisclosure: true, maxVisualChangesPerTenSeconds: 6, minProductTextScale: 1.15 },
    compiledAt: "2026-07-27T00:00:00.000Z"
  };
}

function beats(): EditorialNarrationBeat[] {
  const text = [
    "Your job search should feel focused, not scattered.",
    "Solomon brings the next decision into view.",
    "Browse relevant roles and narrow the list.",
    "Keep opportunities organized as priorities change.",
    "Review saved contacts with the context you need.",
    "Then inspect outreach before anything moves forward.",
    "One workspace keeps the evidence beside the decision.",
    "Find, track, review, and choose your next move.",
    "See what Solomon can organize for you."
  ];
  const purposes: EditorialNarrationBeat["purpose"][] = ["hook", "reveal", "evidence", "evidence", "evidence", "evidence", "benefit", "recap", "cta"];
  const evidence = [[], [], ["jobs"], ["tracker"], ["contacts"], ["outreach"], [], ["jobs"], []];
  return text.map((value, index) => ({
    id: `beat-${index + 1}`,
    text: value,
    startMs: index * 3_550,
    endMs: (index + 1) * 3_550,
    purpose: purposes[index]!,
    claimIds: evidence[index]!.map((id) => `claim-${id}`),
    evidenceAssetIds: evidence[index]!,
    emphasizedWords: index === 1 ? ["Solomon"] : []
  }));
}

const telemetry = assets.map((item, index) => ({
  evidenceAssetId: item.id,
  sourceSha256: sha(String(index + 1)),
  cursorSamples: [{ timestampMs: 500, x: 0.62, y: 0.46, confidence: 0.96 }],
  actionRegion: { x: 0.42, y: 0.30, width: 0.38, height: 0.28 },
  resultRegion: { x: 0.30, y: 0.25, width: 0.54, height: 0.38 }
}));

describe("creator_editorial_v1", () => {
  it("compiles a deterministic 35-second, 14–18-shot editorial EDL with lineage", () => {
    const first = compileCreatorEditorial({ blueprint: blueprint(), narrationBeats: beats(), telemetry });
    const second = compileCreatorEditorial({ blueprint: blueprint(), narrationBeats: beats(), telemetry });
    expect(first).toEqual(second);
    expect(first.durationMs).toBe(35_000);
    expect(first.shots).toHaveLength(16);
    expect(first.shots.at(-2)?.family).toBe("presenter_cta");
    expect(first.shots.at(-1)?.family).toBe("branded_outro");
    expect(first.lineage.sourceCaptureHashes).toHaveLength(4);
    expect(first.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0).every(({ sourceIntervalMs }) => Boolean(sourceIntervalMs && sourceIntervalMs.endMs > sourceIntervalMs.startMs))).toBe(true);
    expect(first.shots.every((shot, index) => index === 0 || shot.startMs === first.shots[index - 1]!.endMs)).toBe(true);
    expect(evaluateCreatorEditorial(first).passed).toBe(true);
    expect(() => assertCreatorEditorialEdl(first)).not.toThrow();
  });

  it("meets rhythm, transition, presenter visibility, and scale policy", () => {
    const edl = compileCreatorEditorial({ blueprint: blueprint(), narrationBeats: beats(), telemetry });
    const durations = edl.shots.map(({ startMs, endMs }) => endMs - startMs);
    const visibleMs = edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0);
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(creatorEditorialTemplateV1.shotDurationMs.min);
    expect(Math.max(...durations)).toBeLessThanOrEqual(creatorEditorialTemplateV1.shotDurationMs.max);
    expect(visibleMs / edl.durationMs).toBeGreaterThanOrEqual(0.55);
    expect(visibleMs / edl.durationMs).toBeLessThanOrEqual(0.70);
    expect(edl.shots.filter(({ presenter }) => presenter.visible).every(({ presenter }) => presenter.scale >= 0.35 && presenter.scale <= 0.5)).toBe(true);
    expect(edl.shots.every(({ transitionIn }) => transitionIn.durationMs === 0 || transitionIn.durationMs >= 150 && transitionIn.durationMs <= 450)).toBe(true);
  });

  it("preserves every narration word once while chunking into one to five words", () => {
    const beat = beats()[0]!;
    const cues = buildKineticCaptions({ beats: [beat], range: { startMs: beat.startMs, endMs: beat.endMs }, timingProvenance: "deterministic_estimate", avoid: "full" });
    expect(cues.every(({ words }) => words.length >= 1 && words.length <= 5)).toBe(true);
    expect(cues.flatMap(({ words }) => words).join(" ")).toBe(beat.text);
    expect(cues.every(({ timingProvenance }) => timingProvenance === "deterministic_estimate")).toBe(true);
  });

  it("creates deterministic weighted timing with complete coverage", () => {
    const words = estimateWords("Short extraordinary words.", 100, 1_100);
    expect(words[0]?.startMs).toBe(100);
    expect(words.at(-1)?.endMs).toBe(1_100);
    expect(words.every((word, index) => index === 0 || word.startMs === words[index - 1]!.endMs)).toBe(true);
    expect(words[1]!.endMs - words[1]!.startMs).toBeGreaterThan(words[0]!.endMs - words[0]!.startMs);
  });

  it("rejects unsupported claims and invalid telemetry at the trust boundary", () => {
    const unsupported = beats();
    unsupported[0] = { ...unsupported[0]!, claimIds: ["claim-invented"] };
    expect(() => compileCreatorEditorial({ blueprint: blueprint(), narrationBeats: unsupported, telemetry })).toThrow(/unsupported claim/i);
    expect(() => compileCreatorEditorial({ blueprint: blueprint(), narrationBeats: beats(), telemetry: [{ ...telemetry[0]!, sourceSha256: "bad" }] })).toThrow(/lineage/i);
  });

  it("selects a recorded interaction over an observe-only target", () => {
    const selected = selectEditorialActionEvent([
      {
        stepId: "observe",
        startMs: 2_600,
        endMs: 4_100,
        region: { x: 0.1, y: 0.4, width: 0.1, height: 0.05 },
        evidence: "recorded_action_target",
        interaction: "observe"
      },
      {
        stepId: "write",
        startMs: 4_100,
        endMs: 6_800,
        region: { x: 0.06, y: 0.34, width: 0.14, height: 0.04 },
        evidence: "recorded_action_target",
        interaction: "synthetic_write"
      }
    ], { startMs: 2_100, endMs: 4_200 });
    expect(selected?.stepId).toBe("write");
  });

  it("tracks only a changed shot and its transition neighbors for scoped invalidation", () => {
    const first = compileCreatorEditorial({ blueprint: blueprint(), narrationBeats: beats(), telemetry });
    const changedBeats = beats();
    changedBeats[4] = { ...changedBeats[4]!, text: "Review saved contacts with clear context." };
    const next = compileCreatorEditorial({ blueprint: blueprint(), narrationBeats: changedBeats, telemetry });
    const changed = editorialChangedSceneIds(first, next);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(first.shots.length);
  });

  it("projects the editorial contract into Gideon EditDecisionList v2", () => {
    const editorial = compileCreatorEditorial({ blueprint: blueprint(), narrationBeats: beats(), telemetry });
    const base: EditDecisionList = {
      schemaVersion: "2",
      templateId: "creator-template:brand_presenter:v1",
      templateKey: "brand_presenter",
      templateVersion: 1,
      brandKitId: "fixture-brand",
      durationMs: 10_000,
      canvas: { width: 1080, height: 1920, fps: 30 },
      brandKit: blueprint().brandKit,
      sourceSegments: [{ momentId: "fixture", sourceStartMs: 0, sourceEndMs: 5_000, timelineStartMs: 0, timelineEndMs: 10_000, fit: "contain", focus: { x: 0.5, y: 0.5, scale: 1 } }],
      zooms: [],
      transitions: [],
      captions: [],
      overlays: [],
      callouts: [],
      cursorCues: [],
      sfx: [],
      presenter: { enabled: false, style: "fictional_illustrated", avatarId: "orbit", provenance: "gideon_fictional_catalog", disclosure: "AI-generated brand presenter", startMs: 0, endMs: 10_000, position: "lower_left", motion: "idle_bob" },
      music: { enabled: false, mood: "none", gainDb: -30 },
      qualityGates: { requireEvidenceBackedClaims: true, requireCaptionSafeArea: true, requireAudioAlignment: true }
    };
    const projected = projectCreatorEditorialOntoEditDecisionList(base, editorial);
    expect(projected.schemaVersion).toBe("2");
    expect(projected.templateKey).toBe("creator_editorial_v1");
    expect(projected.durationMs).toBe(35_000);
    expect(projected.sourceSegments).toHaveLength(editorial.shots.length);
    expect(projected.captions.flatMap(({ words = [] }) => words).map(({ text }) => text).join(" ")).toBe(beats().map(({ text }) => text).join(" "));
    expect(projected.presenter.enabled).toBe(true);
    expect(projected.transitions.length).toBeGreaterThan(0);
  });
});
