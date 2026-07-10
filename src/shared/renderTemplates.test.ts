import { describe, expect, it } from "vitest";
import { createDefaultProfile, splitCaptionSegments } from "./contentEngine";
import {
  buildEditDecisionList,
  buildVisualBeatsForTemplate,
  creatorTemplatePack,
  hasBlockingScriptWarnings,
  normalizeBrandKit,
  templateForFormatFamily
} from "./renderTemplates";
import type { DetectedMoment, ProductProfile } from "./types";

const moments: DetectedMoment[] = [
  {
    id: "moment-1",
    label: "Lead research setup",
    startMs: 0,
    endMs: 5000,
    evidence: "Frame shows the lead research setup.",
    sourceEvidenceIds: ["frame:1"],
    confidence: 0.9,
    interactionHint: {
      kind: "click_target",
      x: 0.62,
      y: 0.44,
      confidence: 0.91,
      label: "Generate draft"
    },
    enabled: true
  },
  {
    id: "moment-2",
    label: "Personalized draft result",
    startMs: 5000,
    endMs: 11000,
    evidence: "Frame shows a generated personalized draft.",
    sourceEvidenceIds: ["frame:2"],
    confidence: 0.88,
    enabled: true
  }
];

describe("creator render templates", () => {
  it("exposes the required creator-style template pack", () => {
    expect(creatorTemplatePack.map((template) => template.key)).toEqual(
      expect.arrayContaining([
        "hidden_feature_reveal",
        "saves_you_time",
        "problem_demo_payoff",
        "founder_demo",
        "three_reasons",
        "before_after_workflow",
        "brand_presenter"
      ])
    );
    expect(
      creatorTemplatePack.every(
        (template) =>
          template.pacingRules.length >= 5 &&
          template.pacingRules[0]?.purpose === "hook" &&
          template.hookOverlayMs >= 2_000 &&
          template.proofOverlayMs >= 2_000 &&
          template.ctaLeadMs >= 4_000
      )
    ).toBe(true);
    expect(creatorTemplatePack.find((template) => template.key === "hidden_feature_reveal")?.zoomIntensity).toBe("strong");
    expect(creatorTemplatePack.find((template) => template.key === "founder_demo")?.zoomIntensity).toBe("subtle");
  });

  it("maps common concept families to deterministic templates", () => {
    expect(templateForFormatFamily("feature-highlight")).toBe("hidden_feature_reveal");
    expect(templateForFormatFamily("time-saver")).toBe("saves_you_time");
    expect(templateForFormatFamily("save-time-demo")).toBe("saves_you_time");
    expect(templateForFormatFamily("founder-demo")).toBe("founder_demo");
    expect(templateForFormatFamily("three-reasons")).toBe("three_reasons");
    expect(templateForFormatFamily("before-after")).toBe("before_after_workflow");
  });

  it("normalizes stable brand kit identifiers for render lineage", () => {
    expect(createDefaultProfile().brandKit?.id).toBe("brand-kit:product");
    expect(normalizeBrandKit({ id: "brand-kit:custom", primaryColor: "#112233" }, "LeadPilot")).toMatchObject({
      id: "brand-kit:custom",
      productName: "LeadPilot",
      primaryColor: "#112233"
    });
    expect(normalizeBrandKit(undefined, "Lead Pilot").id).toBe("brand-kit:lead-pilot");
  });

  it("classifies only claim and render-fit warnings as blocking", () => {
    expect(hasBlockingScriptWarnings(undefined)).toBe(false);
    expect(hasBlockingScriptWarnings([{ code: "generic_phrase", message: "Use a more specific phrase." }])).toBe(false);
    expect(hasBlockingScriptWarnings([{ code: "long_line", message: "Shorten this caption line." }])).toBe(false);
    expect(hasBlockingScriptWarnings([{ code: "missing_evidence", message: "Add product evidence." }])).toBe(true);
    expect(hasBlockingScriptWarnings([{ code: "caption_overflow_risk", message: "Caption may overflow." }])).toBe(true);
    expect(hasBlockingScriptWarnings([{ code: "unsupported_claim", message: "Claim is not supported." }])).toBe(true);
  });

  it("builds a renderable edit decision list with zooms, callouts, presenter, and brand kit", () => {
    const profile: ProductProfile = {
      ...createDefaultProfile(),
      productName: "LeadPilot",
      brandPresenterEnabled: true,
      brandPresenterPosition: "lower_left",
      brandPresenterMotion: "idle_bob",
      brandKit: normalizeBrandKit({ primaryColor: "#112233", accentColor: "#445566" }, "LeadPilot")
    };
    const voiceover = "Most people miss this part of LeadPilot. Watch the result appear on screen.";
    const captions = splitCaptionSegments(voiceover, 18_000);
    const visualBeats = buildVisualBeatsForTemplate({
      moments,
      durationMs: 18_000,
      templateKey: "brand_presenter"
    });
    expect(visualBeats[0]).toMatchObject({ sourceStartMs: moments[0]?.startMs, sourceEndMs: moments[0]?.endMs });
    expect(visualBeats[0]?.transitionIn?.enabled).toBe(false);
    expect(visualBeats[1]?.transitionIn).toMatchObject({ enabled: true, kind: "snap_cut" });
    expect(visualBeats[0]?.endMs).toBeLessThan(3_600);
    expect(visualBeats.at(-1)?.endMs).toBe(18_000);
    expect(visualBeats.every((beat) => (beat.callout?.length ?? 0) <= 32)).toBe(true);
    const editDecisionList = buildEditDecisionList({
      profile,
      templateKey: "brand_presenter",
      durationMs: 18_000,
      captions,
      visualBeats,
      hook: "Most people miss this part of LeadPilot",
      cta: "Try LeadPilot with one workflow.",
      moments
    });

    expect(editDecisionList.schemaVersion).toBe("2");
    expect(editDecisionList.templateId).toBe("creator-template:brand_presenter:v1");
    expect(editDecisionList.brandKitId).toBe("brand-kit:leadpilot");
    expect(editDecisionList.brandKit.productName).toBe("LeadPilot");
    expect(editDecisionList.brandKit.id).toBe("brand-kit:leadpilot");
    expect(editDecisionList.presenter.enabled).toBe(true);
    expect(editDecisionList.presenter.position).toBe("lower_left");
    expect(editDecisionList.presenter.motion).toBe("idle_bob");
    expect(editDecisionList.sourceSegments.length).toBeGreaterThanOrEqual(5);
    expect(editDecisionList.sourceSegments[0]).toMatchObject({
      sourceStartMs: visualBeats[0]?.sourceStartMs,
      sourceEndMs: visualBeats[0]?.sourceEndMs
    });
    expect(editDecisionList.sourceSegments[1]?.timelineStartMs).toBeGreaterThan(0);
    expect(editDecisionList.zooms.length).toBe(editDecisionList.sourceSegments.length);
    expect(editDecisionList.transitions).toHaveLength(visualBeats.length - 1);
    expect(editDecisionList.transitions[0]).toMatchObject({ kind: "snap_cut", startMs: visualBeats[1]!.startMs - 90 });
    expect(editDecisionList.overlays.find((overlay) => overlay.kind === "hook")?.endMs).toBe(3_000);
    expect(editDecisionList.overlays.find((overlay) => overlay.kind === "cta")?.startMs).toBe(12_800);
    expect(editDecisionList.callouts.length).toBeGreaterThanOrEqual(4);
    expect(editDecisionList.callouts[0]?.arrow).toEqual({ enabled: true, direction: "auto" });
    expect(editDecisionList.cursorCues[0]).toMatchObject({
      kind: "click_target",
      anchor: { x: 0.62, y: 0.44 },
      label: "Generate draft",
      confidence: 0.91
    });
    expect(editDecisionList.cursorCues[0]?.startMs).toBeGreaterThanOrEqual(visualBeats[0]!.startMs);
    expect(new Set(editDecisionList.sourceSegments.map((segment) => segment.momentId)).size).toBeLessThan(
      editDecisionList.sourceSegments.length
    );
    expect(editDecisionList.music.enabled).toBe(false);
    expect(editDecisionList.sfx).toHaveLength(0);
    expect(editDecisionList.qualityGates.requireEvidenceBackedClaims).toBe(true);
  });

  it("uses visual beat transition overrides when building quick cuts", () => {
    const profile = createDefaultProfile();
    const captions = splitCaptionSegments("Show the slow part. Now show the faster result.", 16_000);
    const visualBeats = buildVisualBeatsForTemplate({
      moments,
      durationMs: 16_000,
      templateKey: "before_after_workflow"
    }).map((beat, index) =>
      index === 1
        ? { ...beat, transitionIn: { enabled: true, kind: "match_cut" as const } }
        : index === 2
          ? { ...beat, transitionIn: { enabled: false, kind: "wipe" as const } }
          : beat
    );

    const editDecisionList = buildEditDecisionList({
      profile,
      templateKey: "before_after_workflow",
      durationMs: 16_000,
      captions,
      visualBeats,
      hook: "Here is the before and after",
      cta: "Try it on one workflow.",
      moments
    });

    expect(editDecisionList.transitions[0]?.kind).toBe("match_cut");
    expect(editDecisionList.transitions.some((transition) => transition.id === "cut-2")).toBe(false);
  });

  it("keeps before and payoff beats on the same ranked evidence pair", () => {
    const pairedMoments: DetectedMoment[] = [
      {
        ...moments[0]!,
        id: "before-moment",
        visualRole: "before",
        beforeAfterPairId: "before-after:before-moment:payoff-moment"
      },
      {
        ...moments[1]!,
        id: "payoff-moment",
        visualRole: "payoff",
        beforeAfterPairId: "before-after:before-moment:payoff-moment"
      },
      {
        ...moments[0]!,
        id: "other-payoff",
        visualRole: "payoff",
        proofScore: 0.99
      }
    ];
    const beats = buildVisualBeatsForTemplate({
      moments: pairedMoments,
      durationMs: 18_000,
      templateKey: "before_after_workflow"
    });

    expect(beats.find((beat) => beat.purpose === "problem")?.momentId).toBe("before-moment");
    expect(beats.find((beat) => beat.purpose === "payoff")?.momentId).toBe("payoff-moment");
    expect(beats.find((beat) => beat.purpose === "cta")?.momentId).toBe("payoff-moment");
  });

  it("uses visual beat cursor emphasis overrides when building cursor cues", () => {
    const profile = createDefaultProfile();
    const captions = splitCaptionSegments("Click generate. The finished draft appears.", 16_000);
    const visualBeats = buildVisualBeatsForTemplate({
      moments,
      durationMs: 16_000,
      templateKey: "hidden_feature_reveal"
    }).map((beat, index) =>
      index === 0
        ? { ...beat, cursorEmphasis: { enabled: false, kind: "click_target" as const } }
        : index === 1
          ? {
              ...beat,
              focus: { x: 0.34, y: 0.61, scale: 1.3 },
              cursorEmphasis: { enabled: true, kind: "cursor_candidate" as const, label: "Result appears" }
            }
          : beat
    );

    const editDecisionList = buildEditDecisionList({
      profile,
      templateKey: "hidden_feature_reveal",
      durationMs: 16_000,
      captions,
      visualBeats,
      hook: "Most people miss this",
      cta: "Try it on one workflow.",
      moments
    });

    expect(editDecisionList.cursorCues.some((cue) => cue.id === "cursor-1")).toBe(false);
    expect(editDecisionList.cursorCues[0]).toMatchObject({
      id: "cursor-2",
      kind: "cursor_candidate",
      label: "Result appears",
      anchor: { x: 0.34, y: 0.61, scale: 1.3 },
      confidence: 0.7
    });
  });

  it("adds deterministic music and SFX cues when sound design is enabled", () => {
    const profile = {
      ...createDefaultProfile(),
      productName: "LeadPilot",
      soundDesignEnabled: true,
      musicMood: "upbeat" as const
    };
    const voiceover = "Most people miss this part of LeadPilot. Watch the result appear on screen.";
    const captions = splitCaptionSegments(voiceover, 18_000);
    const visualBeats = buildVisualBeatsForTemplate({
      moments,
      durationMs: 18_000,
      templateKey: "hidden_feature_reveal"
    });

    const editDecisionList = buildEditDecisionList({
      profile,
      templateKey: "hidden_feature_reveal",
      durationMs: 18_000,
      captions,
      visualBeats,
      hook: "Most people miss this part of LeadPilot",
      cta: "Try LeadPilot with one workflow.",
      moments
    });

    expect(editDecisionList.music).toMatchObject({ enabled: true, mood: "upbeat" });
    expect(editDecisionList.sfx.length).toBeGreaterThan(0);
    expect(editDecisionList.sfx.every((cue) => cue.startMs >= 0 && cue.startMs < editDecisionList.durationMs)).toBe(true);
  });
});
