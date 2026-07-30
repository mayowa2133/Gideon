import { createHash } from "node:crypto";
import type { EditDecisionList } from "./types";
import {
  compileCreatorEditorialV4,
  evaluateCreatorEditorialV4,
  projectCreatorEditorialV4OntoEditDecisionList,
  type CompileCreatorEditorialV4Input,
  type CreatorEditorialV4Edl,
  type EditorialV4Shot
} from "./creatorEditorialV4";

export const CREATOR_EDITORIAL_REFERENCE_RHYTHM_TEMPLATE_ID = "creator_editorial_reference_rhythm_v1" as const;
export const CREATOR_EDITORIAL_REFERENCE_RHYTHM_COMPILER_VERSION = "creator-editorial-reference-rhythm-compiler-v1.1" as const;
export const CREATOR_EDITORIAL_REFERENCE_RHYTHM_SCHEMA_VERSION = "5" as const;

export type ReferenceNarrativeFunction =
  | "outcome_hook"
  | "visual_metaphor"
  | "credibility_proof"
  | "scale_claim"
  | "pain_setup"
  | "failure_state"
  | "mechanism_action"
  | "mechanism_result"
  | "benefit_translation"
  | "secondary_benefit"
  | "objection"
  | "evidence_answer"
  | "direct_cta"
  | "branded_hold";

export type ReferenceInternalVisualEventKind =
  | "caption_reveal"
  | "emphasis_reveal"
  | "diagram_activation"
  | "product_highlight"
  | "action_annotation"
  | "result_annotation"
  | "presenter_gesture"
  | "controlled_punch_in"
  | "brand_hold";

export type ReferenceTypographyTreatment =
  | "bold_sans"
  | "editorial_serif"
  | "product_annotation"
  | "brand_lockup";

export interface ReferenceClaimProvenance {
  claimId: string;
  statement: string;
  evidenceAssetIds: string[];
  source: "approved_product_evidence";
}

export interface ReferenceRhythmBeatSpec {
  id: string;
  narrativeFunction: ReferenceNarrativeFunction;
  spokenClaim: string;
  captionPhrases: string[];
  claimIds: string[];
  evidenceRequirement: "none" | "conceptual_diagram" | "authenticated_product" | "authenticated_result";
  evidenceAssetId?: string;
  cycleIds: string[];
  cycleRole?: "claim" | "proof" | "benefit";
  visualMetaphor?: {
    kind: "connected_decision_trail" | "scattered_context" | "none";
    conceptual: true;
    disclosure: "Conceptual workflow";
  };
  typography: ReferenceTypographyTreatment;
  emphasisWords: string[];
  transitionBehavior: "hard_cut" | "punch_in" | "card_slide" | "color_reset" | "brand_resolve";
  presenterDirection: "audience" | "product_left" | "product_right" | "none";
  cta?: {
    action: "open_demo";
    keyword: "DEMO";
    text: string;
    availabilityConfirmed: false;
  };
}

export interface ReferenceInternalVisualEvent {
  id: string;
  startMs: number;
  kind: ReferenceInternalVisualEventKind;
  description: string;
  addsMeaning: true;
}

export interface ReferenceRhythmNarrativeBeat extends ReferenceRhythmBeatSpec {
  startMs: number;
  endMs: number;
  shotId: string;
  internalVisualEvents: ReferenceInternalVisualEvent[];
}

export interface ReferenceRhythmShot extends EditorialV4Shot {
  narrativeBeatId: string;
  narrativeFunction: ReferenceNarrativeFunction;
  referenceVisualKind: "connected_decision_trail" | "scattered_context" | "none";
  internalVisualEvents: ReferenceInternalVisualEvent[];
  claimCycleIds: string[];
}

export interface CreatorEditorialReferenceRhythmEdl extends Omit<
  CreatorEditorialV4Edl,
  "schemaVersion" | "templateId" | "compilerVersion" | "shots"
> {
  schemaVersion: typeof CREATOR_EDITORIAL_REFERENCE_RHYTHM_SCHEMA_VERSION;
  templateId: typeof CREATOR_EDITORIAL_REFERENCE_RHYTHM_TEMPLATE_ID;
  compilerVersion: typeof CREATOR_EDITORIAL_REFERENCE_RHYTHM_COMPILER_VERSION;
  shots: ReferenceRhythmShot[];
  narrativeBeats: ReferenceRhythmNarrativeBeat[];
  claimProvenance: ReferenceClaimProvenance[];
  referenceGrammar: {
    source: "structural_analysis_only";
    copiedCreatorIdentity: false;
    copiedReferenceAssets: false;
    claimProofBenefitCycleCount: number;
  };
}

export interface CreatorEditorialReferenceRhythmQualityReport {
  schemaVersion: "1";
  templateId: typeof CREATOR_EDITORIAL_REFERENCE_RHYTHM_TEMPLATE_ID;
  passed: boolean;
  findings: Array<{
    code: string;
    status: "pass" | "fail";
    measured: number | string;
    threshold: string;
    beatIds?: string[];
  }>;
  claimProofBenefitCycleCount: number;
  averageSectionDurationMs: number;
  maximumInternalEventGapMs: number;
  presenterVisibilityRatio: number;
  v4BaselinePassed: boolean;
}

export interface CompileCreatorEditorialReferenceRhythmInput extends CompileCreatorEditorialV4Input {
  narrativeBeatSpecs: ReferenceRhythmBeatSpec[];
  claimProvenance: ReferenceClaimProvenance[];
}

export function compileCreatorEditorialReferenceRhythm(
  input: CompileCreatorEditorialReferenceRhythmInput
): CreatorEditorialReferenceRhythmEdl {
  const base = compileCreatorEditorialV4({ ...input, ctaTimingsAlreadyAbsolute: true });
  assertReferenceInputs(input, base);
  const supportedClaimIds = new Set(input.blueprint.claimIds);
  const assets = new Map(input.blueprint.productAssets.map((asset) => [asset.id, asset]));
  const provenance = new Map(input.claimProvenance.map((claim) => [claim.claimId, claim]));
  const shots = base.shots.map((shot, index): ReferenceRhythmShot => {
    const spec = input.narrativeBeatSpecs[index]!;
    for (const claimId of spec.claimIds) {
      if (!supportedClaimIds.has(claimId) || !provenance.has(claimId)) {
        throw new Error(`Reference rhythm beat ${spec.id} uses unsupported claim ${claimId}.`);
      }
    }
    if (spec.evidenceAssetId) {
      const asset = assets.get(spec.evidenceAssetId);
      if (!asset || !asset.factualUseAllowed || asset.approvalStatus !== "approved") {
        throw new Error(`Reference rhythm beat ${spec.id} uses unapproved evidence ${spec.evidenceAssetId}.`);
      }
      if (!shot.productEvidenceIds.includes(spec.evidenceAssetId)) {
        throw new Error(`Reference rhythm beat ${spec.id} does not match shot evidence ${spec.evidenceAssetId}.`);
      }
    }
    const internalVisualEvents = buildInternalVisualEvents(shot, spec);
    const withoutCache: Omit<ReferenceRhythmShot, "cacheIdentity"> = {
      ...shot,
      id: `reference-rhythm-shot-${String(index + 1).padStart(2, "0")}`,
      narrativeBeatId: spec.id,
      narrativeFunction: spec.narrativeFunction,
      referenceVisualKind: spec.visualMetaphor?.kind ?? "none",
      internalVisualEvents,
      claimCycleIds: spec.cycleIds
    };
    return {
      ...withoutCache,
      cacheIdentity: stableHash({
        compilerVersion: CREATOR_EDITORIAL_REFERENCE_RHYTHM_COMPILER_VERSION,
        seed: input.seed ?? 71_627,
        shot: withoutCache
      })
    };
  });
  const narrativeBeats = shots.map((shot, index): ReferenceRhythmNarrativeBeat => ({
    ...input.narrativeBeatSpecs[index]!,
    startMs: shot.startMs,
    endMs: shot.endMs,
    shotId: shot.id,
    internalVisualEvents: shot.internalVisualEvents
  }));
  const claimProofBenefitCycleCount = countCompleteCycles(narrativeBeats);
  const edl: CreatorEditorialReferenceRhythmEdl = {
    ...base,
    schemaVersion: CREATOR_EDITORIAL_REFERENCE_RHYTHM_SCHEMA_VERSION,
    templateId: CREATOR_EDITORIAL_REFERENCE_RHYTHM_TEMPLATE_ID,
    compilerVersion: CREATOR_EDITORIAL_REFERENCE_RHYTHM_COMPILER_VERSION,
    seed: input.seed ?? 71_627,
    shots,
    narrativeBeats,
    claimProvenance: input.claimProvenance,
    referenceGrammar: {
      source: "structural_analysis_only",
      copiedCreatorIdentity: false,
      copiedReferenceAssets: false,
      claimProofBenefitCycleCount
    }
  };
  const report = evaluateCreatorEditorialReferenceRhythm(edl);
  const failures = input.validationProfile === "user_story_v7"
    ? []
    : report.findings.filter(({ status }) => status === "fail");
  if (failures.length > 0) {
    throw new Error(`Invalid reference-rhythm plan: ${failures.map(({ code }) => code).join(", ")}.`);
  }
  return edl;
}

export function evaluateCreatorEditorialReferenceRhythm(
  edl: CreatorEditorialReferenceRhythmEdl
): CreatorEditorialReferenceRhythmQualityReport {
  const v4Report = evaluateCreatorEditorialV4(edl as unknown as CreatorEditorialV4Edl);
  const functions = edl.narrativeBeats.map(({ narrativeFunction }) => narrativeFunction);
  const hook = edl.narrativeBeats.find(({ narrativeFunction }) => narrativeFunction === "outcome_hook");
  const cta = edl.narrativeBeats.find(({ narrativeFunction }) => narrativeFunction === "direct_cta");
  const outro = edl.narrativeBeats.find(({ narrativeFunction }) => narrativeFunction === "branded_hold");
  const claimProofBenefitCycleCount = countCompleteCycles(edl.narrativeBeats);
  const averageSectionDurationMs = Math.round(edl.durationMs / edl.shots.length);
  const maximumInternalEventGapMs = Math.max(0, ...edl.narrativeBeats
    .filter(({ narrativeFunction }) => narrativeFunction !== "branded_hold")
    .map(maximumEventGap));
  const presenterMs = edl.shots
    .filter(({ presenter }) => presenter.visible)
    .reduce((sum, { startMs, endMs }) => sum + endMs - startMs, 0);
  const presenterVisibilityRatio = presenterMs / edl.durationMs;
  const oldNameBeats = edl.narrativeBeats.filter((beat) =>
    /nexus\s*reach|nexusreach/i.test([
      beat.spokenClaim,
      ...beat.captionPhrases,
      beat.cta?.text ?? ""
    ].join(" "))
  );
  const genericCta = !cta?.cta
    || cta.cta.action !== "open_demo"
    || !/\bsolomon\b/i.test(cta.cta.text)
    || !/\b(open|view|see)\b/i.test(cta.cta.text);
  const evidenceFailures = edl.narrativeBeats.filter((beat) =>
    (beat.evidenceRequirement === "authenticated_product" || beat.evidenceRequirement === "authenticated_result")
    && !beat.evidenceAssetId
  );
  const failureIndex = functions.indexOf("failure_state");
  const actionIndex = functions.findIndex((value, index) => index > failureIndex && value === "mechanism_action");
  const resultIndex = functions.findIndex((value, index) => index > actionIndex && value === "mechanism_result");
  const benefitIndex = functions.findIndex((value, index) => index > resultIndex && value === "benefit_translation");
  const sequence = [failureIndex, actionIndex, resultIndex, benefitIndex];
  const storySequenceValid = sequence.every((value) => value >= 0)
    && sequence.every((value, index) => index === 0 || value > sequence[index - 1]!);
  const findings = [
    finding("duration", edl.durationMs >= 34_000 && edl.durationMs <= 38_000, edl.durationMs, "34000..38000 ms"),
    finding("major_sections", edl.shots.length >= 16 && edl.shots.length <= 18, edl.shots.length, "16..18"),
    finding("outcome_hook", Boolean(hook && hook.startMs === 0 && hook.endMs <= 2_200), hook ? `${hook.startMs}-${hook.endMs}` : "missing", "starts at 0 and ends by 2200 ms"),
    finding("story_sequence", storySequenceValid, sequence.join("/"), "failure < mechanism action < mechanism result < benefit"),
    finding("claim_proof_benefit_cycles", claimProofBenefitCycleCount >= 3, claimProofBenefitCycleCount, ">=3"),
    finding("secondary_benefit", functions.includes("secondary_benefit"), String(functions.includes("secondary_benefit")), "true"),
    finding("objection_answer", functions.indexOf("objection") >= 0 && functions.indexOf("evidence_answer") > functions.indexOf("objection"), `${functions.indexOf("objection")}/${functions.indexOf("evidence_answer")}`, "objection before evidence answer"),
    finding("specific_cta", !genericCta, cta?.cta?.text ?? "missing", "one explicit Solomon action"),
    finding("branded_hold", Boolean(outro && outro.endMs - outro.startMs >= 3_000), outro ? outro.endMs - outro.startMs : 0, ">=3000 ms"),
    finding("average_section_duration", averageSectionDurationMs >= 1_800 && averageSectionDurationMs <= 2_300, averageSectionDurationMs, "1800..2300 ms"),
    finding("internal_event_density", maximumInternalEventGapMs <= 700, maximumInternalEventGapMs, "<=700 ms"),
    finding("presenter_visibility", presenterVisibilityRatio >= 0.55 && presenterVisibilityRatio <= 0.70, Number(presenterVisibilityRatio.toFixed(4)), "0.55..0.70"),
    finding("evidence_requirements", evidenceFailures.length === 0, evidenceFailures.length, "0", evidenceFailures.map(({ id }) => id)),
    finding("viewer_facing_product_name", oldNameBeats.length === 0, oldNameBeats.length, "0 NexusReach references", oldNameBeats.map(({ id }) => id)),
    finding("claim_provenance", edl.claimProvenance.length > 0 && edl.narrativeBeats.every(({ claimIds }) => claimIds.length > 0), edl.claimProvenance.length, "all spoken beats carry supported claim IDs"),
    finding("v4_structural_baseline", v4Report.passed, String(v4Report.passed), "true")
  ];
  return {
    schemaVersion: "1",
    templateId: CREATOR_EDITORIAL_REFERENCE_RHYTHM_TEMPLATE_ID,
    passed: findings.every(({ status }) => status === "pass"),
    findings,
    claimProofBenefitCycleCount,
    averageSectionDurationMs,
    maximumInternalEventGapMs,
    presenterVisibilityRatio,
    v4BaselinePassed: v4Report.passed
  };
}

export function assertCreatorEditorialReferenceRhythmEdl(
  value: unknown
): asserts value is CreatorEditorialReferenceRhythmEdl {
  if (!value || typeof value !== "object") throw new Error("Reference-rhythm EDL must be an object.");
  const edl = value as Partial<CreatorEditorialReferenceRhythmEdl>;
  if (
    edl.schemaVersion !== CREATOR_EDITORIAL_REFERENCE_RHYTHM_SCHEMA_VERSION
    || edl.templateId !== CREATOR_EDITORIAL_REFERENCE_RHYTHM_TEMPLATE_ID
    || !Array.isArray(edl.shots)
    || !Array.isArray(edl.narrativeBeats)
    || !Array.isArray(edl.claimProvenance)
  ) {
    throw new Error("Reference-rhythm EDL schema is invalid.");
  }
  const report = evaluateCreatorEditorialReferenceRhythm(edl as CreatorEditorialReferenceRhythmEdl);
  if (!report.passed) throw new Error("Reference-rhythm EDL failed structural validation.");
}

export function projectCreatorEditorialReferenceRhythmOntoEditDecisionList(
  base: EditDecisionList,
  editorial: CreatorEditorialReferenceRhythmEdl
): EditDecisionList {
  const projected = projectCreatorEditorialV4OntoEditDecisionList(
    base,
    editorial as unknown as CreatorEditorialV4Edl
  );
  return {
    ...projected,
    templateId: `creator-template:${CREATOR_EDITORIAL_REFERENCE_RHYTHM_TEMPLATE_ID}:v1`,
    templateKey: CREATOR_EDITORIAL_REFERENCE_RHYTHM_TEMPLATE_ID,
    templateVersion: 1
  };
}

function assertReferenceInputs(
  input: CompileCreatorEditorialReferenceRhythmInput,
  base: CreatorEditorialV4Edl
): void {
  if (input.narrativeBeatSpecs.length !== base.shots.length) {
    throw new Error(`Reference rhythm requires one narrative beat per shot (${base.shots.length}).`);
  }
  if (new Set(input.narrativeBeatSpecs.map(({ id }) => id)).size !== input.narrativeBeatSpecs.length) {
    throw new Error("Reference rhythm narrative beat IDs must be unique.");
  }
  const plannedSpeech = input.narrativeBeatSpecs
    .filter(({ narrativeFunction }) => narrativeFunction !== "branded_hold")
    .map(({ spokenClaim }) => spokenClaim)
    .join(" ");
  const approvedSpeech = input.narrationBeats.map(({ text }) => text).join(" ");
  if (normalizeWords(plannedSpeech) !== normalizeWords(approvedSpeech)) {
    throw new Error("Reference rhythm narrative beats must preserve the exact approved narration.");
  }
  const provenanceIds = new Set(input.claimProvenance.map(({ claimId }) => claimId));
  if (provenanceIds.size !== input.claimProvenance.length) {
    throw new Error("Reference rhythm claim provenance IDs must be unique.");
  }
  for (const claim of input.claimProvenance) {
    if (!input.blueprint.claimIds.includes(claim.claimId) || claim.evidenceAssetIds.length === 0) {
      throw new Error(`Reference rhythm claim provenance ${claim.claimId} is unsupported.`);
    }
  }
}

function buildInternalVisualEvents(
  shot: EditorialV4Shot,
  spec: ReferenceRhythmBeatSpec
): ReferenceInternalVisualEvent[] {
  const durationMs = shot.endMs - shot.startMs;
  const eventCount = Math.max(2, Math.ceil(durationMs / 600));
  const kinds: ReferenceInternalVisualEventKind[] = shot.productEvidenceIds.length > 0
    ? ["caption_reveal", "action_annotation", "product_highlight", "result_annotation", "emphasis_reveal"]
    : spec.narrativeFunction === "branded_hold"
      ? ["brand_hold"]
      : spec.visualMetaphor
        ? ["caption_reveal", "diagram_activation", "emphasis_reveal", "presenter_gesture"]
        : ["caption_reveal", "presenter_gesture", "emphasis_reveal", "controlled_punch_in"];
  return Array.from({ length: eventCount }, (_, index) => {
    const offsetMs = Math.min(durationMs - 1, Math.round(index * durationMs / eventCount));
    const kind = kinds[index % kinds.length]!;
    return {
      id: `${spec.id}-event-${String(index + 1).padStart(2, "0")}`,
      startMs: shot.startMs + offsetMs,
      kind,
      description: eventDescription(kind, spec),
      addsMeaning: true as const
    };
  });
}

function eventDescription(kind: ReferenceInternalVisualEventKind, spec: ReferenceRhythmBeatSpec): string {
  if (kind === "action_annotation") return "Identify the authenticated user action.";
  if (kind === "result_annotation") return "Translate the authenticated result into its user benefit.";
  if (kind === "product_highlight") return "Keep the verified product evidence as the visual proof.";
  if (kind === "diagram_activation") return "Activate one node in the disclosed conceptual workflow.";
  if (kind === "presenter_gesture") return `Align the presenter with the ${spec.narrativeFunction} claim.`;
  if (kind === "controlled_punch_in") return "Restore presenter connection after technical evidence.";
  if (kind === "emphasis_reveal") return `Emphasize ${spec.emphasisWords.join(", ") || "the central phrase"}.`;
  if (kind === "brand_hold") return "Hold the Solomon brand and repeated CTA long enough to act.";
  return "Reveal the next short, sound-off-readable caption phrase.";
}

function maximumEventGap(beat: ReferenceRhythmNarrativeBeat): number {
  const boundaries = [
    beat.startMs,
    ...beat.internalVisualEvents.map(({ startMs }) => startMs),
    beat.endMs
  ].sort((a, b) => a - b);
  return Math.max(0, ...boundaries.slice(1).map((value, index) => value - boundaries[index]!));
}

function countCompleteCycles(beats: ReferenceRhythmNarrativeBeat[]): number {
  const cycles = new Map<string, Set<"claim" | "proof" | "benefit">>();
  for (const beat of beats) {
    if (!beat.cycleRole) continue;
    for (const cycleId of beat.cycleIds) {
      const roles = cycles.get(cycleId) ?? new Set<"claim" | "proof" | "benefit">();
      roles.add(beat.cycleRole);
      cycles.set(cycleId, roles);
    }
  }
  return [...cycles.values()].filter((roles) =>
    roles.has("claim") && roles.has("proof") && roles.has("benefit")
  ).length;
}

function normalizeWords(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function finding(
  code: string,
  pass: boolean,
  measured: number | string,
  threshold: string,
  beatIds?: string[]
) {
  return {
    code,
    status: pass ? "pass" as const : "fail" as const,
    measured,
    threshold,
    ...(beatIds && beatIds.length > 0 ? { beatIds } : {})
  };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
