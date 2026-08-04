// Single source of truth for every V11 text surface. The VO script, TTS beats,
// caption chips, serif headlines, and numeral anchors all compile from this one
// beat list, so the five-way authoring drift that produced V10's caption/VO
// mismatches is impossible by construction.

export interface V11CompiledCaption {
  id: string;
  from: number;
  to: number;
  text: string;
  beatText: string;
  role: "spoken" | "editorial_peak" | "product_annotation" | "cta";
  highlight?: string;
  zone: "top" | "bottom" | "attached";
}
export interface V11BeatHeadline { primary: string; accentItalic: string }
export interface V11NumeralAnchor { graphic: string; spokenToken: string; sceneId: string }
export interface V11Beat {
  id: string;
  sceneId: string;
  vo: string;
  energy: "high" | "medium";
  chip?: Omit<V11CompiledCaption, "id" | "text">;
  headline?: V11BeatHeadline;
  anchors?: V11NumeralAnchor[];
}

export const SOLOMON_CREATOR_STORY_V11_BEATS: readonly V11Beat[] = [
  {
    id: "hook",
    sceneId: "hook",
    vo: "Your job search just changed — Solomon found the person who helps you next.",
    energy: "high",
    chip: { from: 0, to: 102, beatText: "SOLOMON FOUND THE PERSON", role: "spoken", highlight: "PERSON", zone: "top" },
    headline: { primary: "YOUR JOB SEARCH", accentItalic: "JUST CHANGED." },
  },
  {
    id: "reasons",
    sceneId: "reasons",
    vo: "",
    energy: "medium",
    chip: { from: 102, to: 132, beatText: "WHY AVERY?", role: "product_annotation", zone: "attached" },
  },
  {
    id: "friction",
    sceneId: "friction",
    vo: "Normally you'd rebuild the same context five times:",
    energy: "medium",
    chip: { from: 132, to: 162, beatText: "LOSES CONTEXT", role: "editorial_peak", highlight: "LOSES", zone: "top" },
    headline: { primary: "THE OLD WAY", accentItalic: "SCATTERS THE STORY." },
  },
  {
    id: "five",
    sceneId: "five",
    vo: "the job post, profile, notes, contacts, and a blank email.",
    energy: "medium",
    chip: { from: 162, to: 235, beatText: "5× BY HAND", role: "editorial_peak", highlight: "5×", zone: "top" },
    headline: { primary: "THE SAME CONTEXT", accentItalic: "COPIED BY HAND." },
    anchors: [{ graphic: "5×", spokenToken: "five", sceneId: "five" }],
  },
  {
    id: "collapse",
    sceneId: "collapse",
    vo: "",
    energy: "medium",
    headline: { primary: "ONE OPPORTUNITY.", accentItalic: "" },
  },
  {
    id: "role",
    sceneId: "role",
    vo: "Solomon keeps the role, company, person, and supporting evidence connected.",
    energy: "medium",
  },
  {
    id: "reason",
    sceneId: "reason",
    vo: "It shows why Avery is relevant before you write a word.",
    energy: "medium",
  },
  {
    id: "signature",
    sceneId: "signature",
    vo: "Watch the opportunity reveal the contact, the evidence follow, and that context become a grounded message with a clear ask.",
    energy: "high",
    chip: { from: 420, to: 585, beatText: "JOB → PERSON → PROOF → MESSAGE", role: "editorial_peak", highlight: "MESSAGE", zone: "top" },
    headline: { primary: "CONTEXT MOVES", accentItalic: "WITH THE STORY." },
  },
  {
    id: "grounded",
    sceneId: "grounded",
    vo: "Not a generic opener, but language tied to the real role and why you are reaching out.",
    energy: "medium",
    chip: { from: 660, to: 720, beatText: "GENERIC → GROUNDED", role: "editorial_peak", highlight: "GROUNDED", zone: "top" },
  },
  {
    id: "control",
    sceneId: "control",
    vo: "Solomon drafts it. You edit it. Nothing sends without you.",
    energy: "high",
    chip: { from: 735, to: 815, beatText: "NOTHING SENDS WITHOUT YOU", role: "product_annotation", highlight: "WITHOUT YOU", zone: "attached" },
  },
  {
    id: "payoff",
    sceneId: "payoff",
    vo: "One scattered search becomes one connected next step.",
    energy: "high",
    chip: { from: 855, to: 930, beatText: "ONE CONNECTED NEXT STEP", role: "editorial_peak", highlight: "ONE", zone: "top" },
    headline: { primary: "ONE CONNECTED", accentItalic: "NEXT STEP." },
  },
  {
    id: "result",
    sceneId: "result",
    vo: "",
    energy: "medium",
    headline: { primary: "ONE CONNECTED", accentItalic: "NEXT STEP." },
  },
  {
    id: "cta",
    sceneId: "cta",
    vo: "Comment SOLOMON and I'll send you the demo.",
    energy: "high",
    chip: { from: 960, to: 1056, beatText: "COMMENT SOLOMON", role: "cta", highlight: "SOLOMON", zone: "bottom" },
    headline: { primary: "COMMENT SOLOMON", accentItalic: "AND I'LL SEND THE DEMO." },
  },
  {
    id: "sting",
    sceneId: "sting",
    vo: "",
    energy: "medium",
    headline: { primary: "SOLOMON.", accentItalic: "" },
  },
];

export interface CompiledSolomonCreatorStoryV11 {
  script: string;
  hook: string;
  ctaSpoken: string;
  ctaDisplay: string;
  ctaKeyword: string;
  narrationBySceneId: Record<string, string>;
  captions: V11CompiledCaption[];
  headlines: Record<string, V11BeatHeadline>;
  ttsBeats: Array<{ id: string; sceneId: string; text: string; energy: "high" | "medium" }>;
  numeralAnchors: V11NumeralAnchor[];
}

export function compileSolomonCreatorStoryV11(): CompiledSolomonCreatorStoryV11 {
  const beats = SOLOMON_CREATOR_STORY_V11_BEATS;
  const spoken = beats.filter((beat) => beat.vo.length > 0);
  const script = spoken.map((beat) => beat.vo).join(" ");
  const narrationBySceneId: Record<string, string> = {};
  for (const beat of spoken) narrationBySceneId[beat.sceneId] = beat.vo;
  const captions = beats
    .filter((beat) => beat.chip)
    .map((beat) => ({ id: beat.id, text: beat.chip!.beatText, ...beat.chip! }));
  const headlines: Record<string, V11BeatHeadline> = {};
  for (const beat of beats) if (beat.headline) headlines[beat.sceneId] = beat.headline;
  return {
    script,
    hook: beats[0]!.vo,
    ctaSpoken: beats.find(({ id }) => id === "cta")!.vo,
    ctaDisplay: "COMMENT SOLOMON FOR THE DEMO",
    ctaKeyword: "SOLOMON",
    narrationBySceneId,
    captions,
    headlines,
    ttsBeats: spoken.map(({ id, sceneId, vo, energy }) => ({ id, sceneId, text: vo, energy })),
    numeralAnchors: beats.flatMap((beat) => beat.anchors ?? []),
  };
}
