// Single source of truth for every V22 text surface. The VO script, TTS beats,
// caption chips, serif headlines, and numeral anchors all compile from this one
// beat list, so the five-way authoring drift that produced V10's caption/VO
// mismatches is impossible by construction.

export interface V22CompiledCaption {
  id: string;
  from: number;
  to: number;
  text: string;
  beatText: string;
  role: "spoken" | "editorial_peak" | "product_annotation" | "cta";
  highlight?: string;
  zone: "top" | "bottom" | "attached";
  /** 1-2 word groups that swap inside the caption window, reference-style. */
  wordGroups: V22WordGroup[];
  /**
   * True when the word groups are the beat's spoken line, false when they are the
   * chip's own label text (annotation chips like "WHY AVERY?" are never said).
   * Only speech-tracking captions can be aligned to, or audited against, the
   * narration — auditing a label against speech finds a spurious match on some
   * unrelated later occurrence of the same word.
   */
  tracksSpeech: boolean;
}
export interface V22WordGroup { text: string; from: number; to: number; emphasis: boolean }
export interface V22BeatHeadline { primary: string; accentItalic: string }
export interface V22NumeralAnchor { graphic: string; spokenToken: string; sceneId: string }
export interface V22Beat {
  id: string;
  sceneId: string;
  vo: string;
  energy: "high" | "medium";
  chip?: Omit<V22CompiledCaption, "id" | "text" | "wordGroups" | "tracksSpeech">;
  headline?: V22BeatHeadline;
  anchors?: V22NumeralAnchor[];
}

export const SOLOMON_CREATOR_STORY_V22_BEATS: readonly V22Beat[] = [
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
    chip: { from: 311, to: 379, beatText: "ROLE AND COMPANY", role: "spoken", highlight: "COMPANY", zone: "top" },
  },
  {
    id: "reason",
    sceneId: "reason",
    vo: "It shows why Avery is relevant before you write a word.",
    energy: "medium",
    chip: { from: 379, to: 449, beatText: "WHY AVERY MATCHES", role: "spoken", highlight: "WHY", zone: "top" },
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
    // The chip is back. It was dropped in V16 because the serif headline already
    // read "COMMENT SOLOMON" and the two printed the same words twice -- and the
    // headlines are now gone, so without this the call to action is spoken with
    // nothing on screen tracking it.
    chip: { from: 1027, to: 1120, beatText: "COMMENT SOLOMON", role: "cta", highlight: "SOLOMON", zone: "top" },
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

export interface CompiledSolomonCreatorStoryV22 {
  script: string;
  hook: string;
  ctaSpoken: string;
  ctaDisplay: string;
  ctaKeyword: string;
  narrationBySceneId: Record<string, string>;
  captions: V22CompiledCaption[];
  headlines: Record<string, V22BeatHeadline>;
  ttsBeats: Array<{ id: string; sceneId: string; text: string; energy: "high" | "medium" }>;
  numeralAnchors: V22NumeralAnchor[];
}


// Reference creator videos keep 1-3 words on screen at a time and swap them every
// ~0.3-0.5s; that constant type churn is what produces their high median frame
// change (5.7-7.6) while still leaving the picture calm between swaps. Gideon had
// been holding one static chip for the whole window - up to 3.4 seconds - which
// reads as a label rather than as kinetic typography.
//
// Groups are built from the beat's spoken line where there is one, so the words on
// screen are the words being said; chips without narration fall back to their own
// text. Length is weighted by character count so long words hold longer.
const MIN_GROUP_FRAMES = 9;

export function buildWordGroups(source: string, from: number, to: number, highlight?: string): V22WordGroup[] {
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const span = Math.max(1, to - from);
  // How many groups the window can hold at the minimum readable dwell. A tight
  // window widens the groups rather than starving them: three words held for
  // 9 frames reads, whereas nine groups crammed into 60 frames do not.
  const maxGroups = Math.max(1, Math.floor(span / MIN_GROUP_FRAMES));
  const perGroup = Math.max(1, Math.min(3, Math.ceil(words.length / maxGroups)));
  const groups: string[][] = [];
  for (let index = 0; index < words.length; index += perGroup) groups.push(words.slice(index, index + perGroup));
  // Cumulative proportional boundaries keep every group inside [from,to] and
  // monotonic, so no group can collapse to zero frames however tight the window.
  const weights = groups.map((group) => group.join(" ").length);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let cumulative = 0;
  const edges = weights.map((weight) => { cumulative += weight; return from + Math.round(span * (cumulative / total)); });
  return groups.map((group, index) => {
    const groupFrom = index === 0 ? from : Math.max(edges[index - 1]!, from + index);
    const groupTo = index === groups.length - 1 ? to : Math.max(edges[index]!, groupFrom + 1);
    const text = group.join(" ");
    return { text, from: groupFrom, to: Math.min(to, groupTo), emphasis: Boolean(highlight && text.toLowerCase().includes(highlight.toLowerCase())) };
  });
}

export function compileSolomonCreatorStoryV22(): CompiledSolomonCreatorStoryV22 {
  const beats = SOLOMON_CREATOR_STORY_V22_BEATS;
  const spoken = beats.filter((beat) => beat.vo.length > 0);
  const script = spoken.map((beat) => beat.vo).join(" ");
  const narrationBySceneId: Record<string, string> = {};
  for (const beat of spoken) narrationBySceneId[beat.sceneId] = beat.vo;
  const captions = beats
    .filter((beat) => beat.chip)
    .map((beat) => {
      const chip = beat.chip!;
      const source = beat.vo.length > 0 ? beat.vo : chip.beatText;
      return { id: beat.id, text: chip.beatText, ...chip, tracksSpeech: beat.vo.length > 0, wordGroups: buildWordGroups(source, chip.from, chip.to, chip.highlight) };
    });
  const headlines: Record<string, V22BeatHeadline> = {};
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
