import type {
  BrandKit,
  CaptionSegment,
  CreatorTemplateKey,
  DetectedMoment,
  EditDecisionList,
  EvidenceClaim,
  Platform,
  ProductProfile,
  RenderFocusPoint,
  ScriptQualityWarning,
  VisualBeat
} from "./types";

export interface CreatorTemplateDefinition {
  key: CreatorTemplateKey;
  name: string;
  formatFamily: string;
  hookPattern: string;
  captionStyle: BrandKit["captionStyle"];
  visualRhythm: "snap" | "steady" | "stacked" | "contrast";
  defaultDurationSec: number;
  ctaPosition: "bottom" | "center";
  presenterCompatible: boolean;
}

export const creatorTemplatePack: CreatorTemplateDefinition[] = [
  {
    key: "hidden_feature_reveal",
    name: "Hidden feature reveal",
    formatFamily: "feature-highlight",
    hookPattern: "Most people miss this part of {product}.",
    captionStyle: "kinetic_bold",
    visualRhythm: "snap",
    defaultDurationSec: 24,
    ctaPosition: "bottom",
    presenterCompatible: true
  },
  {
    key: "saves_you_time",
    name: "This saves you time",
    formatFamily: "time-saver",
    hookPattern: "This saves {customer} from doing the slow part manually.",
    captionStyle: "kinetic_bold",
    visualRhythm: "snap",
    defaultDurationSec: 26,
    ctaPosition: "bottom",
    presenterCompatible: true
  },
  {
    key: "problem_demo_payoff",
    name: "Problem to demo to payoff",
    formatFamily: "problem-solution",
    hookPattern: "If {customer} still does this manually, show this.",
    captionStyle: "clean_founder",
    visualRhythm: "steady",
    defaultDurationSec: 30,
    ctaPosition: "bottom",
    presenterCompatible: true
  },
  {
    key: "founder_demo",
    name: "Founder product demo",
    formatFamily: "founder-demo",
    hookPattern: "I built {product} because this workflow was too slow.",
    captionStyle: "clean_founder",
    visualRhythm: "steady",
    defaultDurationSec: 36,
    ctaPosition: "bottom",
    presenterCompatible: true
  },
  {
    key: "three_reasons",
    name: "Three reasons",
    formatFamily: "three-reasons",
    hookPattern: "Three reasons {customer} should care about this workflow.",
    captionStyle: "educational_stack",
    visualRhythm: "stacked",
    defaultDurationSec: 38,
    ctaPosition: "bottom",
    presenterCompatible: true
  },
  {
    key: "before_after_workflow",
    name: "Before and after workflow",
    formatFamily: "before-after",
    hookPattern: "Here is the before and after inside {product}.",
    captionStyle: "kinetic_bold",
    visualRhythm: "contrast",
    defaultDurationSec: 32,
    ctaPosition: "bottom",
    presenterCompatible: false
  },
  {
    key: "brand_presenter",
    name: "Brand presenter",
    formatFamily: "brand-presenter",
    hookPattern: "Let {product} explain the workflow in under a minute.",
    captionStyle: "clean_founder",
    visualRhythm: "snap",
    defaultDurationSec: 34,
    ctaPosition: "bottom",
    presenterCompatible: true
  }
];

const templateByKey = new Map(creatorTemplatePack.map((template) => [template.key, template]));

export function getCreatorTemplate(key: CreatorTemplateKey | undefined): CreatorTemplateDefinition {
  return templateByKey.get(key ?? "problem_demo_payoff") ?? creatorTemplatePack[1]!;
}

export function templateForFormatFamily(formatFamily: string, index = 0): CreatorTemplateKey {
  const normalized = formatFamily.toLowerCase();
  if (normalized.includes("feature")) {
    return "hidden_feature_reveal";
  }
  if (normalized.includes("save") || normalized.includes("time")) {
    return "saves_you_time";
  }
  if (normalized.includes("founder")) {
    return "founder_demo";
  }
  if (normalized.includes("three")) {
    return "three_reasons";
  }
  if (normalized.includes("before")) {
    return "before_after_workflow";
  }
  if (index === 0) {
    return "problem_demo_payoff";
  }
  return creatorTemplatePack[index % creatorTemplatePack.length]!.key;
}

export function createDefaultBrandKit(productName: string): BrandKit {
  const normalizedProductName = cleanText(productName || "Product");
  return {
    id: brandKitIdForProductName(normalizedProductName),
    productName: normalizedProductName,
    primaryColor: "#B8F34A",
    secondaryColor: "#F7F8F3",
    accentColor: "#4F7CFF",
    backgroundColor: "#0B0D0C",
    captionStyle: "kinetic_bold",
    ctaStyle: "soft_try",
    tagline: ""
  };
}

export function normalizeBrandKit(brandKit: Partial<BrandKit> | undefined, productName: string): BrandKit {
  const defaults = createDefaultBrandKit(productName);
  return {
    ...defaults,
    ...brandKit,
    id: cleanOptionalText(brandKit?.id) ?? defaults.id,
    productName: cleanText(brandKit?.productName || productName || defaults.productName).slice(0, 80),
    logoPath: cleanOptionalText(brandKit?.logoPath),
    logoUrl: cleanOptionalText(brandKit?.logoUrl),
    primaryColor: normalizeHexColor(brandKit?.primaryColor, defaults.primaryColor),
    secondaryColor: normalizeHexColor(brandKit?.secondaryColor, defaults.secondaryColor),
    accentColor: normalizeHexColor(brandKit?.accentColor, defaults.accentColor),
    backgroundColor: normalizeHexColor(brandKit?.backgroundColor, defaults.backgroundColor),
    captionStyle: brandKit?.captionStyle ?? defaults.captionStyle,
    ctaStyle: brandKit?.ctaStyle ?? defaults.ctaStyle,
    tagline: cleanOptionalText(brandKit?.tagline)?.slice(0, 96)
  };
}

export function buildVisualBeatsForTemplate(input: {
  moments: DetectedMoment[];
  durationMs: number;
  templateKey: CreatorTemplateKey;
}): VisualBeat[] {
  const template = getCreatorTemplate(input.templateKey);
  const moments = input.moments.length > 0 ? input.moments : [];
  if (moments.length === 0) {
    return [];
  }
  const purposes: NonNullable<VisualBeat["purpose"]>[] =
    template.key === "three_reasons"
      ? ["hook", "proof", "proof", "proof", "cta"]
      : template.key === "saves_you_time"
        ? ["hook", "problem", "demo", "proof", "payoff", "cta"]
        : template.key === "before_after_workflow"
          ? ["hook", "problem", "demo", "payoff", "cta"]
          : template.key === "founder_demo"
            ? ["hook", "problem", "demo", "proof", "payoff", "cta"]
            : ["hook", "problem", "demo", "proof", "payoff"];
  const beatCount = Math.max(purposes.length, Math.min(6, moments.length + 2));
  const beatDuration = Math.max(1200, Math.floor(input.durationMs / beatCount));
  return Array.from({ length: beatCount }, (_unused, index) => {
    const moment = momentForBeat(moments, index, purposes[index] ?? "demo");
    const purpose = purposes[index % purposes.length] ?? "demo";
    const focus = moment.focus ?? focusForBeat(index, input.templateKey);
    return {
      startMs: index * beatDuration,
      endMs: index === beatCount - 1 ? input.durationMs : Math.min((index + 1) * beatDuration, input.durationMs),
      momentId: moment.id,
      sourceStartMs: moment.startMs,
      sourceEndMs: moment.endMs,
      purpose,
      instruction: instructionForPurpose(purpose, moment.label),
      callout: calloutForPurpose(purpose, moment.label),
      focus,
      evidenceIds: moment.sourceEvidenceIds ?? []
    };
  });
}

export function buildEditDecisionList(input: {
  profile: ProductProfile;
  templateKey: CreatorTemplateKey;
  durationMs: number;
  captions: CaptionSegment[];
  visualBeats: VisualBeat[];
  hook: string;
  cta: string;
  moments: DetectedMoment[];
}): EditDecisionList {
  const template = getCreatorTemplate(input.templateKey);
  const brandKit = normalizeBrandKit(input.profile.brandKit, input.profile.productName);
  const durationMs = clamp(Math.round(input.durationMs), 15_000, 60_000);
  const soundDesignEnabled = Boolean(input.profile.soundDesignEnabled);
  const musicMood = input.profile.musicMood ?? "none";
  const sourceSegments = input.visualBeats.map((beat) => {
    const moment = input.moments.find((candidate) => candidate.id === beat.momentId);
    const sourceStartMs = Math.max(0, beat.sourceStartMs ?? moment?.startMs ?? 0);
    const fallbackSourceEndMs = Math.max(moment?.endMs ?? durationMs, sourceStartMs + 1000);
    const sourceEndMs = Math.max(beat.sourceEndMs ?? fallbackSourceEndMs, sourceStartMs + 500);
    return {
      momentId: beat.momentId,
      sourceStartMs,
      sourceEndMs,
      timelineStartMs: beat.startMs,
      timelineEndMs: beat.endMs,
      fit: "contain" as const,
      focus: beat.focus ?? focusForBeat(0, input.templateKey)
    };
  });
  const zooms = input.visualBeats.map((beat, index) => {
    const focus = beat.focus ?? focusForBeat(index, input.templateKey);
    return {
      startMs: beat.startMs,
      endMs: Math.min(beat.endMs, beat.startMs + 1800),
      fromScale: index === 0 ? 1 : 1.03,
      toScale: focus.scale,
      focus,
      easing: template.visualRhythm === "snap" ? "snap" as const : "standard" as const
    };
  });
  const overlays = [
    {
      id: "hook",
      kind: "hook" as const,
      startMs: 0,
      endMs: Math.min(4200, durationMs),
      text: input.hook,
      position: "top" as const,
      emphasis: "primary" as const
    },
    ...input.visualBeats.slice(0, 3).map((beat, index) => ({
      id: `proof-${index + 1}`,
      kind: "proof_label" as const,
      startMs: beat.startMs,
      endMs: Math.min(beat.endMs, beat.startMs + 2600),
      text: beat.callout ?? calloutForPurpose(beat.purpose ?? "demo", momentLabel(input.moments, beat.momentId)),
      position: index % 2 === 0 ? "left" as const : "right" as const,
      emphasis: "accent" as const
    })),
    {
      id: "cta",
      kind: "cta" as const,
      startMs: Math.max(0, durationMs - 5200),
      endMs: durationMs,
      text: input.cta,
      position: template.ctaPosition,
      emphasis: "primary" as const
    }
  ];
  const cursorCues = input.visualBeats.flatMap((beat, index) => {
    const moment = input.moments.find((candidate) => candidate.id === beat.momentId);
    if (!moment?.interactionHint) {
      return [];
    }
    const focus = {
      x: clamp(moment.interactionHint.x, 0, 1),
      y: clamp(moment.interactionHint.y, 0, 1),
      scale: beat.focus?.scale ?? focusForBeat(index, input.templateKey).scale
    };
    return [
      {
        id: `cursor-${index + 1}`,
        kind: moment.interactionHint.kind,
        startMs: Math.min(beat.endMs - 500, beat.startMs + 180),
        endMs: Math.min(beat.endMs, beat.startMs + 1450),
        anchor: focus,
        label: cleanOptionalText(moment.interactionHint.label)?.slice(0, 64),
        confidence: Number(clamp(moment.interactionHint.confidence, 0, 1).toFixed(3))
      }
    ];
  });
  return {
    schemaVersion: "2",
    templateId: templateManifestId(input.templateKey, 1),
    templateKey: input.templateKey,
    templateVersion: 1,
    brandKitId: brandKit.id ?? brandKitIdForProductName(brandKit.productName),
    durationMs,
    canvas: { width: 1080, height: 1920, fps: 30 },
    brandKit,
    sourceSegments,
    zooms,
    captions: input.captions,
    overlays,
    callouts: input.visualBeats.slice(0, 4).map((beat, index) => ({
      id: `callout-${index + 1}`,
      startMs: beat.startMs,
      endMs: Math.min(beat.endMs, beat.startMs + 2600),
      text: beat.callout ?? calloutForPurpose(beat.purpose ?? "demo", momentLabel(input.moments, beat.momentId)),
      anchor: beat.focus ?? focusForBeat(index, input.templateKey),
      evidenceIds: beat.evidenceIds
    })),
    cursorCues,
    sfx: soundDesignEnabled ? buildSfxCues({ zooms, visualBeats: input.visualBeats, durationMs }) : [],
    presenter: {
      enabled: Boolean(input.profile.brandPresenterEnabled) && template.presenterCompatible,
      style: "logo_head",
      startMs: 600,
      endMs: Math.max(600, durationMs - 700),
      position: "lower_right",
      logoPath: brandKit.logoPath,
      logoUrl: brandKit.logoUrl,
      motion: "caption_sync"
    },
    music: {
      enabled: soundDesignEnabled && musicMood !== "none",
      mood: soundDesignEnabled ? musicMood : "none",
      gainDb: -30
    },
    qualityGates: {
      requireEvidenceBackedClaims: true,
      requireCaptionSafeArea: true,
      requireAudioAlignment: true
    }
  };
}

function buildSfxCues(input: {
  zooms: EditDecisionList["zooms"];
  visualBeats: VisualBeat[];
  durationMs: number;
}): EditDecisionList["sfx"] {
  return [
    ...input.zooms.slice(0, 5).map((zoom, index) => ({
      id: `sfx-zoom-${index + 1}`,
      kind: "whoosh" as const,
      startMs: zoom.startMs,
      gainDb: -28
    })),
    ...input.visualBeats.slice(0, 5).map((beat, index) => ({
      id: `sfx-callout-${index + 1}`,
      kind: index === 0 ? "pop" as const : "click" as const,
      startMs: Math.min(beat.endMs - 300, beat.startMs + 550),
      gainDb: -24
    }))
  ]
    .filter((cue) => cue.startMs >= 0 && cue.startMs < input.durationMs)
    .slice(0, 10);
}

export function buildEvidenceClaims(input: {
  moments: DetectedMoment[];
  hook: string;
  cta: string;
  voiceoverText: string;
}): EvidenceClaim[] {
  const enabledMoments = input.moments.filter((moment) => moment.enabled);
  return enabledMoments.slice(0, 4).map((moment) => ({
    text: `Shows ${moment.label.toLowerCase()}.`,
    sourceEvidenceIds: moment.sourceEvidenceIds ?? [],
    momentIds: [moment.id]
  }));
}

export function scriptQualityWarnings(input: {
  hook: string;
  voiceoverText: string;
  captions: CaptionSegment[];
  evidenceClaims: EvidenceClaim[];
}): ScriptQualityWarning[] {
  const warnings: ScriptQualityWarning[] = [];
  if (input.evidenceClaims.length === 0) {
    warnings.push({
      code: "missing_evidence",
      message: "This script needs at least one visible proof moment before render."
    });
  }
  for (const caption of input.captions) {
    if (caption.text.length > 72) {
      warnings.push({
        code: "caption_overflow_risk",
        message: "One caption segment is long enough to risk safe-area overflow."
      });
      break;
    }
  }
  if (input.hook.split(/\s+/).length > 16) {
    warnings.push({
      code: "long_line",
      message: "The hook should be shorter so the first two seconds land clearly."
    });
  }
  return warnings;
}

export function hasBlockingScriptWarnings(warnings: ScriptQualityWarning[] | undefined): boolean {
  return (warnings ?? []).some((warning) =>
    warning.code === "unsupported_claim" ||
    warning.code === "missing_evidence" ||
    warning.code === "caption_overflow_risk"
  );
}

export function templateLabel(key: CreatorTemplateKey): string {
  return getCreatorTemplate(key).name;
}

export function templateOptionsForPlatform(_platforms: Platform[]): CreatorTemplateDefinition[] {
  return creatorTemplatePack;
}

function instructionForPurpose(purpose: NonNullable<VisualBeat["purpose"]>, label: string): string {
  if (purpose === "problem") {
    return `Show the before-state around ${label.toLowerCase()} with the slow part obvious.`;
  }
  if (purpose === "payoff") {
    return `Punch in on ${label.toLowerCase()} as the result becomes visible.`;
  }
  if (purpose === "proof") {
    return `Hold on ${label.toLowerCase()} long enough for the proof to read.`;
  }
  if (purpose === "cta") {
    return `Return to ${label.toLowerCase()} and make the next action clear.`;
  }
  return `Show ${label.toLowerCase()} with readable framing.`;
}

function momentForBeat(
  moments: DetectedMoment[],
  index: number,
  purpose: NonNullable<VisualBeat["purpose"]>
): DetectedMoment {
  const byRole = moments.find((moment) => {
    if (purpose === "problem") {
      return moment.visualRole === "before";
    }
    if (purpose === "payoff" || purpose === "cta") {
      return moment.visualRole === "payoff";
    }
    if (purpose === "proof") {
      return moment.visualRole === "proof" || (moment.proofScore ?? 0) >= 0.75;
    }
    if (purpose === "demo") {
      return moment.visualRole === "action";
    }
    return false;
  });
  return byRole ?? moments[index % moments.length]!;
}

function calloutForPurpose(purpose: NonNullable<VisualBeat["purpose"]>, label: string): string {
  const clean = label.replace(/\s+/g, " ").trim();
  if (purpose === "problem") {
    return `Before: ${clean}`;
  }
  if (purpose === "payoff") {
    return `Payoff: ${clean}`;
  }
  if (purpose === "proof") {
    return `Proof: ${clean}`;
  }
  if (purpose === "hook") {
    return `Watch: ${clean}`;
  }
  return clean;
}

function focusForBeat(index: number, templateKey: CreatorTemplateKey): RenderFocusPoint {
  const scaleBase =
    templateKey === "hidden_feature_reveal" || templateKey === "brand_presenter" || templateKey === "saves_you_time"
      ? 1.18
      : 1.12;
  const focusPoints: RenderFocusPoint[] = [
    { x: 0.5, y: 0.42, scale: scaleBase },
    { x: 0.58, y: 0.5, scale: scaleBase + 0.06 },
    { x: 0.42, y: 0.56, scale: scaleBase + 0.03 },
    { x: 0.5, y: 0.48, scale: scaleBase + 0.1 }
  ];
  return focusPoints[index % focusPoints.length]!;
}

function momentLabel(moments: DetectedMoment[], momentId: string): string {
  return moments.find((moment) => moment.id === momentId)?.label ?? "product proof";
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const clean = value?.trim();
  if (!clean) {
    return fallback;
  }
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean.toUpperCase() : fallback;
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean || undefined;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function templateManifestId(templateKey: CreatorTemplateKey, templateVersion: number): string {
  return `creator-template:${templateKey}:v${templateVersion}`;
}

export function brandKitIdForProductName(productName: string): string {
  const slug = cleanText(productName || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `brand-kit:${slug || "product"}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
