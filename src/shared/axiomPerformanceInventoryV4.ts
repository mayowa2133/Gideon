export type AxiomV4PerformanceId =
  | "neutral_listening"
  | "two_hand_explanation"
  | "pointing_left"
  | "pointing_right"
  | "strong_emphasis"
  | "open_cta"
  | "reaction"
  | "calm_product_explanation";

export interface AxiomV4PerformanceInventoryEntry {
  id: AxiomV4PerformanceId;
  sourceStartMs: number;
  sourceEndMs: number;
  gesturePeakSourceMs: number;
  entranceMs: number;
  gestureMs: number;
  holdMs: number;
  cooldownMs: number;
  handPosition: "down" | "both_open" | "left_extended" | "right_extended" | "single_high" | "both_high" | "reaction_rise";
  shoulderPosition: "neutral" | "open" | "left_lead" | "right_lead" | "raised";
  bodyLean: "center";
  direction: "none" | "left" | "right" | "forward";
  silhouetteClass: string;
  energy: "low" | "medium" | "high";
  suitableFraming: Array<"intimate_closeup" | "chest_up" | "waist_up">;
  safeFaceRegion: { x: number; y: number; width: number; height: number };
  safeHandRegion: { x: number; y: number; width: number; height: number };
  safeCaptionRegions: Array<"top_left" | "top_right" | "lower_left" | "lower_right">;
  safeProductRegions: Array<"left" | "right" | "upper">;
  loopRisk: "low";
  visualQualityScore: number;
  assetLimitation?: string;
}

const FACE = { x: 0.27, y: 0.04, width: 0.46, height: 0.24 };
const HANDS = { x: 0.02, y: 0.25, width: 0.96, height: 0.42 };

export const AXIOM_V4_PERFORMANCE_INVENTORY: readonly AxiomV4PerformanceInventoryEntry[] = [
  entry("neutral_listening", 14_000, 15_800, 14_900, "down", "neutral", "none", "arms_down", "low", 0.73),
  entry("two_hand_explanation", 700, 2_400, 1_550, "both_open", "open", "forward", "hands_open", "medium", 0.78),
  entry("pointing_right", 5_100, 6_900, 6_150, "right_extended", "right_lead", "right", "right_extension", "medium", 0.86),
  entry("pointing_left", 21_100, 23_100, 22_200, "left_extended", "left_lead", "left", "left_extension", "medium", 0.84),
  entry("reaction", 34_700, 36_000, 35_550, "reaction_rise", "raised", "forward", "reaction_rise", "medium", 0.80),
  entry("strong_emphasis", 35_900, 37_000, 36_550, "single_high", "raised", "forward", "single_high", "high", 0.88),
  entry("open_cta", 37_500, 39_400, 38_550, "both_high", "open", "forward", "both_high", "high", 0.90),
  entry("calm_product_explanation", 11_600, 13_400, 12_500, "down", "neutral", "none", "calm_arms_down", "low", 0.71)
] as const;

export const AXIOM_V4_ASSET_LIMITATIONS = {
  sufficientDistinctSilhouettes: true,
  distinctSilhouetteCount: 8,
  missingPerformances: ["lean_in", "result_celebration"] as const,
  limitations: [
    "The source reel contains no genuine torso lean; all performances retain a centered body.",
    "Several low-energy intervals differ mainly in hands and should not be placed adjacently.",
    "A future masked-performer recording should add torso rotation, lean-in, and a dedicated result celebration."
  ]
} as const;

export function getAxiomV4Performance(id: AxiomV4PerformanceId): AxiomV4PerformanceInventoryEntry {
  const value = AXIOM_V4_PERFORMANCE_INVENTORY.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Unknown Axiom v4 performance: ${id}`);
  return value;
}

function entry(
  id: AxiomV4PerformanceId,
  sourceStartMs: number,
  sourceEndMs: number,
  gesturePeakSourceMs: number,
  handPosition: AxiomV4PerformanceInventoryEntry["handPosition"],
  shoulderPosition: AxiomV4PerformanceInventoryEntry["shoulderPosition"],
  direction: AxiomV4PerformanceInventoryEntry["direction"],
  silhouetteClass: string,
  energy: AxiomV4PerformanceInventoryEntry["energy"],
  visualQualityScore: number
): AxiomV4PerformanceInventoryEntry {
  return {
    id,
    sourceStartMs,
    sourceEndMs,
    gesturePeakSourceMs,
    entranceMs: 180,
    gestureMs: Math.max(360, gesturePeakSourceMs - sourceStartMs - 180),
    holdMs: 420,
    cooldownMs: 450,
    handPosition,
    shoulderPosition,
    bodyLean: "center",
    direction,
    silhouetteClass,
    energy,
    suitableFraming: energy === "high" ? ["intimate_closeup", "chest_up"] : ["chest_up", "waist_up"],
    safeFaceRegion: FACE,
    safeHandRegion: HANDS,
    safeCaptionRegions: direction === "left" ? ["top_right", "lower_right"] : ["top_left", "lower_left"],
    safeProductRegions: direction === "left" ? ["left"] : direction === "right" ? ["right"] : ["left", "right", "upper"],
    loopRisk: "low",
    visualQualityScore
  };
}
