import { createHash } from "node:crypto";
import type { EditDecisionList } from "./types";
import type { AxiomV4PerformanceId } from "./axiomPerformanceInventoryV4";
import {
  compileCreatorEditorialReferenceRhythm,
  evaluateCreatorEditorialReferenceRhythm,
  projectCreatorEditorialReferenceRhythmOntoEditDecisionList,
  type CompileCreatorEditorialReferenceRhythmInput,
  type CreatorEditorialReferenceRhythmEdl,
  type ReferenceRhythmShot
} from "./creatorEditorialReferenceRhythm";

export const CREATOR_EDITORIAL_AI_CREATOR_V6_TEMPLATE_ID = "creator_editorial_ai_creator_v6" as const;
export const CREATOR_EDITORIAL_AI_CREATOR_V6_COMPILER_VERSION = "creator-editorial-ai-creator-compiler-v6.0" as const;
export const CREATOR_EDITORIAL_AI_CREATOR_V6_SCHEMA_VERSION = "6" as const;

export type V6InformationType =
  | "concrete_outcome"
  | "role_action"
  | "tracker_decision"
  | "contact_context"
  | "trust_proof"
  | "workflow_recap"
  | "direct_cta"
  | "brand_hold";

export type V6EmotionalState = "tension" | "curiosity" | "clarity" | "confidence" | "trust" | "invitation";

export interface V6ShotDirection {
  informationType: V6InformationType;
  emotionalState: V6EmotionalState;
  presenterPerformance: AxiomV4PerformanceId | "none";
  gazeTarget: "audience" | "product_left" | "product_right" | "cta" | "none";
  voiceReactiveAccent: "visor_pulse" | "eye_glow" | "none";
  semanticChange: string;
  trustPayoff: boolean;
  persistentCta: boolean;
}

export interface V6ClaimEvidenceRow {
  spokenClaim: string;
  onScreenCaption: string;
  requiredProductAction: string;
  evidenceAssetIds: string[];
  sourceHashes: string[];
  verifiedSourceIntervals: Array<{ assetId: string; startMs: number; endMs: number }>;
  visibleResult: string;
  approvalStatus: "approved" | "qualified" | "rejected";
  qualification: string;
}

export interface CreatorEditorialAiCreatorV6Shot extends ReferenceRhythmShot {
  v6Direction: V6ShotDirection;
}

export interface CreatorEditorialAiCreatorV6Edl extends Omit<
  CreatorEditorialReferenceRhythmEdl,
  "schemaVersion" | "templateId" | "compilerVersion" | "shots"
> {
  schemaVersion: typeof CREATOR_EDITORIAL_AI_CREATOR_V6_SCHEMA_VERSION;
  templateId: typeof CREATOR_EDITORIAL_AI_CREATOR_V6_TEMPLATE_ID;
  compilerVersion: typeof CREATOR_EDITORIAL_AI_CREATOR_V6_COMPILER_VERSION;
  shots: CreatorEditorialAiCreatorV6Shot[];
  claimEvidenceMatrix: V6ClaimEvidenceRow[];
  creatorGrammar: {
    concreteHookDeadlineMs: 3_000;
    tensionBeforeRelief: true;
    trustPayoffRequired: true;
    ctaText: "Open the Solomon demo.";
    ctaPersistsThroughOutro: true;
    mouthlessPresenter: true;
    lipSyncRequired: false;
  };
}

export interface CompileCreatorEditorialAiCreatorV6Input extends CompileCreatorEditorialReferenceRhythmInput {
  claimEvidenceMatrix: V6ClaimEvidenceRow[];
}

export interface CreatorEditorialAiCreatorV6QualityReport {
  schemaVersion: "6";
  templateId: typeof CREATOR_EDITORIAL_AI_CREATOR_V6_TEMPLATE_ID;
  passed: boolean;
  findings: Array<{
    code: string;
    status: "pass" | "fail";
    measured: number | string;
    threshold: string;
    shotIds?: string[];
  }>;
  distinctPresenterPerformances: AxiomV4PerformanceId[];
  distinctInformationTypes: V6InformationType[];
  referenceBaselinePassed: boolean;
}

const PERFORMANCE_SEQUENCE: Readonly<Partial<Record<number, AxiomV4PerformanceId>>> = {
  0: "strong_emphasis",
  1: "two_hand_explanation",
  2: "pointing_right",
  3: "neutral_listening",
  4: "pointing_left",
  5: "reaction",
  6: "calm_product_explanation",
  7: "pointing_right",
  8: "two_hand_explanation",
  9: "pointing_left",
  10: "strong_emphasis",
  11: "calm_product_explanation",
  12: "reaction",
  13: "neutral_listening",
  14: "open_cta"
};

const SHOT_DIRECTIONS: readonly V6ShotDirection[] = [
  direction("concrete_outcome", "curiosity", "strong_emphasis", "audience", "visor_pulse", "Open on the concrete review-before-send outcome."),
  direction("workflow_recap", "clarity", "two_hand_explanation", "audience", "eye_glow", "Name the role-to-outreach scope without implying one screen."),
  direction("role_action", "clarity", "pointing_right", "product_right", "none", "Show the authenticated role action."),
  direction("role_action", "confidence", "neutral_listening", "product_left", "eye_glow", "Hold the visible role result."),
  direction("tracker_decision", "clarity", "pointing_left", "product_left", "none", "Move into the authenticated tracker proof."),
  direction("tracker_decision", "tension", "reaction", "audience", "visor_pulse", "Pose the changed-priority decision as a question."),
  direction("tracker_decision", "confidence", "calm_product_explanation", "product_right", "eye_glow", "Resolve tension with a reviewable next step."),
  direction("contact_context", "curiosity", "pointing_right", "product_right", "none", "Open the authenticated saved-contact view."),
  direction("contact_context", "clarity", "two_hand_explanation", "product_left", "eye_glow", "Hold the visible contact details."),
  { ...direction("trust_proof", "trust", "pointing_left", "product_left", "visor_pulse", "Show the outreach draft before send."), trustPayoff: true },
  { ...direction("trust_proof", "trust", "strong_emphasis", "audience", "eye_glow", "State the approved review-before-send boundary."), trustPayoff: true },
  { ...direction("trust_proof", "confidence", "calm_product_explanation", "product_right", "none", "Return to authenticated outreach context."), trustPayoff: true },
  direction("workflow_recap", "clarity", "reaction", "audience", "visor_pulse", "Recap role, person, details, and next step."),
  direction("workflow_recap", "confidence", "neutral_listening", "audience", "eye_glow", "Translate the proof into a qualified workflow benefit."),
  { ...direction("direct_cta", "invitation", "open_cta", "cta", "visor_pulse", "Present one explicit action."), persistentCta: true },
  { ...direction("brand_hold", "invitation", "none", "cta", "none", "Repeat the same CTA through the brand hold."), persistentCta: true }
] as const;

function direction(
  informationType: V6InformationType,
  emotionalState: V6EmotionalState,
  presenterPerformance: AxiomV4PerformanceId | "none",
  gazeTarget: V6ShotDirection["gazeTarget"],
  voiceReactiveAccent: V6ShotDirection["voiceReactiveAccent"],
  semanticChange: string
): V6ShotDirection {
  return {
    informationType,
    emotionalState,
    presenterPerformance,
    gazeTarget,
    voiceReactiveAccent,
    semanticChange,
    trustPayoff: false,
    persistentCta: false
  };
}

export function compileCreatorEditorialAiCreatorV6(
  input: CompileCreatorEditorialAiCreatorV6Input
): CreatorEditorialAiCreatorV6Edl {
  assertClaimEvidenceMatrix(input);
  const base = compileCreatorEditorialReferenceRhythm({
    ...input,
    performanceSequence: PERFORMANCE_SEQUENCE
  });
  if (base.shots.length !== SHOT_DIRECTIONS.length) {
    throw new Error(`V6 requires ${SHOT_DIRECTIONS.length} directed shots.`);
  }
  const shots = base.shots.map((shot, index): CreatorEditorialAiCreatorV6Shot => {
    const v6Direction = SHOT_DIRECTIONS[index]!;
    const actualPerformance = shot.presenter.performance?.id ?? "none";
    if (actualPerformance !== v6Direction.presenterPerformance) {
      throw new Error(`V6 presenter direction mismatch in shot ${shot.id}.`);
    }
    const presenterOnlySafeRegion = index === 1
      ? { x: 0.50, y: 0.72, width: 0.44, height: 0.15 }
      : { x: 0.08, y: 0.10, width: 0.84, height: 0.18 };
    const captions = shot.presenter.visible && shot.productEvidenceIds.length === 0
      ? shot.captions.map((caption) => ({
          ...caption,
          placementKey: index === 1 ? "lower_right" as const : "top_center" as const,
          safeRegion: presenterOnlySafeRegion
        }))
      : shot.captions;
    const withoutCache = { ...shot, captions, v6Direction };
    return {
      ...withoutCache,
      cacheIdentity: stableHash({
        compilerVersion: CREATOR_EDITORIAL_AI_CREATOR_V6_COMPILER_VERSION,
        seed: input.seed ?? 71_628,
        shot: withoutCache
      })
    };
  });
  const edl: CreatorEditorialAiCreatorV6Edl = {
    ...base,
    schemaVersion: CREATOR_EDITORIAL_AI_CREATOR_V6_SCHEMA_VERSION,
    templateId: CREATOR_EDITORIAL_AI_CREATOR_V6_TEMPLATE_ID,
    compilerVersion: CREATOR_EDITORIAL_AI_CREATOR_V6_COMPILER_VERSION,
    seed: input.seed ?? 71_628,
    shots,
    claimEvidenceMatrix: input.claimEvidenceMatrix,
    creatorGrammar: {
      concreteHookDeadlineMs: 3_000,
      tensionBeforeRelief: true,
      trustPayoffRequired: true,
      ctaText: "Open the Solomon demo.",
      ctaPersistsThroughOutro: true,
      mouthlessPresenter: true,
      lipSyncRequired: false
    }
  };
  const report = evaluateCreatorEditorialAiCreatorV6(edl);
  const failures = report.findings.filter(({ status }) => status === "fail");
  if (failures.length > 0) {
    throw new Error(`Invalid V6 creator plan: ${failures.map(({ code }) => code).join(", ")}.`);
  }
  return edl;
}

export function evaluateCreatorEditorialAiCreatorV6(
  edl: CreatorEditorialAiCreatorV6Edl
): CreatorEditorialAiCreatorV6QualityReport {
  const reference = evaluateCreatorEditorialReferenceRhythm(edl as unknown as CreatorEditorialReferenceRhythmEdl);
  const performances = edl.shots
    .map(({ presenter }) => presenter.performance?.id)
    .filter((value): value is AxiomV4PerformanceId => Boolean(value));
  const distinctPresenterPerformances = [...new Set(performances)];
  const adjacentRepeats = performances.filter((value, index) => index > 0 && value === performances[index - 1]);
  const distinctInformationTypes = [...new Set(edl.shots.map(({ v6Direction }) => v6Direction.informationType))];
  const tensionIndex = edl.shots.findIndex(({ v6Direction }) => v6Direction.emotionalState === "tension");
  const reliefIndex = edl.shots.findIndex(({ v6Direction }, index) =>
    index > tensionIndex && (v6Direction.emotionalState === "clarity" || v6Direction.emotionalState === "confidence")
  );
  const hook = edl.narrativeBeats[0];
  const trustShots = edl.shots.filter(({ v6Direction }) => v6Direction.trustPayoff);
  const ctaShots = edl.shots.filter(({ v6Direction }) => v6Direction.persistentCta);
  const unsupportedRows = edl.claimEvidenceMatrix.filter(({ approvalStatus, evidenceAssetIds, sourceHashes, verifiedSourceIntervals }) =>
    approvalStatus === "rejected"
    || evidenceAssetIds.length === 0
    || sourceHashes.length !== evidenceAssetIds.length
    || verifiedSourceIntervals.length !== evidenceAssetIds.length
  );
  const findings = [
    finding("reference_baseline", reference.passed, String(reference.passed), "true"),
    finding("concrete_hook", Boolean(hook && hook.endMs <= 3_000 && /\b(role|contact|outreach|message|review)\b/i.test(hook.spokenClaim)), hook?.spokenClaim ?? "missing", "concrete product object by 3000 ms"),
    finding("presenter_inventory_coverage", distinctPresenterPerformances.length === 8, distinctPresenterPerformances.length, "all 8 approved states"),
    finding("presenter_no_adjacent_repetition", adjacentRepeats.length === 0, adjacentRepeats.length, "0"),
    finding("semantic_information_variety", distinctInformationTypes.length >= 7, distinctInformationTypes.length, ">=7"),
    finding("tension_before_relief", tensionIndex >= 0 && reliefIndex > tensionIndex, `${tensionIndex}/${reliefIndex}`, "tension index < relief index"),
    finding(
      "trust_payoff",
      trustShots.length >= 3
        && trustShots.filter(({ productEvidenceIds }) => productEvidenceIds.includes("outreach")).length >= 2
        && trustShots.every(({ claimIds }) => claimIds.includes("claim-outreach")),
      trustShots.length,
      "3-shot trust sequence with >=2 authenticated outreach views"
    ),
    finding("persistent_cta", ctaShots.length === 2 && ctaShots.at(-1)?.endMs === edl.durationMs, ctaShots.length, "CTA and branded outro through final frame"),
    finding(
      "claim_matrix",
      unsupportedRows.length === 0 && edl.claimEvidenceMatrix.length >= 12,
      `${edl.claimEvidenceMatrix.length} rows / ${unsupportedRows.length} unsupported`,
      ">=12 capability-sentence rows and 0 unsupported"
    ),
    finding("mouthless_no_lipsync", edl.creatorGrammar.mouthlessPresenter && !edl.creatorGrammar.lipSyncRequired, String(!edl.creatorGrammar.lipSyncRequired), "true")
  ];
  return {
    schemaVersion: "6",
    templateId: CREATOR_EDITORIAL_AI_CREATOR_V6_TEMPLATE_ID,
    passed: findings.every(({ status }) => status === "pass"),
    findings,
    distinctPresenterPerformances,
    distinctInformationTypes,
    referenceBaselinePassed: reference.passed
  };
}

export function assertCreatorEditorialAiCreatorV6Edl(
  value: unknown
): asserts value is CreatorEditorialAiCreatorV6Edl {
  if (!value || typeof value !== "object") throw new Error("V6 EDL must be an object.");
  const edl = value as Partial<CreatorEditorialAiCreatorV6Edl>;
  if (
    edl.schemaVersion !== CREATOR_EDITORIAL_AI_CREATOR_V6_SCHEMA_VERSION
    || edl.templateId !== CREATOR_EDITORIAL_AI_CREATOR_V6_TEMPLATE_ID
    || !Array.isArray(edl.shots)
    || !Array.isArray(edl.claimEvidenceMatrix)
  ) {
    throw new Error("V6 EDL schema is invalid.");
  }
  if (!evaluateCreatorEditorialAiCreatorV6(edl as CreatorEditorialAiCreatorV6Edl).passed) {
    throw new Error("V6 EDL failed structural validation.");
  }
}

export function projectCreatorEditorialAiCreatorV6OntoEditDecisionList(
  base: EditDecisionList,
  editorial: CreatorEditorialAiCreatorV6Edl
): EditDecisionList {
  const projected = projectCreatorEditorialReferenceRhythmOntoEditDecisionList(
    base,
    editorial as unknown as CreatorEditorialReferenceRhythmEdl
  );
  return {
    ...projected,
    templateId: `creator-template:${CREATOR_EDITORIAL_AI_CREATOR_V6_TEMPLATE_ID}:v1`,
    templateKey: CREATOR_EDITORIAL_AI_CREATOR_V6_TEMPLATE_ID,
    templateVersion: 1
  };
}

function assertClaimEvidenceMatrix(input: CompileCreatorEditorialAiCreatorV6Input): void {
  const assets = new Map(input.blueprint.productAssets.map((asset) => [asset.id, asset]));
  for (const row of input.claimEvidenceMatrix) {
    if (row.approvalStatus === "rejected" || row.evidenceAssetIds.length === 0) {
      throw new Error(`V6 rejected or unsupported claim: ${row.spokenClaim}`);
    }
    row.evidenceAssetIds.forEach((assetId, index) => {
      const asset = assets.get(assetId);
      if (
        !asset
        || asset.approvalStatus !== "approved"
        || !asset.factualUseAllowed
        || asset.contentHash !== row.sourceHashes[index]
        || row.verifiedSourceIntervals[index]?.assetId !== assetId
      ) {
        throw new Error(`V6 claim matrix evidence mismatch for ${assetId}.`);
      }
    });
  }
}

function finding(
  code: string,
  pass: boolean,
  measured: number | string,
  threshold: string,
  shotIds?: string[]
) {
  return {
    code,
    status: pass ? "pass" as const : "fail" as const,
    measured,
    threshold,
    ...(shotIds && shotIds.length > 0 ? { shotIds } : {})
  };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
