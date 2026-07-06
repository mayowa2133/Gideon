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
  return {
    productName: cleanText(productName || "Product"),
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
      ? ["proof", "proof", "proof"]
      : template.key === "before_after_workflow"
        ? ["problem", "payoff", "proof"]
        : ["hook", "demo", "payoff"];
  const beatDuration = Math.max(1800, Math.floor(input.durationMs / moments.length));
  return moments.map((moment, index) => {
    const purpose = purposes[index % purposes.length] ?? "demo";
    const focus = moment.focus ?? focusForBeat(index, input.templateKey);
    return {
      startMs: index * beatDuration,
      endMs: index === moments.length - 1 ? input.durationMs : Math.min((index + 1) * beatDuration, input.durationMs),
      momentId: moment.id,
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
  const sourceSegments = input.visualBeats.map((beat) => {
    const moment = input.moments.find((candidate) => candidate.id === beat.momentId);
    return {
      momentId: beat.momentId,
      sourceStartMs: Math.max(0, moment?.startMs ?? 0),
      sourceEndMs: Math.max(moment?.endMs ?? durationMs, (moment?.startMs ?? 0) + 1000),
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
  return {
    schemaVersion: "2",
    templateKey: input.templateKey,
    templateVersion: 1,
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
      enabled: false,
      mood: "none",
      gainDb: -18
    },
    qualityGates: {
      requireEvidenceBackedClaims: true,
      requireCaptionSafeArea: true,
      requireAudioAlignment: true
    }
  };
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
  const scaleBase = templateKey === "hidden_feature_reveal" || templateKey === "brand_presenter" ? 1.18 : 1.12;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
