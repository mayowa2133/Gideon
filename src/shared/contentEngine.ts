import type {
  CaptionSegment,
  ContentConcept,
  CreatorTemplateKey,
  DetectedMoment,
  Platform,
  ProductProfile,
  RecordingMetadata,
  ScriptDraft
} from "./types";
import {
  buildEditDecisionList,
  buildEvidenceClaims,
  buildVisualBeatsForTemplate,
  createDefaultBrandKit,
  getCreatorTemplate,
  scriptQualityWarnings,
  templateForFormatFamily
} from "./renderTemplates";

const forbiddenPhrases = [
  "revolutionary platform",
  "seamlessly streamline",
  "unlock your potential",
  "game-changing solution",
  "powerful tool designed to"
];

const formatTemplates = [
  {
    family: "problem-solution",
    templateKey: "problem_demo_payoff",
    title: "Stop losing time to the old workflow",
    pain: "manual work that slows down the target customer",
    hook: "Show the painful before-state, then the faster path",
    duration: 28
  },
  {
    family: "before-after",
    templateKey: "before_after_workflow",
    title: "Before and after using the product",
    pain: "the contrast between scattered work and a clean outcome",
    hook: "Open with the messy baseline, then show the improved result",
    duration: 32
  },
  {
    family: "founder-demo",
    templateKey: "founder_demo",
    title: "I built this because the existing way was too slow",
    pain: "a founder-facing frustration that triggered the build",
    hook: "Use a plain founder voice and show the core workflow quickly",
    duration: 36
  },
  {
    family: "time-saver",
    templateKey: "saves_you_time",
    title: "This saves you from the slow part",
    pain: "time lost to repetitive manual steps",
    hook: "Open with the repeated task, then show the time-saving product path",
    duration: 26
  },
  {
    family: "feature-highlight",
    templateKey: "hidden_feature_reveal",
    title: "The one feature worth seeing first",
    pain: "unclear value from a key feature until the proof appears",
    hook: "Start at the payoff, then rewind into how it works",
    duration: 24
  },
  {
    family: "how-it-works",
    templateKey: "problem_demo_payoff",
    title: "How the workflow works in under a minute",
    pain: "uncertainty about what the product actually does",
    hook: "Walk through three visible steps with concrete labels",
    duration: 42
  },
  {
    family: "launch-announcement",
    templateKey: "brand_presenter",
    title: "Launch week demo for people who need the outcome",
    pain: "the audience has the problem but has not tried the product",
    hook: "Announce the product through a specific use case, not hype",
    duration: 30
  },
  {
    family: "tutorial",
    templateKey: "problem_demo_payoff",
    title: "Do this workflow once, then repeat it",
    pain: "users need a practical first action",
    hook: "Teach one narrow workflow and show the resulting state",
    duration: 45
  },
  {
    family: "three-reasons",
    templateKey: "three_reasons",
    title: "Three reasons this workflow matters",
    pain: "the audience needs quick reasons to care",
    hook: "Stack three concrete benefits tied to visible moments",
    duration: 38
  },
  {
    family: "linkedin-professional",
    templateKey: "founder_demo",
    title: "A practical workflow breakdown for LinkedIn",
    pain: "buyers need a credible explanation before trying a new tool",
    hook: "Use a calm proof-first walkthrough with a work outcome",
    duration: 44
  }
];

export function createDefaultProfile(): ProductProfile {
  const productName = "";
  return {
    productName,
    targetCustomer: "",
    productDescription: "",
    preferredTone: "direct",
    toneGuidance: "",
    platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
    walkthroughNotes: "",
    defaultTemplateKey: "problem_demo_payoff",
    brandPresenterEnabled: false,
    avatarPresenterId: "logo_head",
    brandPresenterPosition: "lower_right",
    brandPresenterMotion: "caption_sync",
    soundDesignEnabled: false,
    musicMood: "none",
    creatorPacePreset: "energetic",
    pronunciationDictionary: {},
    brandKit: createDefaultBrandKit(productName)
  };
}

export function validateProfile(profile: ProductProfile): string[] {
  const errors: string[] = [];
  if (profile.productName.trim().length < 1 || profile.productName.trim().length > 80) {
    errors.push("Product name must be 1–80 characters.");
  }
  if (profile.targetCustomer.trim().length < 3 || profile.targetCustomer.trim().length > 300) {
    errors.push("Target customer must be 3–300 characters.");
  }
  if (
    profile.productDescription.trim().length < 10 ||
    profile.productDescription.trim().length > 600
  ) {
    errors.push("Product description must be 10–600 characters.");
  }
  if ((profile.toneGuidance ?? "").length > 300) {
    errors.push("Tone guidance must be 300 characters or fewer.");
  }
  if (!profile.platforms?.length) {
    errors.push("Choose at least one platform.");
  }
  return errors;
}

export function createMoments(
  profile: ProductProfile,
  recording: RecordingMetadata,
  ids: () => string
): DetectedMoment[] {
  const duration = Math.max(recording.durationMs, 15_000);
  const usableEnd = Math.max(duration - 1_000, 8_000);
  const segmentCount = duration >= 60_000 ? 5 : 4;
  const segmentSize = usableEnd / segmentCount;
  const product = cleanPhrase(profile.productName || "the product");
  const outcome = shortSentence(profile.productDescription || "the product workflow");
  const labels = [
    `${product} setup or starting point`,
    "Core action in the walkthrough",
    "Product response or generated result",
    "Success state and next step",
    "Best proof moment for the audience"
  ];

  return Array.from({ length: segmentCount }, (_, index) => {
    const startMs = Math.round(index * segmentSize);
    const endMs = Math.min(Math.round(startMs + segmentSize * 0.82), duration);
    const label = labels[index] ?? `Moment ${index + 1}`;
    return {
      id: ids(),
      label,
      startMs,
      endMs,
      evidence: evidenceForMoment(index, product, outcome, recording),
      confidence: Number((0.68 + Math.min(index, 3) * 0.05).toFixed(2)),
      proofScore: Number((0.58 + Math.min(index, 4) * 0.08).toFixed(2)),
      visualRole: index === 0 ? "before" : index === segmentCount - 1 ? "payoff" : index === 2 ? "proof" : "action",
      focus: {
        x: index % 2 === 0 ? 0.48 : 0.56,
        y: index < 2 ? 0.42 : 0.54,
        scale: 1.12 + Math.min(index, 3) * 0.04
      },
      enabled: true
    };
  });
}

export function generateConcepts(
  profile: ProductProfile,
  moments: DetectedMoment[],
  ids: () => string
): ContentConcept[] {
  const enabledMoments = rankMomentsForProof(moments.filter((moment) => moment.enabled));
  const proofMoments = enabledMoments.length > 0 ? enabledMoments : moments;
  const product = cleanPhrase(profile.productName || "your product");
  const customer = cleanPhrase(profile.targetCustomer || "your target customer");
  const outcome = shortSentence(profile.productDescription || "the workflow shown in the recording");
  const platforms: Platform[] = profile.platforms.length > 0 ? profile.platforms : ["tiktok"];

  return formatTemplates.map((template, index) => {
    const primary = proofMoments[index % Math.max(proofMoments.length, 1)];
    const secondary = proofMoments[(index + 1) % Math.max(proofMoments.length, 1)];
    const proofMomentIds = [primary, secondary]
      .filter((moment): moment is DetectedMoment => Boolean(moment))
      .map((moment) => moment.id);
    const platformFit = choosePlatforms(platforms, template.family);
    const templateKey = profile.defaultTemplateKey && index === 0
      ? profile.defaultTemplateKey
      : (template.templateKey as CreatorTemplateKey) ?? templateForFormatFamily(template.family, index);
    const templateDefinition = getCreatorTemplate(templateKey);

    return {
      id: ids(),
      title: personalizeTitle(template.title, product, index),
      formatFamily: template.family,
      templateKey,
      targetPain: `${customer} dealing with ${template.pain}`,
      hookDirection: `${templateDefinition.hookPattern
        .replace("{product}", product)
        .replace("{customer}", customer)} Keep it grounded in ${primary?.label ?? "the recording"}.`,
      proofMomentIds,
      platformFit,
      estimatedDurationSec: template.duration,
      rationale: `${product} can be explained through "${primary?.label ?? "the uploaded walkthrough"}" because it visibly supports ${outcome}.`,
      selected: index < 3,
      brief: `Use ${primary?.label ?? "the strongest visible moment"} to show ${customer} how ${product} helps with ${outcome}.`
    };
  });
}

export function enforceSelectionLimit(concepts: ContentConcept[], changedId: string): ContentConcept[] {
  const selected = concepts.filter((concept) => concept.selected);
  if (selected.length <= 3) {
    return concepts;
  }
  const selectedToKeep = new Set<string>();
  selected
    .filter((concept) => concept.id === changedId)
    .slice(0, 1)
    .forEach((concept) => selectedToKeep.add(concept.id));
  selected
    .filter((concept) => concept.id !== changedId)
    .slice(0, 2)
    .forEach((concept) => selectedToKeep.add(concept.id));
  return concepts.map((concept) => ({
    ...concept,
    selected: concept.selected ? selectedToKeep.has(concept.id) : false
  }));
}

export function generateScripts(
  profile: ProductProfile,
  concepts: ContentConcept[],
  moments: DetectedMoment[],
  ids: () => string,
  now: () => string
): ScriptDraft[] {
  const selected = concepts.filter((concept) => concept.selected).slice(0, 3);
  return selected.map((concept) => generateScriptDraft(profile, concept, moments, ids, now));
}

export function sanitizeMarketingCopy(text: string): string {
  let sanitized = text.replace(/\s+/g, " ").trim();
  for (const phrase of forbiddenPhrases) {
    const pattern = new RegExp(escapeRegExp(phrase), "gi");
    sanitized = sanitized.replace(pattern, "specific workflow");
  }
  return sanitized;
}

export function splitCaptionSegments(text: string, durationMs: number): CaptionSegment[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const chunkSize = 7;
  const chunks: string[][] = [];
  for (let index = 0; index < words.length; index += chunkSize) {
    chunks.push(words.slice(index, index + chunkSize));
  }
  const segmentDuration = Math.max(1_500, Math.floor(durationMs / chunks.length));
  return chunks.map((chunkWords, index) => {
    const startMs = index * segmentDuration;
    const endMs = index === chunks.length - 1 ? durationMs : Math.min((index + 1) * segmentDuration, durationMs);
    const wordDuration = Math.max(1, Math.floor((endMs - startMs) / chunkWords.length));
    return {
      startMs,
      endMs,
      text: chunkWords.join(" "),
      words: chunkWords.map((word, wordIndex) => ({
        startMs: startMs + wordIndex * wordDuration,
        endMs: wordIndex === chunkWords.length - 1 ? endMs : Math.min(startMs + (wordIndex + 1) * wordDuration, endMs),
        text: word
      }))
    };
  });
}

export function estimateScriptDurationMs(script: Pick<ScriptDraft, "voiceoverText">): number {
  const wordCount = script.voiceoverText.split(/\s+/).filter(Boolean).length;
  const spokenMs = Math.round((wordCount / 2.45) * 1_000);
  return clamp(spokenMs + 2_500, 15_000, 60_000);
}

export function generateScriptDraft(
  profile: ProductProfile,
  concept: ContentConcept,
  moments: DetectedMoment[],
  ids: () => string,
  now: () => string
): ScriptDraft {
  const product = cleanPhrase(profile.productName || "this product");
  const customer = cleanPhrase(profile.targetCustomer || "the team");
  const outcome = shortSentence(profile.productDescription || "the workflow in the demo");
  const templateKey = concept.templateKey ?? templateForFormatFamily(concept.formatFamily);
  const template = getCreatorTemplate(templateKey);
  const selectedMoments = concept.proofMomentIds
    .map((id) => moments.find((moment) => moment.id === id))
    .filter((moment): moment is DetectedMoment => Boolean(moment));
  const primaryMoment = selectedMoments[0] ?? moments[0];
  const secondaryMoment = selectedMoments[1] ?? moments[1] ?? primaryMoment;
  const hook = sanitizeMarketingCopy(
    template.hookPattern
      .replace("{product}", product)
      .replace("{customer}", customer)
      .replace(/\.$/, "")
  );
  const bodyLines = creatorVoiceoverLines({
    customer,
    outcome,
    primaryLabel: primaryMoment?.label,
    secondaryLabel: secondaryMoment?.label,
    templateKey,
    tone: profile.preferredTone
  });
  const body = sanitizeMarketingCopy(bodyLines.join(" "));
  const voiceoverText = `${hook}. ${body}`;
  const durationMs = estimateScriptDurationMs({ voiceoverText });
  const visualBeats = buildVisualBeatsForTemplate({
    moments: selectedMoments,
    durationMs,
    templateKey
  });
  const captions = splitCaptionSegments(voiceoverText, durationMs);
  const evidenceClaims = buildEvidenceClaims({
    moments: selectedMoments,
    hook,
    cta: `Try ${product} with one workflow from your own team.`,
    voiceoverText
  });
  const qualityWarnings = scriptQualityWarnings({ hook, voiceoverText, captions, evidenceClaims });
  const cta = `Try ${product} with one workflow from your own team.`;

  return {
    id: ids(),
    conceptId: concept.id,
    templateKey,
    hook,
    voiceoverText,
    captions,
    cta,
    visualBeats,
    editDecisionList: buildEditDecisionList({
      profile,
      templateKey,
      durationMs,
      captions,
      visualBeats,
      hook,
      cta,
      moments: selectedMoments
    }),
    evidenceClaims,
    qualityWarnings,
    approved: false,
    updatedAt: now()
  };
}

function creatorVoiceoverLines(input: {
  customer: string;
  outcome: string;
  primaryLabel: string | undefined;
  secondaryLabel: string | undefined;
  templateKey: CreatorTemplateKey;
  tone: ProductProfile["preferredTone"];
}): string[] {
  const primary = input.primaryLabel?.toLowerCase() ?? "the first proof moment";
  const secondary = input.secondaryLabel?.toLowerCase() ?? "the result";
  const toneOpening = creatorToneOpening(input.tone, input.customer, primary);
  if (input.templateKey === "three_reasons") {
    return [
      toneOpening,
      `Reason two: ${secondary} makes the outcome visible.`,
      `Reason three: ${input.customer} can repeat it without a long demo.`,
      `That matters because ${input.outcome}.`
    ];
  }
  if (input.templateKey === "saves_you_time") {
    return [
      toneOpening,
      `Now watch ${primary} take over that part.`,
      `${secondary} shows the saved time turning into a visible result.`,
      `That matters because ${input.outcome}.`
    ];
  }
  if (input.templateKey === "before_after_workflow") {
    return [
      toneOpening,
      `Then ${primary} shows the product taking over.`,
      `After that, ${secondary} proves the result.`,
      `That matters because ${input.outcome}.`
    ];
  }
  if (input.templateKey === "founder_demo") {
    return [
      toneOpening,
      `So the first screen to watch is ${primary}.`,
      `Then ${secondary} shows the part that saves the time.`,
      `That matters because ${input.outcome}.`
    ];
  }
  if (input.templateKey === "hidden_feature_reveal") {
    return [
      toneOpening,
      `This is the part most viewers miss.`,
      `Then ${secondary} makes the benefit obvious.`,
      `That matters because ${input.outcome}.`
    ];
  }
  return [
    toneOpening,
    `First, watch ${primary}.`,
    `Then it moves into ${secondary}, so the proof is on screen.`,
    `That matters because ${input.outcome}.`
  ];
}

function creatorToneOpening(tone: ProductProfile["preferredTone"], customer: string, primary: string): string {
  if (tone === "casual") return `Okay, watch ${primary} for a second.`;
  if (tone === "founder") return `I built this so ${customer} do not manage the slow part manually.`;
  if (tone === "educational") return `Here is what ${primary} changes in the workflow.`;
  if (tone === "bold") return `Stop doing the slow part by hand. Watch ${primary}.`;
  if (tone === "professional") return `For ${customer}, ${primary} makes the workflow more repeatable.`;
  return `If you are ${customer}, this is the part that matters.`;
}

function choosePlatforms(platforms: Platform[], family: string): Platform[] {
  if (family === "linkedin-professional") {
    return platforms.includes("linkedin") ? ["linkedin"] : ["linkedin", ...platforms.slice(0, 1)];
  }
  if (family === "tutorial" || family === "how-it-works") {
    return platforms.filter((platform) => platform !== "other").slice(0, 3);
  }
  return platforms.slice(0, 3);
}

function rankMomentsForProof(moments: DetectedMoment[]): DetectedMoment[] {
  return [...moments].sort((left, right) => {
    const scoreDelta = (right.proofScore ?? right.confidence) - (left.proofScore ?? left.confidence);
    if (Math.abs(scoreDelta) > 0.001) {
      return scoreDelta;
    }
    return left.startMs - right.startMs;
  });
}

function personalizeTitle(title: string, product: string, index: number): string {
  if (index === 0) {
    return `${product}: ${title}`;
  }
  return title.replace("the product", product).replace("this workflow", `${product} workflow`);
}

function evidenceForMoment(
  index: number,
  product: string,
  outcome: string,
  recording: RecordingMetadata
): string {
  const duration = `${Math.round(recording.durationMs / 1000)}s`;
  const base = [
    `Detected from the uploaded ${duration} recording metadata and representative timeline position.`,
    `${product} context: ${outcome}.`
  ];
  if (index === 0) {
    base.push("This opening section usually establishes the starting state.");
  } else if (index === 1) {
    base.push("This section is positioned where the main action typically appears.");
  } else if (index === 2) {
    base.push("This section is useful for showing product response or output.");
  } else {
    base.push("This later section is useful for a result, CTA, or success state.");
  }
  return base.join(" ");
}

function cleanPhrase(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shortSentence(text: string): string {
  const clean = cleanPhrase(text);
  if (clean.length <= 150) {
    return clean;
  }
  return `${clean.slice(0, 147).trim()}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
