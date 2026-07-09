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
import type { DetectedMoment } from "./types";

const moments: DetectedMoment[] = [
  {
    id: "moment-1",
    label: "Lead research setup",
    startMs: 0,
    endMs: 5000,
    evidence: "Frame shows the lead research setup.",
    sourceEvidenceIds: ["frame:1"],
    confidence: 0.9,
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
  });

  it("maps common concept families to deterministic templates", () => {
    expect(templateForFormatFamily("feature-highlight")).toBe("hidden_feature_reveal");
    expect(templateForFormatFamily("time-saver")).toBe("saves_you_time");
    expect(templateForFormatFamily("save-time-demo")).toBe("saves_you_time");
    expect(templateForFormatFamily("founder-demo")).toBe("founder_demo");
    expect(templateForFormatFamily("three-reasons")).toBe("three_reasons");
    expect(templateForFormatFamily("before-after")).toBe("before_after_workflow");
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
    const profile = {
      ...createDefaultProfile(),
      productName: "LeadPilot",
      brandPresenterEnabled: true,
      brandKit: normalizeBrandKit({ primaryColor: "#112233", accentColor: "#445566" }, "LeadPilot")
    };
    const voiceover = "Most people miss this part of LeadPilot. Watch the result appear on screen.";
    const captions = splitCaptionSegments(voiceover, 18_000);
    const visualBeats = buildVisualBeatsForTemplate({
      moments,
      durationMs: 18_000,
      templateKey: "brand_presenter"
    });
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
    expect(editDecisionList.brandKit.productName).toBe("LeadPilot");
    expect(editDecisionList.presenter.enabled).toBe(true);
    expect(editDecisionList.sourceSegments.length).toBeGreaterThanOrEqual(5);
    expect(editDecisionList.sourceSegments[1]?.timelineStartMs).toBeGreaterThan(0);
    expect(editDecisionList.zooms.length).toBe(editDecisionList.sourceSegments.length);
    expect(editDecisionList.callouts.length).toBeGreaterThanOrEqual(4);
    expect(new Set(editDecisionList.sourceSegments.map((segment) => segment.momentId)).size).toBeLessThan(
      editDecisionList.sourceSegments.length
    );
    expect(editDecisionList.music.enabled).toBe(false);
    expect(editDecisionList.sfx).toHaveLength(0);
    expect(editDecisionList.qualityGates.requireEvidenceBackedClaims).toBe(true);
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
