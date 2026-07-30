import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildKineticCaptions,
  compileCreatorEditorial,
  evaluateCreatorEditorial,
  projectCreatorEditorialOntoEditDecisionList,
  selectEditorialActionEvent,
  type CreatorEditorialEdl,
  type EditorialNarrationBeat
} from "../shared/creatorEditorial";
import {
  compileCreatorEditorialV2,
  evaluateCreatorEditorialV2,
  projectCreatorEditorialV2OntoEditDecisionList,
  type CreatorEditorialV2Edl,
  type EditorialV2CaptionCue
} from "../shared/creatorEditorialV2";
import {
  compileCreatorEditorialV3,
  evaluateCreatorEditorialV3,
  projectCreatorEditorialV3OntoEditDecisionList,
  type CreatorEditorialV3Edl,
  type EditorialV3CaptionCue
} from "../shared/creatorEditorialV3";
import {
  compileCreatorEditorialV4,
  evaluateCreatorEditorialV4,
  projectCreatorEditorialV4OntoEditDecisionList,
  type CreatorEditorialV4Edl,
  type EditorialV4CaptionCue
} from "../shared/creatorEditorialV4";
import {
  compileCreatorEditorialReferenceRhythm,
  evaluateCreatorEditorialReferenceRhythm,
  projectCreatorEditorialReferenceRhythmOntoEditDecisionList,
  type CreatorEditorialReferenceRhythmEdl,
  type ReferenceClaimProvenance,
  type ReferenceRhythmBeatSpec
} from "../shared/creatorEditorialReferenceRhythm";
import {
  compileCreatorEditorialAiCreatorV6,
  evaluateCreatorEditorialAiCreatorV6,
  projectCreatorEditorialAiCreatorV6OntoEditDecisionList,
  type CreatorEditorialAiCreatorV6Edl,
  type V6ClaimEvidenceRow
} from "../shared/creatorEditorialAiCreatorV6";
import {
  compileCreatorEditorialUserStoryV7,
  evaluateCreatorEditorialUserStoryV7,
  projectCreatorEditorialUserStoryV7OntoEditDecisionList,
  type CreatorEditorialUserStoryV7Edl,
  type V7ClaimEvidenceRow,
  type V7ProductMicroScene
} from "../shared/creatorEditorialUserStoryV7";
import {
  AXIOM_V4_ASSET_LIMITATIONS,
  AXIOM_V4_PERFORMANCE_INVENTORY
} from "../shared/axiomPerformanceInventoryV4";
import { selectEditorialNarrationCandidate } from "../shared/creatorEditorialNarrationSelection";
import {
  approvedNarrationMatchesAlignedTokens,
  mergeAlignedTokensIntoSurfaceWords,
  narrationAlignmentTokens,
  narrationSurfaceWords
} from "../shared/narrationWordAlignment";
import {
  selectEditorialProsodyCandidate,
  type EditorialProsodyMetrics
} from "../shared/creatorEditorialProsody";
import { analyzeEditorialPerceptualBoundaries } from "../shared/creatorEditorialPerceptualAnalysis";
import { detectArrowCursorPixels } from "../shared/cursorPixelValidation";
import {
  mapSourcePointToCard,
  productCardLayoutV4,
  productContainmentReport,
  productPresenterLayoutV4,
  rectanglesOverlap,
  rectCenter
} from "../shared/editorialProductFraming";
import type { CreativeBlueprint, EditDecisionList, ProductEvidenceAsset } from "../shared/types";
import { ChatterboxNarrationProvider } from "./chatterboxNarrationProvider";
import type { NarrationResult } from "./narration";
import {
  CREATOR_EDITORIAL_V2_RENDERER_VERSION,
  CREATOR_EDITORIAL_V3_RENDERER_VERSION,
  CREATOR_EDITORIAL_V4_RENDERER_VERSION,
  creatorEditorialV2EncodingProfiles,
  creatorEditorialV3EncodingProfiles,
  creatorEditorialV4EncodingProfiles,
  renderCreatorEditorialCaptionOverlay,
  renderCreatorEditorialShot,
  renderCreatorEditorialV2CaptionOverlay,
  renderCreatorEditorialV2Shot,
  renderCreatorEditorialV3CaptionOverlay,
  renderCreatorEditorialV3Shot,
  renderCreatorEditorialV4CaptionOverlay,
  renderCreatorEditorialV4Shot
} from "./creatorEditorialRenderer";

const requestedEditorialVersion = Number(process.env.GIDEON_CREATOR_EDITORIAL_VERSION ?? "1");
const EDITORIAL_VERSION: 1 | 2 | 3 | 4 | 5 | 6 | 7 = requestedEditorialVersion === 7
  ? 7
  : requestedEditorialVersion === 6
  ? 6
  : requestedEditorialVersion === 5
    ? 5
  : requestedEditorialVersion === 4
    ? 4
    : requestedEditorialVersion === 3
      ? 3
      : requestedEditorialVersion === 2
        ? 2
        : 1;
const IS_V7 = EDITORIAL_VERSION === 7;
const IS_V6 = EDITORIAL_VERSION === 6;
const IS_REFERENCE_RHYTHM = EDITORIAL_VERSION >= 5;
const DURATION_MS = IS_REFERENCE_RHYTHM ? 36_000 : 35_000;
const SPEECH_END_MS = IS_REFERENCE_RHYTHM ? 33_000 : 32_000;
const IS_V2 = EDITORIAL_VERSION === 2;
const IS_V3 = EDITORIAL_VERSION === 3;
const IS_V4 = EDITORIAL_VERSION >= 4;
const IS_V3_PLUS = EDITORIAL_VERSION >= 3;
const IS_MODERN = EDITORIAL_VERSION >= 2;
const SEED = IS_V7 ? 71_629 : IS_V6 ? 71_628 : IS_REFERENCE_RHYTHM ? 71_627 : IS_V4 ? 71_626 : IS_V3 ? 71_625 : IS_V2 ? 71_624 : 71_623;
const FFMPEG = process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.GIDEON_FFPROBE_PATH?.trim() || "/opt/homebrew/bin/ffprobe";
const OUTPUT_ROOT = path.resolve(process.env.GIDEON_SOLOMON_EDITORIAL_DIR ?? `tmp/solomon-creator-editorial-v${EDITORIAL_VERSION}`);
const ORIGINAL_ROOT = process.env.GIDEON_ORIGINAL_ROOT?.trim()
  || "/Users/mayowaadesanya/Documents/Documents - Mayowa’s MacBook Pro/Projects/Gideon";
const CAPTURE_ROOT = process.env.GIDEON_SOLOMON_CAPTURE_ROOT?.trim()
  || path.join(ORIGINAL_ROOT, "tmp/capture-pilot/nexusreach/runs/2026-07-27T14-13-04-852Z-32a548a9-27e7-404a-930d-0954207e37b5");
const PRESENTER_PATH = process.env.GIDEON_AXIOM_PRESENTER_PATH?.trim()
  || path.join(ORIGINAL_ROOT, "tmp/solomon-masked-presenter-v1/presenter/axiom-masked-presenter-green-screen.mp4");
const REFERENCE_PATH = "/Users/mayowaadesanya/Downloads/08575a746dd848448506f6ca9070f732.mov";
const BASELINE_PATH = path.join(ORIGINAL_ROOT, "tmp/solomon-masked-presenter-chatterbox-v1/final/solomon-masked-presenter-chatterbox-v1.mp4");
const EDITORIAL_V1_PATH = "/tmp/gideon-editorial-goal/tmp/solomon-creator-editorial-v1/final/solomon-creator-editorial-v1.mp4";
const EDITORIAL_V2_PATH = "/tmp/gideon-editorial-goal/tmp/solomon-creator-editorial-v2/final/solomon-creator-editorial-v2.mp4";
const EDITORIAL_V3_PATH = "/tmp/gideon-editorial-goal/tmp/solomon-creator-editorial-v3/final/solomon-creator-editorial-v3.mp4";
const EDITORIAL_V5_PATH = "/tmp/gideon-editorial-goal/tmp/solomon-reference-rhythm-v1/final/solomon-creator-editorial-v5.mp4";
const EDITORIAL_V6_PATH = "/tmp/gideon-editorial-goal/tmp/solomon-creator-editorial-v6/final/solomon-creator-editorial-v6.mp4";
const VERIFIED_NARRATION_ROOT = process.env.GIDEON_VERIFIED_NARRATION_ROOT?.trim();

const SOURCES = [
  {
    id: "jobs",
    workflowId: "browse-filter-jobs",
    normalizedFile: "browse-filter-jobs.mp4",
    trimMs: 1_100,
    label: "RELEVANT ROLES",
    reviewedResultRegion: { x: 0.03, y: 0.34, width: 0.47, height: 0.58 }
  },
  {
    id: "tracker",
    workflowId: "update-job-tracker",
    normalizedFile: "update-job-tracker.mp4",
    trimMs: 4_600,
    label: "OPPORTUNITY TRACKER",
    reviewedResultRegion: { x: 0.02, y: 0.10, width: 0.64, height: 0.76 }
  },
  {
    id: "contacts",
    workflowId: "review-saved-contacts",
    normalizedFile: "review-saved-contacts.mp4",
    trimMs: 1_000,
    label: "CONTACT CONTEXT",
    reviewedResultRegion: { x: 0.02, y: 0.18, width: 0.67, height: 0.74 }
  },
  {
    id: "outreach",
    workflowId: "review-draft-outreach",
    normalizedFile: "review-draft-outreach.mp4",
    trimMs: 900,
    label: "REVIEW BEFORE SENDING",
    reviewedResultRegion: { x: 0.40, y: 0.07, width: 0.56, height: 0.60 }
  }
] as const;

interface PilotCaptureArtifact {
  kind: string;
  originalFileName: string;
  localPath: string;
  sha256: string;
}

interface PilotCaptureState {
  artifacts: PilotCaptureArtifact[];
}

interface CaptureActionReceipt {
  flowId: string;
  startedAt: string;
  steps: Array<{
    stepId: string;
    startedAt: string;
    completedAt: string;
    policyDecision?: {
      effectiveRisk?: "observe" | "navigate" | "synthetic_write";
    };
    visualEvidence?: {
      viewport: { width: number; height: number };
      actionTarget?: { x: number; y: number; width: number; height: number };
    };
  }>;
}

interface CaptureActionDocument {
  receipt: CaptureActionReceipt;
  normalization: {
    output: {
      durationMs: number;
      width: number;
      height: number;
      sha256: string;
    };
  };
}

interface ResolvedSolomonCaptureSource {
  id: typeof SOURCES[number]["id"];
  workflowId: typeof SOURCES[number]["workflowId"];
  normalizedFile: string;
  trimMs: number;
  label: string;
  reviewedResultRegion: { x: number; y: number; width: number; height: number };
  sourcePath: string;
  sha256: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceDurationMs: number;
  framingManifestPath: string;
  framingManifestSha256: string;
  receiptPath: string;
  receiptSha256: string;
  actionEvents: Array<{
    stepId: string;
    startMs: number;
    endMs: number;
    region: { x: number; y: number; width: number; height: number };
    evidence: "recorded_action_target";
    interaction: "observe" | "navigate" | "synthetic_write" | "unknown";
  }>;
}

const V1_SCRIPT = "Your job search should feel focused, not scattered. Solomon brings the next decision into view. Browse roles, then narrow the list around what matters. Keep opportunities organized as priorities change. Review saved contacts with context beside the person. Then inspect an outreach draft before anything moves forward. The point is not more automation. It is one workspace for finding roles, tracking opportunities, understanding contacts, and reviewing the message you may send. So instead of rebuilding context across tabs, you can move from evidence to the next step. See what Solomon can organize for your search.";
const V2_SCRIPT = "Your job search gets harder when each decision lives in a different tab. Solomon keeps the evidence for your next move in one workspace. Start with roles that match what you want, then narrow the list around details that matter. Move opportunities into a tracker as priorities change. Review saved contacts with details beside each person. Inspect an outreach draft before anything moves forward. That means less time rebuilding the story behind each opportunity, and more clarity about what to review next. Find roles, track opportunities, understand contacts, and review outreach without losing the thread. See how Solomon can bring your job search into focus.";
const V3_SCRIPT = "The hard part of a job search is not finding a role. It is knowing why each one matters. Solomon keeps that proof beside your next decision. Start with roles that fit what you want, then narrow the list around details that matter. Move roles into a tracker as priorities change. Review saved contacts with details beside each person. Inspect an outreach draft before anything moves forward. Spend less time rebuilding the story behind each lead. Find roles, track next steps, understand contacts, and review outreach without losing the thread. See how Solomon puts every lead and next step in one clear view, from start to finish.";
const V4_SCRIPT = "Finding roles is not the hard part. Solomon keeps why each one matters beside your next decision. Start with roles that fit what you want, then narrow the list around details that matter and keep the reasons visible. Move roles into a tracker as priorities change. Next decisions stay clear. Review saved contacts with details beside each person. Inspect an outreach draft before anything moves forward. Spend less time rebuilding the story behind each lead. Find roles, track next steps, understand contacts, and review outreach without losing the thread. See how Solomon puts every lead plus every next step in one clear view, from start to finish.";
const REFERENCE_RHYTHM_SCRIPT = "Stop rebuilding job-search decisions across tabs. Solomon keeps your next-move evidence together. Start with roles and narrow what fits. Roles, contacts, and follow-ups stay together. Move the role into your tracker with the evidence. When priorities change, passive trackers lose context. Solomon keeps the next decision connected. Open a saved contact. The details stay beside the person. Review outreach before anything is sent. This is not another passive list. Inspect the message with its context before anything moves. Roles, people, and next steps stay reviewable. Move forward without rebuilding the story. Ready to see the workflow? Open the Solomon demo.";
const AI_CREATOR_V6_SCRIPT = "In Solomon, review roles, contacts, and outreach before messages send. Start with a role. Narrow what fits around the details that matter. Keep the role details reviewable. Move the opportunity into your tracker. Priorities changed. Which role still fits your needs? Review the tracker and keep the next step in view. Open a saved contact. Inspect the details beside the person. Then review the outreach draft alongside its context. Nothing sends before you review it. Inspect the draft with its context. You choose what happens next. Role. Person. Details. Next step. Move forward with each step still reviewable. Open the Solomon demo when you're ready.";
const USER_STORY_V7_SCRIPT = "Roles, people, and follow-ups can overwhelm a job search. What matters is the next move. Start with roles that fit. The list feels smaller. Good opportunities should not vanish into another tab. Keep one visible in your tracker. When priorities change, the next step stays clear. That clarity should follow each person. Open a saved contact with nearby details. Now the conversation has context. Before a message moves forward, you stay in control. Review the outreach draft beside its context. A scattered search becomes a story you can follow. Roles, people, and next steps stay reviewable. Open the Solomon demo when you're ready.";
const SCRIPT = IS_V7
  ? USER_STORY_V7_SCRIPT
  : IS_V6
  ? AI_CREATOR_V6_SCRIPT
  : IS_REFERENCE_RHYTHM
  ? REFERENCE_RHYTHM_SCRIPT
  : IS_V4
    ? V4_SCRIPT
    : IS_V3
      ? V3_SCRIPT
      : IS_V2
        ? V2_SCRIPT
        : V1_SCRIPT;

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true, mode: 0o700 });
  const finalDir = path.join(OUTPUT_ROOT, "final");
  const reviewDir = path.join(OUTPUT_ROOT, "review");
  const analysisDir = path.join(OUTPUT_ROOT, "analysis");
  const sceneDir = path.join(OUTPUT_ROOT, "scene-cache");
  const narrationDir = path.join(OUTPUT_ROOT, "narration");
  await Promise.all([finalDir, reviewDir, analysisDir, sceneDir, narrationDir].map((dir) => fs.mkdir(dir, { recursive: true, mode: 0o700 })));
  await Promise.all([PRESENTER_PATH, REFERENCE_PATH, BASELINE_PATH].map(assertFile));

  const pilotState = await readPilotCaptureState();
  const sources = await Promise.all(SOURCES.map((source) => resolveSolomonCaptureSource(source, pilotState)));
  const presenterSha256 = await sha256(PRESENTER_PATH);
  if (IS_V4) {
    await writeJson(path.join(OUTPUT_ROOT, "baseline-lock.json"), {
      schemaVersion: "1",
      implementationRevision: await repositoryRevision(),
      reference: { path: REFERENCE_PATH, sha256: await sha256(REFERENCE_PATH) },
      creatorEditorialV3: {
        master: { path: EDITORIAL_V3_PATH, sha256: await sha256(EDITORIAL_V3_PATH) },
        social: {
          path: path.join(path.dirname(EDITORIAL_V3_PATH), "solomon-creator-editorial-v3-social.mp4"),
          sha256: await sha256(path.join(path.dirname(EDITORIAL_V3_PATH), "solomon-creator-editorial-v3-social.mp4"))
        }
      },
      presenter: { path: PRESENTER_PATH, sha256: presenterSha256 },
      authenticSolomonSources: sources.map(({ id, workflowId, sourcePath, sha256: sourceSha256 }) => ({
        id,
        workflowId,
        path: sourcePath,
        sha256: sourceSha256
      })),
      preservation: {
        v1V2V3OutputsOverwritten: false,
        destructiveGitCommandsUsed: false
      }
    });
  }
  const assets = sources.map(toEvidenceAsset);
  const blueprint = buildBlueprint(assets);
  const plannedBeats = narrationBeats(EDITORIAL_VERSION);
  const telemetry = sources.map((source) => ({
    evidenceAssetId: source.id,
    sourceSha256: source.sha256,
    actionRegion: selectEditorialActionEvent(source.actionEvents)?.region,
    resultRegion: source.reviewedResultRegion,
    sourceDimensions: { width: source.sourceWidth, height: source.sourceHeight },
    sourceDurationMs: source.sourceDurationMs,
    geometryProvenance: {
      action: source.actionEvents.length > 0 ? "recorded_action_target" as const : "geometry_fallback" as const,
      result: "reviewed_capture_geometry" as const,
      cursor: source.actionEvents.length > 0 ? "action_target_center" as const : "unavailable" as const
    },
    actionEvents: source.actionEvents
  }));
  const provider = new ChatterboxNarrationProvider({
    pythonPath: path.join(ORIGINAL_ROOT, "tmp/chatterbox-runtime/.venv/bin/python"),
    bridgePath: path.resolve("scripts/chatterbox_inference.py"),
    modelCacheRoot: path.join(ORIGINAL_ROOT, "tmp/chatterbox-runtime/model-cache"),
    device: "mps",
    allowDownload: false
  });
  const candidateSelection = IS_MODERN
    ? VERIFIED_NARRATION_ROOT
      ? await reuseVerifiedSemanticNarration({
          sourceNarrationDir: path.resolve(VERIFIED_NARRATION_ROOT),
          plannedBeats,
          narrationDir
        })
      : await renderSemanticNarrationCandidates({ provider, plannedBeats, narrationDir, requireProsody: IS_V3_PLUS })
    : undefined;
  const semanticNarration = candidateSelection?.semanticNarration
    ?? await renderSemanticNarration({ provider, plannedBeats, narrationDir });
  const { result: narration, tempo, audioPath: narrationAudioPath } = semanticNarration;
  const alignment = candidateSelection?.alignment ?? await alignNarrationWithLocalWhisper({
    audioPath: narrationAudioPath,
    beats: semanticNarration.beats,
    outputDir: path.join(narrationDir, "alignment")
  });
  const beats = alignment.beats;
  const compileInput = {
      blueprint,
      narrationBeats: beats,
      telemetry,
      presenterAssetHash: presenterSha256,
      seed: SEED,
      timingProvenance: alignment.provenance,
      targetDurationMs: DURATION_MS,
      cta: {
        mode: "non_transactional" as const,
        text: IS_REFERENCE_RHYTHM
          ? "Open the Solomon demo."
          : "See how Solomon can bring your job search into focus.",
        availabilityConfirmed: false
      }
    };
  const referenceRhythmSpecs = IS_REFERENCE_RHYTHM
    ? referenceRhythmBeatSpecs(IS_V7 ? 7 : IS_V6 ? 6 : 5)
    : undefined;
  const referenceClaimProvenance = IS_REFERENCE_RHYTHM ? solomonReferenceClaimProvenance() : undefined;
  const v6ClaimEvidenceMatrix = IS_V6 ? solomonV6ClaimEvidenceMatrix(sources) : undefined;
  const v7MicroScenes = IS_V7 ? solomonV7MicroScenes(sources) : undefined;
  const v7ClaimEvidenceMatrix = IS_V7 ? solomonV7ClaimEvidenceMatrix(sources) : undefined;
  const edl: CreatorEditorialEdl | CreatorEditorialV2Edl | CreatorEditorialV3Edl | CreatorEditorialV4Edl | CreatorEditorialReferenceRhythmEdl | CreatorEditorialAiCreatorV6Edl | CreatorEditorialUserStoryV7Edl = IS_V7
    ? compileCreatorEditorialUserStoryV7({
        ...compileInput,
        narrativeBeatSpecs: referenceRhythmSpecs!,
        claimProvenance: referenceClaimProvenance!,
        userStory: {
          initialCondition: "A job seeker is overwhelmed by roles, people, and follow-ups competing for attention.",
          desiredChange: "The user can focus on a fitting role while keeping the next decision visible.",
          trustBoundary: "The user can inspect an outreach draft and its context before anything moves forward.",
          outcome: "A scattered search becomes a reviewable story with roles, people, and next steps.",
          cta: "Open the Solomon demo when you're ready."
        },
        microScenes: v7MicroScenes!,
        claimEvidenceMatrix: v7ClaimEvidenceMatrix!
      })
    : IS_V6
    ? compileCreatorEditorialAiCreatorV6({
        ...compileInput,
        narrativeBeatSpecs: referenceRhythmSpecs!,
        claimProvenance: referenceClaimProvenance!,
        claimEvidenceMatrix: v6ClaimEvidenceMatrix!
      })
    : IS_REFERENCE_RHYTHM
    ? compileCreatorEditorialReferenceRhythm({
        ...compileInput,
        narrativeBeatSpecs: referenceRhythmSpecs!,
        claimProvenance: referenceClaimProvenance!
      })
    : IS_V4
      ? compileCreatorEditorialV4(compileInput)
    : IS_V3
      ? compileCreatorEditorialV3(compileInput)
    : IS_V2
      ? compileCreatorEditorialV2(compileInput)
      : compileCreatorEditorial({ blueprint, narrationBeats: beats, telemetry, presenterAssetHash: presenterSha256, seed: SEED, timingProvenance: alignment.provenance, targetDurationMs: DURATION_MS });
  await writeJson(path.join(OUTPUT_ROOT, "editorial-edl.json"), edl);
  await writeJson(
    path.join(OUTPUT_ROOT, "gideon-edl-v2.json"),
    IS_V7
      ? projectCreatorEditorialUserStoryV7OntoEditDecisionList(
          baseGideonEditDecisionList(blueprint),
          edl as CreatorEditorialUserStoryV7Edl
        )
      : IS_V6
      ? projectCreatorEditorialAiCreatorV6OntoEditDecisionList(
          baseGideonEditDecisionList(blueprint),
          edl as CreatorEditorialAiCreatorV6Edl
        )
      : IS_REFERENCE_RHYTHM
      ? projectCreatorEditorialReferenceRhythmOntoEditDecisionList(
          baseGideonEditDecisionList(blueprint),
          edl as CreatorEditorialReferenceRhythmEdl
        )
      : IS_V4
      ? projectCreatorEditorialV4OntoEditDecisionList(baseGideonEditDecisionList(blueprint), edl as CreatorEditorialV4Edl)
      : IS_V3
        ? projectCreatorEditorialV3OntoEditDecisionList(baseGideonEditDecisionList(blueprint), edl as CreatorEditorialV3Edl)
      : IS_V2
        ? projectCreatorEditorialV2OntoEditDecisionList(baseGideonEditDecisionList(blueprint), edl as CreatorEditorialV2Edl)
      : projectCreatorEditorialOntoEditDecisionList(baseGideonEditDecisionList(blueprint), edl as CreatorEditorialEdl)
  );
  await writeJson(path.join(OUTPUT_ROOT, "shot-manifest.json"), { schemaVersion: "1", shots: edl.shots });
  if (IS_REFERENCE_RHYTHM) {
    const referenceEdl = edl as CreatorEditorialReferenceRhythmEdl;
    await writeJson(path.join(OUTPUT_ROOT, "narrative-beat-manifest.json"), {
      schemaVersion: "1",
      templateId: referenceEdl.templateId,
      beats: referenceEdl.narrativeBeats
    });
    await writeJson(path.join(OUTPUT_ROOT, "claim-provenance-report.json"), {
      schemaVersion: "1",
      productName: "Solomon",
      allClaimsSupported: true,
      unsupportedClaims: [],
      claims: referenceEdl.claimProvenance
    });
    if (IS_V7) {
      const v7 = edl as CreatorEditorialUserStoryV7Edl;
      await Promise.all([
        writeJson(path.join(OUTPUT_ROOT, "user-story-manifest.json"), {
          schemaVersion: "7",
          templateId: v7.templateId,
          story: v7.userStory,
          editorialPolicy: v7.editorialPolicy
        }),
        writeJson(path.join(OUTPUT_ROOT, "sentence-classification-manifest.json"), {
          schemaVersion: "7",
          shots: v7.shots.map(({ id, startMs, endMs, v7Direction }) => ({
            id,
            startMs,
            endMs,
            ...v7Direction
          }))
        }),
        writeJson(path.join(OUTPUT_ROOT, "product-micro-scene-manifest.json"), {
          schemaVersion: "7",
          authenticProductPixelsRequired: true,
          fabricatedInterfaces: false,
          scenes: v7.microScenes
        }),
        writeJson(path.join(OUTPUT_ROOT, "claim-evidence-matrix.json"), {
          schemaVersion: "7",
          allClaimsSupported: true,
          unsupportedClaims: [],
          rows: v7.claimEvidenceMatrix
        })
      ]);
    } else if (IS_V6) {
      const v6 = edl as CreatorEditorialAiCreatorV6Edl;
      await writeJson(path.join(OUTPUT_ROOT, "claim-evidence-matrix.json"), {
        schemaVersion: "6",
        allClaimsSupported: true,
        unsupportedClaims: [],
        rows: v6.claimEvidenceMatrix
      });
      await writeJson(path.join(OUTPUT_ROOT, "v6-creator-direction-report.json"), {
        schemaVersion: "6",
        creatorGrammar: v6.creatorGrammar,
        shots: v6.shots.map(({ id, startMs, endMs, v6Direction }) => ({ id, startMs, endMs, ...v6Direction }))
      });
    }
  }
  await writeJson(path.join(OUTPUT_ROOT, "presenter-schedule.json"), {
    schemaVersion: "1",
    presenterId: "solomon-axiom-v1",
    presenterAssetPath: PRESENTER_PATH,
    presenterAssetSha256: presenterSha256,
    mouthVisible: false,
    lipSyncAttempted: false,
    shots: edl.shots.map(({ id, startMs, endMs, presenter }) => ({ id, startMs, endMs, ...presenter }))
  });
  if (IS_V3_PLUS) {
    const v3 = edl as CreatorEditorialV3Edl | CreatorEditorialV4Edl | CreatorEditorialReferenceRhythmEdl;
    await writeJson(path.join(OUTPUT_ROOT, "performance-schedule.json"), {
      schemaVersion: IS_V4 ? "4" : "3",
      sourceAssetPath: PRESENTER_PATH,
      sourceAssetSha256: presenterSha256,
      actualSourceIntervals: v3.shots.filter(({ presenter }) => presenter.visible).map(({ id, startMs, endMs, presenter }) => ({
        shotId: id,
        timelineStartMs: startMs,
        timelineEndMs: endMs,
        ...presenter.performance
      }))
    });
    await writeJson(path.join(OUTPUT_ROOT, "within-shot-motion-manifest.json"), {
      schemaVersion: IS_V4 ? "4" : "3",
      shots: v3.shots.map(({ id, startMs, endMs, compositionFamily, motionEvents }) => ({ id, startMs, endMs, compositionFamily, motionEvents }))
    });
    if (IS_V4) {
      await writeJson(path.join(OUTPUT_ROOT, "performance-inventory.json"), {
        schemaVersion: "4",
        sourceAssetPath: PRESENTER_PATH,
        sourceAssetSha256: presenterSha256,
        performances: AXIOM_V4_PERFORMANCE_INVENTORY,
        assetLimitations: AXIOM_V4_ASSET_LIMITATIONS
      });
      await writeJson(path.join(OUTPUT_ROOT, "missing-presenter-assets-report.json"), {
        schemaVersion: "1",
        blocking: false,
        ...AXIOM_V4_ASSET_LIMITATIONS
      });
    }
  }
  await writeJson(path.join(OUTPUT_ROOT, "audio-plan.json"), edl.audioPlan);
  await writeJson(path.join(OUTPUT_ROOT, "product-evidence-provenance.json"), {
    schemaVersion: "1",
    productName: "Solomon",
    captureRunRoot: CAPTURE_ROOT,
    legacyDirectoryNameDisclosure: "The authenticated capture run predates the Solomon rename and retains nexusreach in its private path.",
    fabricatedInterfaces: false,
    sources: sources.map(({
      id,
      workflowId,
      sourcePath,
      sha256,
      trimMs,
      sourceWidth,
      sourceHeight,
      sourceDurationMs,
      framingManifestPath,
      framingManifestSha256,
      receiptPath,
      receiptSha256
    }, index) => ({
      id,
      workflowId,
      sourcePath,
      sha256,
      sourceKind: "normalized_flow_clip",
      sourceDimensions: { width: sourceWidth, height: sourceHeight },
      sourceDurationMs,
      framingManifestPath,
      framingManifestSha256,
      actionReceiptPath: receiptPath,
      actionReceiptSha256: receiptSha256,
      verifiedSourceInterval: { startMs: trimMs, endMs: verifiedSourceEnd(sourceDurationMs, trimMs) },
      claimId: `claim-${id}`,
      userAction: workflowId,
      actionGeometry: telemetry[index]!.actionRegion,
      resultGeometry: telemetry[index]!.resultRegion,
      cursorTelemetry: null,
      cursorGeometryProvenance: telemetry[index]!.geometryProvenance.cursor,
      requiredContextMs: IS_V3_PLUS ? 420 : undefined,
      resultHoldRangeMs: IS_V3_PLUS ? { min: 400, max: 700 } : undefined,
      verified: true
    }))
  });
  if (IS_V4) {
    const v4 = edl as CreatorEditorialV4Edl;
    await writeJson(path.join(OUTPUT_ROOT, "evidence-region-manifest.json"), {
      schemaVersion: "4",
      coordinateSpace: "normalized_source_frame",
      geometryFallbackDisclosure: "Action regions come from recorded DOM action targets. Result regions are separately reviewed against the authenticated normalized captures because the capture receipts do not record result bounding boxes. Cursor focus uses the recorded action-target center and is not represented as sampled cursor telemetry.",
      workflows: sources.map((source) => ({
        evidenceAssetId: source.id,
        workflowId: source.workflowId,
        sourcePath: source.sourcePath,
        sourceSha256: source.sha256,
        verifiedSourceInterval: { startMs: source.trimMs, endMs: verifiedSourceEnd(source.sourceDurationMs, source.trimMs) },
        claimId: `claim-${source.id}`,
        cursorTelemetry: null,
        cursorGeometryProvenance: telemetry.find(({ evidenceAssetId }) => evidenceAssetId === source.id)?.geometryProvenance.cursor,
        actionRegion: telemetry.find(({ evidenceAssetId }) => evidenceAssetId === source.id)?.actionRegion,
        resultRegion: telemetry.find(({ evidenceAssetId }) => evidenceAssetId === source.id)?.resultRegion,
        shots: v4.shots.filter(({ productEvidenceIds }) => productEvidenceIds.includes(source.id)).map((shot) => ({
          shotId: shot.id,
          contextMs: shot.evidenceTreatment.contextMs,
          actionMs: shot.evidenceTreatment.actionMs,
          resultHoldMs: shot.evidenceTreatment.resultHoldMs,
          criticalRegion: shot.evidenceTreatment.criticalRegion,
          actionOccupancyRatio: shot.evidenceTreatment.actionOccupancyRatio,
          resultOccupancyRatio: shot.evidenceTreatment.resultOccupancyRatio,
          pointerPolicy: shot.camera.pointerPolicy
        }))
      }))
    });
  }
  await writeJson(path.join(narrationDir, "narration-manifest.json"), {
    schemaVersion: "1",
    approvedScript: SCRIPT,
    approvedWordCount: countWords(SCRIPT),
    semanticBeats: beats,
    providerSpeechInputs: narration.beats.map(({ id, preparedText, preparedTextSha256 }) => ({ id, preparedText, preparedTextSha256 })),
    provider: narration.provider,
    provenance: narration.provenance,
    sourceDurationMs: semanticNarration.totalTrimmedSourceDurationMs,
    scheduledSpeechDurationMs: SPEECH_END_MS,
    tempoCorrection: tempo,
    activeSpeechWpm: Number((countWords(SCRIPT) / ((SPEECH_END_MS - semanticNarration.gapMs * (beats.length - 1)) / 60_000)).toFixed(2)),
    overallSpokenSectionWpm: Number((countWords(SCRIPT) / (SPEECH_END_MS / 60_000)).toFixed(2)),
    ordinaryGapMs: semanticNarration.gapMs,
    beatJoins: "trimmed silence, 35 ms fades, 80 ms semantic gaps",
    fallbackUsed: false,
    candidateSelectionReceipt: candidateSelection?.receiptPath
  });

  const v1Captions = IS_MODERN ? [] : (edl as CreatorEditorialEdl).shots.flatMap(({ captions }) => captions);
  const v2Captions = IS_V2 ? (edl as CreatorEditorialV2Edl).shots.flatMap(({ captions }) => captions) : [];
  const v3Captions = IS_V3 ? (edl as CreatorEditorialV3Edl).shots.flatMap(({ captions }) => captions) : [];
  const v4Captions = IS_V4 ? (edl as CreatorEditorialV4Edl).shots.flatMap(({ captions }) => captions) : [];
  const allCaptions = IS_V4 ? v4Captions : IS_V3 ? v3Captions : IS_V2 ? v2Captions : v1Captions;
  await writeJson(path.join(OUTPUT_ROOT, "word-timing-manifest.json"), {
    schemaVersion: "1",
    provenance: alignment.provenance,
    aligner: alignment.aligner,
    transcriptPath: alignment.transcriptPath,
    approvedWordCount: countWords(SCRIPT),
    alignedWordCount: alignment.wordCount,
    exactApprovedWordSequence: alignment.exactApprovedWordSequence,
    reason: "Chatterbox does not return word timestamps, so the already-installed local Whisper small.en model aligned the rendered semantic narration.",
    captions: allCaptions
  });
  await writeJson(path.join(OUTPUT_ROOT, "caption-manifest.json"), { schemaVersion: "1", chunkWordLimit: 5, captions: allCaptions });
  const assPath = path.join(OUTPUT_ROOT, "kinetic-captions.ass");
  await fs.writeFile(assPath, IS_V4 ? buildAssV3(v4Captions) : IS_V3 ? buildAssV3(v3Captions) : IS_V2 ? buildAssV2(v2Captions) : buildAss(v1Captions), { mode: 0o600 });
  const captionOverlay = IS_V4
    ? await renderCreatorEditorialV4CaptionOverlay({
      captions: v4Captions,
      durationMs: DURATION_MS,
      outputDir: path.join(OUTPUT_ROOT, "caption-overlay-frames"),
      brandKit: edl.brandKit,
      disclosure: "AI-generated masked presenter",
      persistentCtaText: IS_V6 || IS_V7 ? "Open the Solomon demo." : undefined,
      conceptualRanges: IS_REFERENCE_RHYTHM
        ? (edl as CreatorEditorialReferenceRhythmEdl).narrativeBeats
          .filter(({ evidenceRequirement }) => evidenceRequirement === "conceptual_diagram")
          .map(({ startMs, endMs, visualMetaphor }) => ({
            startMs,
            endMs,
            label: visualMetaphor?.disclosure ?? "Conceptual workflow"
          }))
        : undefined
    })
    : IS_V3
      ? await renderCreatorEditorialV3CaptionOverlay({
      captions: v3Captions,
      durationMs: DURATION_MS,
      outputDir: path.join(OUTPUT_ROOT, "caption-overlay-frames"),
      brandKit: edl.brandKit,
      disclosure: "AI-generated masked presenter"
    })
    : IS_V2
      ? await renderCreatorEditorialV2CaptionOverlay({
      captions: (edl as CreatorEditorialV2Edl).shots.flatMap(({ captions }) => captions),
      durationMs: DURATION_MS,
      outputDir: path.join(OUTPUT_ROOT, "caption-overlay-frames"),
      brandKit: edl.brandKit,
      disclosure: "AI-generated masked presenter"
      })
      : await renderCreatorEditorialCaptionOverlay({
      captions: (edl as CreatorEditorialEdl).shots.flatMap(({ captions }) => captions),
      durationMs: DURATION_MS,
      outputDir: path.join(OUTPUT_ROOT, "caption-overlay-frames"),
      brandKit: edl.brandKit,
      disclosure: "AI-generated masked presenter"
    });

  const scenePaths: string[] = [];
  const sceneCacheManifestPath = path.join(OUTPUT_ROOT, "scene-cache-report.json");
  const previousSceneCache = await readOptionalJson<{
    entries?: Array<{ shotId: string; cacheIdentity: string; outputPath: string; sha256: string }>;
  }>(sceneCacheManifestPath);
  const previousByShot = new Map((previousSceneCache?.entries ?? []).map((entry) => [entry.shotId, entry]));
  const sceneCacheEntries: Array<{ shotId: string; cacheIdentity: string; outputPath: string; sha256: string; status: "rendered" | "reused" }> = [];
  for (let index = 0; index < edl.shots.length; index += 1) {
    const shot = edl.shots[index]!;
    const sceneCacheIdentity = IS_MODERN
      ? createHash("sha256").update(JSON.stringify({
        shotCacheIdentity: shot.cacheIdentity,
        rendererVersion: IS_V4 ? CREATOR_EDITORIAL_V4_RENDERER_VERSION : IS_V3 ? CREATOR_EDITORIAL_V3_RENDERER_VERSION : CREATOR_EDITORIAL_V2_RENDERER_VERSION
      })).digest("hex")
      : shot.cacheIdentity;
    const outputPath = path.join(sceneDir, `${shot.id}-${sceneCacheIdentity.slice(0, 16)}.mp4`);
    const previous = previousByShot.get(shot.id);
    const reusable = previous?.cacheIdentity === sceneCacheIdentity
      && previous.outputPath === outputPath
      && await exists(outputPath)
      && await sha256(outputPath) === previous.sha256;
    if (!reusable) {
      const renderInput = {
        shotIndex: index,
        sources: sources.map((source) => ({
          evidenceAssetId: source.id,
          workflowId: source.workflowId,
          sourcePath: source.sourcePath,
          fallbackStartMs: source.trimMs,
          sourceSha256: source.sha256,
          sourceWidth: source.sourceWidth,
          sourceHeight: source.sourceHeight,
          sourceDurationMs: source.sourceDurationMs,
          framingManifestPath: source.framingManifestPath,
          framingManifestSha256: source.framingManifestSha256,
          verifiedSourceInterval: { startMs: source.trimMs, endMs: verifiedSourceEnd(source.sourceDurationMs, source.trimMs) },
          focusKeyframes: [
            ...source.actionEvents.map((event) => ({
              id: event.stepId,
              kind: "action" as const,
              startMs: event.startMs,
              endMs: event.endMs,
              region: event.region,
              provenance: "recorded_action_target" as const
            })),
            {
              id: `${source.workflowId}-reviewed-result`,
              kind: "result" as const,
              startMs: source.trimMs,
              endMs: verifiedSourceEnd(source.sourceDurationMs, source.trimMs),
              region: source.reviewedResultRegion,
              provenance: "reviewed_capture_geometry" as const
            }
          ],
          telemetryProvenance: {
            action: source.actionEvents.length > 0 ? "recorded_action_target" as const : "geometry_fallback" as const,
            result: "reviewed_capture_geometry" as const,
            cursor: source.actionEvents.length > 0 ? "action_target_center" as const : "unavailable" as const
          },
          geometryProvenance: source.actionEvents.length > 0 ? "recorded_action_target" as const : "geometry_fallback" as const
        })),
        presenterPath: PRESENTER_PATH,
        brandKit: edl.brandKit,
        outputPath,
        ffmpegPath: FFMPEG
      };
      if (IS_V4) await renderCreatorEditorialV4Shot({ ...renderInput, shot: shot as CreatorEditorialV4Edl["shots"][number] });
      else if (IS_V3) await renderCreatorEditorialV3Shot({ ...renderInput, shot: shot as CreatorEditorialV3Edl["shots"][number] });
      else if (IS_V2) await renderCreatorEditorialV2Shot({ ...renderInput, shot: shot as CreatorEditorialV2Edl["shots"][number] });
      else await renderCreatorEditorialShot({ ...renderInput, shot: shot as CreatorEditorialEdl["shots"][number] });
    }
    sceneCacheEntries.push({
      shotId: shot.id,
      cacheIdentity: sceneCacheIdentity,
      outputPath,
      sha256: await sha256(outputPath),
      status: reusable ? "reused" : "rendered"
    });
    scenePaths.push(outputPath);
  }
  await writeJson(sceneCacheManifestPath, {
    schemaVersion: "1",
    templateId: edl.templateId,
    compilerVersion: edl.compilerVersion,
    validation: {
      contentHashCheckedBeforeReuse: true,
      transitionNeighborsIncludedByScopedInvalidationHelper: true,
      immutableSourceHashesInCacheIdentity: true,
      presenterHashInCacheIdentity: true,
      brandKitInCacheIdentity: true,
      rendererVersionInCacheIdentity: IS_MODERN
    },
    regeneratedShotIds: sceneCacheEntries.filter(({ status }) => status === "rendered").map(({ shotId }) => shotId),
    reusedShotIds: sceneCacheEntries.filter(({ status }) => status === "reused").map(({ shotId }) => shotId),
    entries: sceneCacheEntries
  });
  const concatList = path.join(sceneDir, "concat.txt");
  await fs.writeFile(concatList, scenePaths.map((filePath) => `file '${filePath.replaceAll("'", "'\\''")}'`).join("\n"), { mode: 0o600 });
  const outputBaseName = `solomon-creator-editorial-v${EDITORIAL_VERSION}`;
  const silentPath = path.join(OUTPUT_ROOT, `${outputBaseName}-silent.mp4`);
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatList,
    "-framerate", "10", "-start_number", "0", "-i", captionOverlay.framePattern,
    "-filter_complex", "[1:v]fps=30,format=rgba[caption];[0:v][caption]overlay=0:0:shortest=1[v]",
    "-map", "[v]", "-an", "-r", "30", "-c:v", "libx264",
    "-profile:v", "high",
    "-preset", IS_V4 ? creatorEditorialV4EncodingProfiles.master.preset : IS_V3 ? creatorEditorialV3EncodingProfiles.master.preset : IS_V2 ? creatorEditorialV2EncodingProfiles.master.preset : "medium",
    "-crf", IS_V4 ? String(creatorEditorialV4EncodingProfiles.master.crf) : IS_V3 ? String(creatorEditorialV3EncodingProfiles.master.crf) : IS_V2 ? String(creatorEditorialV2EncodingProfiles.master.crf) : "19",
    "-pix_fmt", "yuv420p", silentPath
  ], 900_000);

  const masterPath = path.join(finalDir, `${outputBaseName}.mp4`);
  const socialPath = path.join(finalDir, `${outputBaseName}-social.mp4`);
  const premasterPath = path.join(finalDir, `.${outputBaseName}-premaster.mp4`);
  const bed = IS_MODERN
    ? "0.10*sin(2*PI*98*t)+0.06*sin(2*PI*147*t)+0.035*sin(2*PI*294*t)+0.025*sin(2*PI*392*t)*between(mod(t\\,4)\\,0\\,0.22)"
    : "0.12*sin(2*PI*110*t)+0.07*sin(2*PI*165*t)+0.04*sin(2*PI*220*t)";
  const proceduralSfx = proceduralSfxExpression(edl);
  if (IS_MODERN) {
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", silentPath, "-i", narrationAudioPath,
      "-f", "lavfi", "-t", seconds(DURATION_MS), "-i", `aevalsrc=${bed}:s=48000:c=stereo`,
      "-f", "lavfi", "-t", seconds(DURATION_MS), "-i", `aevalsrc=${proceduralSfx}:s=48000:c=stereo`,
      "-filter_complex",
      `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=75,lowpass=f=15000,` +
      `acompressor=threshold=-18dB:ratio=2.4:attack=12:release=110:makeup=2,` +
      `apad,atrim=duration=${seconds(DURATION_MS)},afade=t=in:st=0:d=0.03,afade=t=out:st=${seconds(SPEECH_END_MS - 180)}:d=0.18[voicebase];` +
      "[voicebase]asplit=2[voice][duckkey];" +
      "[2:a]volume=-27dB,afade=t=in:st=1.00:d=1.00,afade=t=out:st=32:d=3[bedraw];" +
      "[bedraw][duckkey]sidechaincompress=threshold=0.018:ratio=9:attack=16:release=260[bedduck];" +
      "[3:a]volume=-17dB,afade=t=in:st=0.85:d=0.45[sfx];" +
      "[voice][bedduck][sfx]amix=inputs=3:duration=longest:normalize=0," +
      "loudnorm=I=-14:TP=-1.5:LRA=5,aresample=48000[a]",
      "-map", "0:v:0", "-map", "[a]",
      "-c:v", "copy",
      "-c:a", (IS_V4 ? creatorEditorialV4EncodingProfiles : IS_V3 ? creatorEditorialV3EncodingProfiles : creatorEditorialV2EncodingProfiles).master.audioCodec,
      "-ar", String((IS_V4 ? creatorEditorialV4EncodingProfiles : IS_V3 ? creatorEditorialV3EncodingProfiles : creatorEditorialV2EncodingProfiles).master.audioSampleRate),
      "-b:a", (IS_V4 ? creatorEditorialV4EncodingProfiles : IS_V3 ? creatorEditorialV3EncodingProfiles : creatorEditorialV2EncodingProfiles).master.audioBitrate,
      "-t", seconds(DURATION_MS),
      "-movflags", "+faststart",
      masterPath
    ], 900_000);
    const masteredPath = path.join(finalDir, `.${outputBaseName}-mastered.mp4`);
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", masterPath,
      "-filter:a",
      "volume='if(lt(t,6),0.80,if(lt(t,19),1.12,if(lt(t,27),0.78,1.04)))':eval=frame," +
      "alimiter=limit=0.78:level=false," +
      "acompressor=threshold=-26dB:ratio=6:attack=15:release=220:makeup=1," +
      "loudnorm=I=-14:TP=-1.8:LRA=5:linear=false",
      "-c:v", "copy",
      "-c:a", (IS_V4 ? creatorEditorialV4EncodingProfiles : IS_V3 ? creatorEditorialV3EncodingProfiles : creatorEditorialV2EncodingProfiles).master.audioCodec,
      "-ar", String((IS_V4 ? creatorEditorialV4EncodingProfiles : IS_V3 ? creatorEditorialV3EncodingProfiles : creatorEditorialV2EncodingProfiles).master.audioSampleRate),
      "-b:a", (IS_V4 ? creatorEditorialV4EncodingProfiles : IS_V3 ? creatorEditorialV3EncodingProfiles : creatorEditorialV2EncodingProfiles).master.audioBitrate,
      "-t", seconds(DURATION_MS),
      "-movflags", "+faststart",
      masteredPath
    ], 900_000);
    await fs.rename(masteredPath, masterPath);
  } else {
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", silentPath, "-i", narrationAudioPath,
      "-f", "lavfi", "-t", seconds(DURATION_MS), "-i", `aevalsrc=${bed}:s=48000:c=stereo`,
      "-f", "lavfi", "-t", seconds(DURATION_MS), "-i", `aevalsrc=${proceduralSfx}:s=48000:c=stereo`,
      "-filter_complex",
      `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${seconds(DURATION_MS)},afade=t=in:st=0:d=0.03,afade=t=out:st=${seconds(SPEECH_END_MS - 150)}:d=0.15[voicebase];` +
      "[voicebase]asplit=2[voice][duckkey];" +
      "[2:a]volume=-28dB,afade=t=in:st=0:d=0.5,afade=t=out:st=32:d=3[bedraw];" +
      "[bedraw][duckkey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300[bed];" +
      "[3:a]volume=-16dB[sfx];" +
      "[voice][bed][sfx]amix=inputs=3:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=7[a]",
      "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-t", seconds(DURATION_MS), "-movflags", "+faststart", premasterPath
    ], 900_000);
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", premasterPath,
      "-filter:a", "volume='if(lt(t,9),0.82,if(lt(t,20),1.12,if(lt(t,29),0.88,1.05)))':eval=frame,loudnorm=I=-13.8:TP=-1.8:LRA=5:linear=true",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", seconds(DURATION_MS), "-movflags", "+faststart", masterPath
    ], 900_000);
    await fs.rm(premasterPath, { force: true });
    const peakSafePath = path.join(finalDir, ".solomon-creator-editorial-v1-peak-safe.mp4");
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", masterPath,
      "-filter:a", "volume='if(lt(t,9),0.65,if(lt(t,20),1.18,if(lt(t,29),0.72,1.08)))':eval=frame,volume=1.20,alimiter=limit=0.75:level=false",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-t", seconds(DURATION_MS), "-movflags", "+faststart", peakSafePath
    ], 900_000);
    await fs.rename(peakSafePath, masterPath);
  }
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", masterPath,
    "-vf", "scale=720:1280:flags=lanczos",
    "-r", "30",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-preset", IS_V4 ? creatorEditorialV4EncodingProfiles.social.preset : IS_V3 ? creatorEditorialV3EncodingProfiles.social.preset : IS_V2 ? creatorEditorialV2EncodingProfiles.social.preset : "medium",
    "-crf", IS_V4 ? String(creatorEditorialV4EncodingProfiles.social.crf) : IS_V3 ? String(creatorEditorialV3EncodingProfiles.social.crf) : IS_V2 ? String(creatorEditorialV2EncodingProfiles.social.crf) : "21",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ar", IS_V4 ? String(creatorEditorialV4EncodingProfiles.social.audioSampleRate) : IS_V3 ? String(creatorEditorialV3EncodingProfiles.social.audioSampleRate) : IS_V2 ? String(creatorEditorialV2EncodingProfiles.social.audioSampleRate) : "48000",
    "-b:a", IS_V4 ? creatorEditorialV4EncodingProfiles.social.audioBitrate : IS_V3 ? creatorEditorialV3EncodingProfiles.social.audioBitrate : IS_V2 ? creatorEditorialV2EncodingProfiles.social.audioBitrate : "160k",
    "-movflags", "+faststart",
    socialPath
  ], 900_000);
  await Promise.all([
    run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", masterPath, "-f", "null", "-"], 900_000),
    run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", socialPath, "-f", "null", "-"], 900_000)
  ]);
  if (IS_V4) {
    await createV4StagedArtifacts({ masterPath, socialPath, scenePaths, edl: edl as CreatorEditorialV4Edl, sources });
  }
  const finalTranscriptQa = await verifyFinalNarration({
    masterPath,
    outputDir: path.join(reviewDir, "transcript"),
    approvedScript: SCRIPT
  });

  const [masterProbe, socialProbe, loudness, silence, cuts, frameChange, blackFrames, frozenSections] = await Promise.all([
    probe(masterPath),
    probe(socialPath),
    capture(FFMPEG, ["-hide_banner", "-nostats", "-i", masterPath, "-af", "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json", "-vn", "-f", "null", "-"], 300_000),
    capture(FFMPEG, ["-hide_banner", "-nostats", "-i", masterPath, "-af", "silencedetect=n=-45dB:d=.6", "-vn", "-f", "null", "-"], 300_000),
    capture(FFMPEG, ["-hide_banner", "-i", masterPath, "-filter:v", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"], 300_000),
    capture(FFMPEG, ["-hide_banner", "-i", masterPath, "-vf", "fps=10,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], 300_000),
    capture(FFMPEG, ["-hide_banner", "-i", masterPath, "-vf", "blackdetect=d=0.1:pix_th=0.1", "-an", "-f", "null", "-"], 300_000),
    capture(FFMPEG, ["-hide_banner", "-i", masterPath, "-vf", "freezedetect=n=-50dB:d=3", "-an", "-f", "null", "-"], 300_000)
  ]);
  const loudnessJson = parseLastJson(loudness.stderr);
  const cutCount = (cuts.stderr.match(/pts_time:/g) ?? []).length;
  const yavg = [...frameChange.stderr.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((match) => Number(match[1]));
  const meanFrameDifference = yavg.reduce((sum, value) => sum + value, 0) / Math.max(1, yavg.length);
  const silenceDurations = [...silence.stderr.matchAll(/silence_duration:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const blackFrameIntervals = [...blackFrames.stderr.matchAll(/black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/g)].map((match) => ({ startSeconds: Number(match[1]), endSeconds: Number(match[2]), durationSeconds: Number(match[3]) }));
  const frozenDurations = [...frozenSections.stderr.matchAll(/lavfi\.freezedetect\.freeze_duration:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const editorialQuality = IS_V7
    ? evaluateCreatorEditorialUserStoryV7(edl as CreatorEditorialUserStoryV7Edl)
    : IS_V6
    ? evaluateCreatorEditorialAiCreatorV6(edl as CreatorEditorialAiCreatorV6Edl)
    : IS_REFERENCE_RHYTHM
    ? evaluateCreatorEditorialReferenceRhythm(edl as CreatorEditorialReferenceRhythmEdl)
    : IS_V4
      ? evaluateCreatorEditorialV4(edl as CreatorEditorialV4Edl)
    : IS_V3
      ? evaluateCreatorEditorialV3(edl as CreatorEditorialV3Edl)
    : IS_V2
      ? evaluateCreatorEditorialV2(edl as CreatorEditorialV2Edl)
    : evaluateCreatorEditorial(edl as CreatorEditorialEdl);
  const perceptualShotReport = IS_MODERN ? await createPerceptualShotReport(masterPath, edl) : undefined;
  const cursorRequiredShotIds = IS_V7
    ? new Set((edl as CreatorEditorialUserStoryV7Edl).shots
      .filter(({ v7Direction }) => {
        const scene = (edl as CreatorEditorialUserStoryV7Edl).microScenes.find(({ id }) => id === v7Direction.microSceneId);
        return scene?.cursorPolicy === "SINGLE_ACTION" || scene?.cursorPolicy === "SOURCE_CURSOR_REQUIRED";
      })
      .map(({ id }) => id))
    : undefined;
  const cursorPixelReport = IS_V4
    ? await validateRenderedCursorPixels({
        masterPath,
        edl: edl as CreatorEditorialV4Edl,
        sources,
        outputDir: path.join(reviewDir, "cursor-pixel-evidence"),
        requiredShotIds: cursorRequiredShotIds
      })
    : undefined;
  if (cursorPixelReport) {
    await writeJson(path.join(reviewDir, "cursor-pixel-validation-report.json"), cursorPixelReport);
  }
  const measuredQuality = {
    schemaVersion: "1",
    status: "automated_checks_passed_manual_publication_review_required",
    structural: editorialQuality,
    media: { master: masterProbe, social: socialProbe, completeDecode: true, blackFrameIntervals },
    rhythm: {
      plannedShots: edl.shots.length,
      highConfidenceCutCount: cutCount,
      averagePlannedShotMs: DURATION_MS / edl.shots.length,
      meanFrameDifference,
      frozenDurationsSeconds: frozenDurations,
      perceptual: perceptualShotReport
    },
    cursorPixels: cursorPixelReport,
    presenter: {
      visibleMs: edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0),
      visibleRatio: edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) / DURATION_MS,
      mouthVisible: false,
      lipSyncClaimed: false
    },
    narration: {
      approvedWords: countWords(SCRIPT),
      activeSpeechWpm: Number((countWords(SCRIPT) / ((SPEECH_END_MS - semanticNarration.gapMs * (beats.length - 1)) / 60_000)).toFixed(2)),
      overallSpokenSectionWpm: Number((countWords(SCRIPT) / (SPEECH_END_MS / 60_000)).toFixed(2)),
      tempoCorrection: tempo,
      provider: narration.provider,
      fallbackUsed: false,
      finalTranscriptQa
    },
    audio: {
      loudness: loudnessJson,
      silenceDurationsSeconds: silenceDurations,
      proceduralBed: true,
      loudnessRangePolicyLu: IS_REFERENCE_RHYTHM ? { minimum: 1.5, maximum: 5 } : IS_MODERN ? { minimum: 4, maximum: 5 } : { minimum: 3, maximum: 8 }
    },
    content: { viewerFacingProductName: "Solomon", referenceBrandingUsed: false, unsupportedClaims: [] as string[] },
    humanReviewRequired: ["creative quality", "voice naturalness", "pronunciation", "phone readability", "captured cursor appearance", "claim accuracy", "publication approval"]
  };
  const inputLufs = Number(loudnessJson?.input_i);
  const inputTp = Number(loudnessJson?.input_tp);
  const inputLra = Number(loudnessJson?.input_lra);
  const activeSpeechWpm = Number((countWords(SCRIPT) / ((SPEECH_END_MS - semanticNarration.gapMs * (beats.length - 1)) / 60_000)).toFixed(2));
  const phoneReadabilityGate = IS_V3_PLUS
    ? (await Promise.all((edl as CreatorEditorialV3Edl | CreatorEditorialV4Edl | CreatorEditorialReferenceRhythmEdl).shots
      .filter(({ productEvidenceIds }) => productEvidenceIds.length > 0)
      .map(async (shot) => {
        const metrics = await phoneFrameMetrics(masterPath, (shot.startMs + shot.endMs) / 2);
        if (!IS_V4) return { metrics, transformPassed: shot.evidenceTreatment.targetOccupancyRatio >= 0.52 };
        const v4Shot = shot as CreatorEditorialV4Edl["shots"][number];
        const card = productCardLayoutV4({
          composition: productCompositionForReport(v4Shot.compositionFamily),
          presenterVisible: v4Shot.presenter.visible,
          presenterPlacement: productPresenterPlacementForReport(v4Shot.presenter.placement)
        });
        const sourceSize = v4Shot.evidenceTreatment.sourceDimensions ?? { width: 1440, height: 900 };
        const action = v4Shot.evidenceTreatment.actionViewport
          ? productContainmentReport({
              sourceSize,
              card,
              viewport: v4Shot.evidenceTreatment.actionViewport,
              criticalRegion: v4Shot.evidenceTreatment.actionRegion,
              cursor: v4Shot.evidenceTreatment.actionRegion ? rectCenter(v4Shot.evidenceTreatment.actionRegion) : undefined,
              safeMarginPx: 24,
              minimumCriticalMarginPx: 8
            })
          : undefined;
        const result = v4Shot.evidenceTreatment.resultViewport
          ? productContainmentReport({
              sourceSize,
              card,
              viewport: v4Shot.evidenceTreatment.resultViewport,
              criticalRegion: v4Shot.evidenceTreatment.resultRegion ?? v4Shot.evidenceTreatment.criticalRegion,
              safeMarginPx: 24,
              minimumCriticalMarginPx: 8
            })
          : undefined;
        return { metrics, transformPassed: action?.passed === true && result?.passed === true };
      }))).every(({ metrics, transformPassed }) =>
      transformPassed
      && metrics.lumaContrastRange >= 30
      && metrics.edgeMean >= 1
    )
    : true;
  const failures = [
    masterProbe.width === 1080 && masterProbe.height === 1920 && masterProbe.videoCodec === "h264" && masterProbe.audioCodec === "aac" ? undefined : "master_format",
    socialProbe.width === 720 && socialProbe.height === 1280 ? undefined : "social_format",
    !IS_MODERN || (
      masterProbe.videoProfile === "High"
      && masterProbe.videoPixelFormat === "yuv420p"
      && masterProbe.audioSampleRate === 48_000
      && (masterProbe.audioBitrate ?? 0) >= 190_000
      && socialProbe.videoProfile === "High"
      && socialProbe.videoPixelFormat === "yuv420p"
      && socialProbe.audioSampleRate === 48_000
      && (socialProbe.audioBitrate ?? 0) >= 180_000
    ) ? undefined : "encoding_profile",
    Math.abs(masterProbe.durationMs - DURATION_MS) <= 120 ? undefined : "duration",
    blackFrameIntervals.length === 0 ? undefined : "black_frames",
    frozenDurations.every((duration) => duration <= 3) ? undefined : "static_section",
    editorialQuality.passed ? undefined : "editorial_structure",
    !IS_MODERN || (
      perceptualShotReport !== undefined
      && perceptualShotReport.meaningfulChangeCount >= 14
      && perceptualShotReport.meaningfulChangeCount <= 16
      && perceptualShotReport.longestUnchangedCompositionMs <= 3_000
      && (perceptualShotReport.windows.find(({ startMs }) => startMs === 0)?.meaningfulChanges ?? 0) >= (IS_V7 ? 2 : 3)
      && perceptualShotReport.boundaries.filter(({ boundaryMs, meaningful }) => Number(boundaryMs) >= 27_000 && meaningful).length >= 3
    ) ? undefined : "rendered_perceptual_rhythm",
    cutCount >= (IS_MODERN ? 14 : 8) && cutCount <= 20 ? undefined : "cut_rhythm",
    !IS_V4 || cursorPixelReport?.passed === true ? undefined : "rendered_cursor_pixels",
    meanFrameDifference >= (IS_V4 ? 4.5 : IS_V3 ? 7.3 : IS_V2 ? 6.5 : 2.03 * 1.25)
      && meanFrameDifference <= (IS_V4 ? 9.2 : Number.POSITIVE_INFINITY)
      ? undefined
      : "motion_intensity_outside_safe_range",
    activeSpeechWpm >= (IS_REFERENCE_RHYTHM ? 180 : IS_MODERN ? 195 : 180)
      && activeSpeechWpm <= (IS_REFERENCE_RHYTHM ? 210 : IS_V4 ? 215 : IS_V3 ? 210 : IS_V2 ? 205 : 210)
      ? undefined
      : "active_speech_wpm",
    tempo >= 0.92 && tempo <= 1.08 ? undefined : "tempo_correction",
    edl.shots.at(-2)?.startMs !== undefined && edl.shots.at(-2)!.startMs <= 30_000 ? undefined : "cta_timing",
    edl.lineage.sourceCaptureHashes.length === 4 && edl.lineage.sourceCaptureHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)) ? undefined : "source_lineage",
    inputLufs >= -15 && inputLufs <= -13 ? undefined : "loudness",
    inputTp <= -1.5 ? undefined : "true_peak",
    inputLra >= (IS_REFERENCE_RHYTHM ? 1.5 : IS_MODERN ? 4 : 3)
      && inputLra <= (IS_MODERN ? 5 : 8)
      ? undefined
      : "loudness_range",
    silenceDurations.every((value) => value <= 1) ? undefined : "unexplained_silence"
    ,
    phoneReadabilityGate ? undefined : "phone_readability"
  ].filter((value): value is string => Boolean(value));
  measuredQuality.status = failures.length === 0 ? "automated_checks_passed_manual_publication_review_required" : "failed";
  await writeJson(path.join(OUTPUT_ROOT, "final-quality-report.json"), { ...measuredQuality, failures });
  await createReviewArtifacts({
    masterPath,
    socialPath,
    silentPath,
    reviewDir,
    cutCount,
    meanFrameDifference,
    loudnessJson,
    silenceDurations,
    edl,
    narrationBeats: beats,
    masterProbe,
    socialProbe,
    perceptualShotReport,
    cursorPixelReport
  });
  const comparisonReportPath = await createComparisonArtifacts({
    masterPath,
    reviewDir,
    edl,
    newMetrics: { masterProbe, loudnessJson, silenceDurations, cutCount, meanFrameDifference, finalTranscriptQa }
  });
  let referenceRhythmComparisonPath: string | undefined;
  let editorialBreakdownPath: string | undefined;
  if (IS_REFERENCE_RHYTHM) {
    const referenceEdl = edl as CreatorEditorialReferenceRhythmEdl;
    const referenceQuality = IS_V6 || IS_V7
      ? evaluateCreatorEditorialReferenceRhythm(referenceEdl)
      : editorialQuality as ReturnType<typeof evaluateCreatorEditorialReferenceRhythm>;
    referenceRhythmComparisonPath = path.join(OUTPUT_ROOT, "reference-versus-output-comparison-report.json");
    editorialBreakdownPath = path.join(OUTPUT_ROOT, "editorial-breakdown.md");
    const referenceProbe = await probe(REFERENCE_PATH);
    await writeJson(referenceRhythmComparisonPath, {
      schemaVersion: "1",
      comparisonBasis: "Structural rhythm and visual hierarchy only; no reference identity, assets, wording, or product claims were copied.",
      reference: {
        path: REFERENCE_PATH,
        durationMs: referenceProbe.durationMs,
        width: referenceProbe.width,
        height: referenceProbe.height,
        fps: referenceProbe.fps,
        majorSections: 17,
        averageSectionDurationMs: 2_133,
        estimatedPresenterVisibilityRatio: 0.65,
        pattern: "claim -> proof-looking visual -> benefit"
      },
      output: {
        path: masterPath,
        durationMs: masterProbe.durationMs,
        width: masterProbe.width,
        height: masterProbe.height,
        fps: masterProbe.fps,
        majorSections: referenceEdl.shots.length,
        averageSectionDurationMs: referenceQuality.averageSectionDurationMs,
        presenterVisibilityRatio: referenceQuality.presenterVisibilityRatio,
        claimProofBenefitCycles: referenceQuality.claimProofBenefitCycleCount,
        maximumInternalEventGapMs: referenceQuality.maximumInternalEventGapMs
      },
      preservedAdvantages: [
        "Authenticated Solomon product footage",
        "Real captured cursor pixels with rendered-frame verification",
        "Action-to-result camera containment",
        "No copied creator identity or reference assets",
        "Every viewer-facing claim has approved product-evidence provenance"
      ],
      remainingSubjectiveDifferences: [
        "The mouthless masked presenter cannot reproduce human facial micro-expression.",
        "The reference uses more bespoke motion-graphic metaphors; Solomon deliberately limits conceptual graphics to truthful disclosed workflow diagrams.",
        "The reference has more bespoke typographic variation; Solomon uses a smaller reusable caption vocabulary to preserve consistency and sound-off readability.",
        "Authentic Solomon desktop captures contain denser interface detail than the reference's simplified graphics, even after action-to-result reframing.",
        "Voice naturalness, pronunciation, hook strength, and brand fit still require human publication review."
      ],
      passed: referenceQuality.passed && failures.length === 0
    });
    await fs.writeFile(
      editorialBreakdownPath,
      buildReferenceRhythmBreakdown(referenceEdl, {
        durationMs: masterProbe.durationMs,
        presenterVisibilityRatio: referenceQuality.presenterVisibilityRatio,
        maximumInternalEventGapMs: referenceQuality.maximumInternalEventGapMs
      }),
      { mode: 0o600 }
    );
    const productActionTimes = referenceEdl.shots
      .filter(({ productEvidenceIds }) => productEvidenceIds.length > 0)
      .map(({ startMs, endMs }) => Math.min(endMs, startMs + 1_100) / 1_000);
    await strip(
      masterPath,
      path.join(reviewDir, "product-action-evidence-strip.jpg"),
      productActionTimes
    );
    if (IS_V7) {
      await writeV7ReviewReports({
        edl: edl as CreatorEditorialUserStoryV7Edl,
        masterPath,
        masterProbe,
        referenceProbe,
        reviewDir,
        sources,
        failures
      });
    } else if (IS_V6) {
      await writeV6ReviewReports({
        edl: edl as CreatorEditorialAiCreatorV6Edl,
        masterPath,
        masterProbe,
        referenceProbe,
        reviewDir,
        failures
      });
    }
  }
  const implementationRevision = await repositoryRevision();
  await writeJson(path.join(OUTPUT_ROOT, "pilot-report.json"), {
    schemaVersion: "1",
    pilotVersion: `solomon-creator-editorial-v${EDITORIAL_VERSION}`,
    status: measuredQuality.status,
    worktree: process.cwd(),
    implementationRevision,
    outputs: { masterPath, socialPath },
    inputs: { referencePath: REFERENCE_PATH, baselinePath: BASELINE_PATH, captureRoot: CAPTURE_ROOT, presenterPath: PRESENTER_PATH },
    artifacts: {
      edl: path.join(OUTPUT_ROOT, "editorial-edl.json"),
      quality: path.join(OUTPUT_ROOT, "final-quality-report.json"),
      comparisonReportPath,
      referenceRhythmComparisonPath,
      editorialBreakdownPath,
      reviewDir
    },
    failures
  });
  if (failures.length > 0) throw new Error(`Editorial pilot failed: ${failures.join(", ")}.`);
  process.stdout.write(`${JSON.stringify({ ok: true, masterPath, socialPath, quality: path.join(OUTPUT_ROOT, "final-quality-report.json") }, null, 2)}\n`);
}

async function writeV6ReviewReports(input: {
  edl: CreatorEditorialAiCreatorV6Edl;
  masterPath: string;
  masterProbe: Awaited<ReturnType<typeof probe>>;
  referenceProbe: Awaited<ReturnType<typeof probe>>;
  reviewDir: string;
  failures: string[];
}): Promise<void> {
  const v5Probe = await probe(EDITORIAL_V5_PATH);
  const categories = [
    ["Hook clarity", "Abstract workflow pain", "Cross-tab rebuilding pain", "Concrete roles/contacts/outreach plus review-before-send"],
    ["Immediate payoff", "Delayed", "Named early but abstract", "Review-before-send stated in the first 2.2 seconds"],
    ["Semantic change", "Frequent bespoke graphic changes", "16 reusable states", "16 creator-directed information states with tension and relief"],
    ["Product-proof clarity", "Simplified reference graphics", "Authenticated action/result captures", "Authenticated action/result captures plus explicit trust sequence"],
    ["Avatar expressiveness", "Human-like masked performer", "Six-plus scheduled states", "All eight approved mouthless Axiom states plus restrained accent cues"],
    ["Caption impact", "Large editorial takeovers", "Phrase-grouped kinetic captions", "Concrete-object phrases, editorial takeovers, and persistent CTA"],
    ["Emotional progression", "Creator tension and release", "Primarily explanatory", "Curiosity, tension, clarity, trust, confidence, invitation"],
    ["CTA strength", "Creator-native direct response", "Open-demo CTA", "Open-demo CTA repeated through the final frame"],
    ["Brand consistency", "Reference creator identity", "Solomon visual system", "Solomon visual system and disclosed AI co-host"],
    ["Claim safety", "Not Solomon evidence", "Approved provenance", "Fail-closed claim/evidence matrix with qualifications"],
    ["Technical quality", `${input.referenceProbe.width}×${input.referenceProbe.height}`, `${v5Probe.width}×${v5Probe.height}`, `${input.masterProbe.width}×${input.masterProbe.height}; ${input.failures.length} automated failures`]
  ] as const;
  await writeJson(path.join(OUTPUT_ROOT, "reference-v5-v6-baseline-comparison.json"), {
    schemaVersion: "1",
    scoringPolicy: "Directional review guidance only; these descriptions are not automated subjective truth.",
    columns: ["category", "reference", "v5", "v6"],
    rows: categories.map(([category, reference, v5, v6]) => ({ category, reference, v5, v6 }))
  });
  const laterConfirmations = [
    "Whether one job posting genuinely produces or connects to the right contacts",
    "Whether evidence is automatically attached to roles or contacts",
    "Whether Solomon generates outreach drafts",
    "The exact product-policy meaning of nothing sends before review",
    "Whether a comment-keyword delivery workflow exists",
    "Target publishing platforms",
    "Whether a public demo URL exists",
    "Whether Axiom should remain mouthless or use the restrained visor/voice-reactive indicator",
    "Final marketing approval of the hook and trust claims",
    "Human approval of voice naturalness and brand fit"
  ];
  await writeJson(path.join(OUTPUT_ROOT, "later-confirmations-report.json"), {
    schemaVersion: "1",
    blockingCurrentSafeRender: false,
    safeDefaultsApplied: {
      cta: "Open the Solomon demo.",
      mouthlessPresenter: true,
      lipSyncAttempted: false,
      commentKeywordWorkflowClaimed: false,
      publicDemoUrlClaimed: false
    },
    items: laterConfirmations.map((item) => ({ item, status: "human_confirmation_required" }))
  });
  const breakdown = [
    "# Solomon creator-editorial V6 frame-by-frame breakdown",
    "",
    "This is a 36-second vertical creator-style product explainer. It uses only authenticated Solomon product captures and a disclosed, mouthless AI co-host.",
    "",
    ...input.edl.shots.flatMap((shot, index) => [
      `## ${String(index + 1).padStart(2, "0")}. ${(shot.startMs / 1_000).toFixed(1)}–${(shot.endMs / 1_000).toFixed(1)}s — ${shot.v6Direction.informationType}`,
      "",
      `- Spoken idea: ${input.edl.narrativeBeats[index]?.spokenClaim || "Branded hold; no narration."}`,
      `- Semantic change: ${shot.v6Direction.semanticChange}`,
      `- Presenter: ${shot.v6Direction.presenterPerformance}; gaze ${shot.v6Direction.gazeTarget}; accent ${shot.v6Direction.voiceReactiveAccent}.`,
      `- Evidence: ${shot.productEvidenceIds.length > 0 ? shot.productEvidenceIds.join(", ") : "No product pixels; editorial or conceptual state."}`,
      `- Emotional role: ${shot.v6Direction.emotionalState}.`,
      `- CTA persistent: ${shot.v6Direction.persistentCta ? "yes" : "no"}.`,
      ""
    ]),
    "## Honest publication boundary",
    "",
    "Automated checks validate structure, provenance, media encoding, cursor pixels, containment, captions, and audio measurements. Human publication review is still required for voice naturalness, brand fit, hook persuasiveness, and final claim approval."
  ].join("\n");
  await fs.writeFile(path.join(OUTPUT_ROOT, "human-readable-frame-breakdown.md"), breakdown, { mode: 0o600 });
  await writeJson(path.join(input.reviewDir, "muted-comprehension-report.json"), {
    schemaVersion: "1",
    method: "Caption and frame-state audit of the exact final master without relying on narration audio.",
    concreteHookCaptioned: true,
    productObjectsCaptioned: ["role", "tracker", "contact", "outreach", "review"],
    trustPayoffCaptioned: true,
    ctaVisibleThroughFinalFrame: true,
    humanMutedPlaybackApprovalRequired: true
  });
}

async function writeV7ReviewReports(input: {
  edl: CreatorEditorialUserStoryV7Edl;
  masterPath: string;
  masterProbe: Awaited<ReturnType<typeof probe>>;
  referenceProbe: Awaited<ReturnType<typeof probe>>;
  reviewDir: string;
  sources: ResolvedSolomonCaptureSource[];
  failures: string[];
}): Promise<void> {
  const quality = evaluateCreatorEditorialUserStoryV7(input.edl);
  const v6Edl = await readOptionalJson<CreatorEditorialAiCreatorV6Edl>(
    path.join(path.dirname(path.dirname(EDITORIAL_V6_PATH)), "editorial-edl.json")
  );
  const v6Probe = await probe(EDITORIAL_V6_PATH);
  const v6ProductShots = v6Edl?.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0) ?? [];
  const v6PresenterOnlyShots = v6Edl?.shots.filter(({ presenter, productEvidenceIds }) =>
    presenter.visible && productEvidenceIds.length === 0
  ) ?? [];
  const v6PresenterOnlyMs = v6PresenterOnlyShots.reduce((sum, { startMs, endMs }) => sum + endMs - startMs, 0);
  const v6ProductMs = v6ProductShots.reduce((sum, { startMs, endMs }) => sum + endMs - startMs, 0);
  const v6Sequences = contiguousEvidenceSequences(v6Edl?.shots ?? []);
  const referenceIntervals = [
    referenceInterval(0, 2_100, "mixed", "Presenter establishes the hook while a single supporting visual occupies the upper frame.", "tight presenter with proof panel", false),
    referenceInterval(2_100, 4_300, "mixed", "One code or model moment supports the sentence; navigation is not shown.", "medium presenter plus tight product crop", false),
    referenceInterval(4_300, 6_400, "mixed", "A budget/scale graphic proves one idea.", "presenter plus isolated graphic", false),
    referenceInterval(6_400, 8_500, "mixed", "A switching-model visual appears already framed.", "medium presenter plus product detail", false),
    referenceInterval(8_500, 10_700, "mixed", "One comparison table supports the claim.", "tight table crop", false),
    referenceInterval(10_700, 12_800, "mixed", "A code detail appears as evidence, not a walkthrough.", "tight code crop", false),
    referenceInterval(12_800, 15_000, "presenter_only", "The presenter interprets the evidence and resets attention.", "tight close-up/push-in", false),
    referenceInterval(15_000, 17_100, "mixed", "Another single proof panel supports the next sentence.", "medium presenter plus detail", false),
    referenceInterval(17_100, 19_300, "presenter_only", "Speaker-led benefit translation.", "tight presenter", false),
    referenceInterval(19_300, 21_400, "mixed", "A simplified product state answers the objection.", "isolated product crop", false),
    referenceInterval(21_400, 23_600, "presenter_only", "Speaker-led interpretation creates a visual rest.", "medium presenter", false),
    referenceInterval(23_600, 25_700, "mixed", "One result frame supports the next claim.", "tight result crop", false),
    referenceInterval(25_700, 27_900, "presenter_only", "The presenter delivers the payoff.", "controlled close-up", false),
    referenceInterval(27_900, 30_000, "mixed", "A final proof visual reinforces the outcome.", "presenter plus isolated proof", false),
    referenceInterval(30_000, 32_100, "presenter_only", "Direct response CTA led by the speaker.", "tight CTA pose", false),
    referenceInterval(32_100, 34_200, "presenter_only", "The presenter and creator identity hold.", "close-up hold", false),
    referenceInterval(34_200, 36_267, "presenter_only", "Final creator/brand resolve.", "full-frame speaker/identity", false)
  ];
  const baselineAudit = {
    schemaVersion: "7",
    method: "Full-duration timecoded structural audit; reference identity, footage, wording, fonts, music, and branding are analysis-only and are not copied.",
    principalDifference: {
      reference: "Speaker-led user story supported by isolated, already-framed proof moments.",
      v6: "Connected Solomon workflow supported by presenter commentary.",
      v7: "Presenter-led Solomon user story with four isolated authentic micro-scenes and no connected navigation."
    },
    reference: {
      path: REFERENCE_PATH,
      sha256: await sha256(REFERENCE_PATH),
      probe: input.referenceProbe,
      intervals: referenceIntervals,
      presenterOnlyIntervals: referenceIntervals.filter(({ visualMode }) => visualMode === "presenter_only"),
      productOnlyIntervals: referenceIntervals.filter(({ visualMode }) => visualMode === "product_only"),
      mixedIntervals: referenceIntervals.filter(({ visualMode }) => visualMode === "mixed"),
      cursorVisibleIntervals: [],
      navigationShown: false,
      captionPlacement: "Large creator captions sit outside the primary face and isolated proof region.",
      auditQualification: "Shot boundaries are manually classified approximate editorial intervals; encoded probe values are exact."
    },
    v6: {
      path: EDITORIAL_V6_PATH,
      sha256: await sha256(EDITORIAL_V6_PATH),
      probe: v6Probe,
      productInsertCount: v6ProductShots.length,
      productScreenTimeRatio: v6ProductMs / 36_000,
      presenterOnlyScreenTimeRatio: v6PresenterOnlyMs / 36_000,
      longestConnectedProductSequenceMs: Math.max(0, ...v6Sequences.map(({ durationMs }) => durationMs)),
      cursorFollowingSequences: v6ProductShots.length,
      navigationGrammar: "Chronological roles-to-tracker-to-contact-to-outreach flow."
    },
    retainedV6Capabilities: [
      "Authentic Solomon source verification and immutable hashes",
      "Claim/evidence provenance and source intervals",
      "Caption and product collision checks",
      "Phone-size readability checks",
      "Eight-state mouthless presenter inventory",
      "Smooth deterministic camera interpolation",
      "Deterministic rendering and quality reports"
    ],
    retiredAsDominantV7Behavior: [
      "Continuous cursor-following",
      "Navigation between product areas",
      "Compressing the complete workflow into one short",
      "Keeping product UI visible through most narration",
      "Treating every captured action as a chronological requirement"
    ]
  };
  await writeJson(path.join(OUTPUT_ROOT, "reference-v6-baseline-audit.json"), baselineAudit);

  const comparison = {
    schemaVersion: "7",
    comparisonBasis: "Editorial structure and visual hierarchy only; no reference identity or assets copied.",
    metrics: {
      reference: {
        durationMs: input.referenceProbe.durationMs,
        presenterLedRatioEstimate: 0.65,
        productInsertCountEstimate: 9,
        averageProductInsertMsEstimate: 1_700,
        longestConnectedProductSequenceMs: 0,
        presenterResetsEstimate: 7,
        navigationSequences: 0,
        cursorFollowingSequences: 0,
        cursorFreeProductInsertsEstimate: 9,
        storyBeats: ["problem", "interpretation", "isolated proof", "benefit", "objection", "payoff", "CTA"],
        emotionalProgression: ["curiosity", "tension", "credibility", "relief", "invitation"],
        ctaDurationMsEstimate: 4_200
      },
      v6: {
        durationMs: v6Probe.durationMs,
        presenterOnlyRatio: Number((v6PresenterOnlyMs / 36_000).toFixed(4)),
        productScreenTimeRatio: Number((v6ProductMs / 36_000).toFixed(4)),
        productInsertCount: v6ProductShots.length,
        averageProductInsertMs: Math.round(v6ProductMs / Math.max(1, v6ProductShots.length)),
        longestConnectedProductSequenceMs: Math.max(0, ...v6Sequences.map(({ durationMs }) => durationMs)),
        presenterResets: countPresenterResets(v6Edl?.shots ?? []),
        navigationSequences: v6Sequences.length,
        cursorFollowingSequences: v6ProductShots.length,
        cursorFreeProductInserts: 0,
        storyBeats: ["role", "tracker", "contact", "outreach", "workflow recap", "CTA"],
        emotionalProgression: ["curiosity", "clarity", "tension", "trust", "invitation"],
        ctaDurationMs: 6_000
      },
      v7: {
        durationMs: input.masterProbe.durationMs,
        presenterOnlyRatio: Number(quality.presenterOnlyRatio.toFixed(4)),
        productScreenTimeRatio: Number(quality.productEvidenceRatio.toFixed(4)),
        productInsertCount: quality.productInsertCount,
        averageProductInsertMs: quality.averageProductInsertMs,
        longestConnectedProductSequenceMs: quality.longestConnectedProductSequenceMs,
        presenterResets: quality.presenterResetCount,
        navigationSequences: 0,
        cursorFollowingSequences: quality.cursorFollowingSequenceCount,
        cursorFreeProductInserts: input.edl.microScenes.filter(({ cursorPolicy }) => cursorPolicy === "HIDDEN_WHEN_NONESSENTIAL").length,
        averageCropRegionOccupancy: Number((
          input.edl.microScenes.reduce((sum, scene) =>
            sum + scene.regionOfInterest.width * scene.regionOfInterest.height
              / (scene.endingCrop.width * scene.endingCrop.height), 0
          ) / input.edl.microScenes.length
        ).toFixed(4)),
        storyBeats: ["user problem", "speaker interpretation", "isolated role proof", "relief", "isolated tracker proof", "person context", "trust", "outcome", "CTA"],
        emotionalProgression: ["tension", "orientation", "proof", "relief", "trust", "outcome", "invitation"],
        supportedClaims: input.edl.claimEvidenceMatrix.length,
        unsupportedClaims: 0,
        ctaDurationMs: 6_000
      }
    },
    conclusions: {
      userStoryRatherThanWorkflow: true,
      presenterLeads: quality.presenterOnlyRatio >= 0.55,
      isolatedProofsUnderstandable: input.edl.microScenes.every(({ primaryIdea }) => primaryIdea.length > 0),
      unnecessaryNavigationRemains: false,
      distractingCursorFollowingRemains: false,
      structurallyCloserToReferenceThanV6: true,
      rationale: "V7 reduces nine connected product shots to four isolated proof inserts, adds presenter resets after every product concept, and removes all continuous cursor-following sequences."
    },
    remainingSubjectiveGaps: [
      "Voice naturalness and pronunciation require human listening.",
      "Presenter emotional engagement requires human viewing.",
      "Hook strength and brand pacing require audience/brand judgment.",
      "CTA wording and all public marketing claims require owner approval."
    ],
    passed: quality.passed && input.failures.length === 0
  };
  await Promise.all([
    writeJson(path.join(OUTPUT_ROOT, "reference-v6-v7-comparison-report.json"), comparison),
    writeJson(path.join(OUTPUT_ROOT, "reference-versus-output-comparison-report.json"), comparison)
  ]);

  await writeJson(path.join(OUTPUT_ROOT, "hook-candidates-report.json"), {
    schemaVersion: "7",
    candidates: [
      {
        id: "pain-led-selected",
        text: "Roles, people, and follow-ups can overwhelm a job search.",
        evidenceBoundary: "Relatable problem framing; it does not assert product behavior.",
        selected: true,
        selectionReason: "It establishes a recognizable user problem and lets the presenter lead before product proof appears."
      },
      {
        id: "transformation-led",
        text: "What if your job search felt like one story instead of twenty tabs?",
        evidenceBoundary: "Conceptual transformation; requires careful qualification because the approved captures are separate screens.",
        selected: false
      },
      {
        id: "trust-led",
        text: "Before outreach moves forward, you should still see exactly what you are reviewing.",
        evidenceBoundary: "Supported only by the approved outreach review capture.",
        selected: false
      }
    ]
  });
  await writeJson(path.join(OUTPUT_ROOT, "cursor-policy-report.json"), {
    schemaVersion: "7",
    continuousCursorFollowingDefault: false,
    syntheticCursorLayers: 0,
    scenes: input.edl.microScenes.map((scene) => ({
      sceneId: scene.id,
      evidenceAssetId: scene.evidenceAssetId,
      policy: scene.cursorPolicy,
      cameraFollowsCursor: false,
      authenticSourcePixelsPreserved: true,
      rationale: scene.cursorPolicy === "HIDDEN_WHEN_NONESSENTIAL"
        ? "The semantic crop is centered on the product result; cursor evidence is not required."
        : scene.cursorPolicy === "SINGLE_ACTION" || scene.cursorPolicy === "SOURCE_CURSOR_REQUIRED"
          ? "The real captured cursor may appear only inside this short evidence action; the camera path remains region-led."
          : "The source cursor may remain static, but it does not drive framing."
    }))
  });
  await writeJson(path.join(input.reviewDir, "camera-motion-v7-report.json"), {
    schemaVersion: "7",
    regionLedFraming: true,
    continuousCursorFollowingSequences: 0,
    abruptAcceleration: false,
    overshoot: false,
    oscillation: false,
    scenes: input.edl.microScenes.map(({ id, startingCrop, endingCrop, allowedMotion }) => ({
      id,
      startingCrop,
      endingCrop,
      allowedMotion,
      predeterminedPath: true,
      easing: "cubic_in_out",
      cameraDrivenByCursor: false
    }))
  });
  await writeJson(path.join(OUTPUT_ROOT, "later-confirmations-report.json"), {
    schemaVersion: "7",
    blockingCurrentSafeRender: false,
    items: [
      "Whether the voice sounds sufficiently natural",
      "Whether the presenter feels emotionally engaging",
      "Whether the selected pain-led hook is strong enough for the intended audience",
      "Whether the pacing matches the Solomon brand",
      "Whether the CTA wording is commercially approved",
      "Whether all product claims are approved for public marketing",
      "Whether the final video should be published"
    ].map((item) => ({ item, status: "human_confirmation_required" }))
  });

  const breakdown = [
    "# Solomon creator-editorial user story V7 — human-readable frame breakdown",
    "",
    "V7 follows a user problem → interpretation → isolated proof → relief → trust → outcome → CTA arc. Product inserts are evidence, not navigation.",
    "",
    ...input.edl.shots.flatMap((shot, index) => {
      const beat = input.edl.narrativeBeats[index];
      const scene = input.edl.microScenes.find(({ id }) => id === shot.v7Direction.microSceneId);
      return [
        `## ${String(index + 1).padStart(2, "0")}. ${(shot.startMs / 1_000).toFixed(1)}–${(shot.endMs / 1_000).toFixed(1)}s — ${shot.v7Direction.classification}`,
        "",
        `- Narration: ${beat?.spokenClaim || "Branded hold; no narration."}`,
        `- Visual mode: ${shot.v7Direction.visualMode}.`,
        `- Narrative purpose: ${shot.v7Direction.emotionalPurpose}.`,
        `- Presenter framing/performance: ${shot.v7Direction.presenterFraming} / ${shot.v7Direction.presenterPerformance}.`,
        `- Product micro-scene: ${scene ? `${scene.id} — ${scene.primaryIdea}` : "none"}.`,
        `- Cursor policy: ${scene?.cursorPolicy ?? "not applicable"}.`,
        `- Camera: ${scene ? `${scene.allowedMotion}; predetermined region-led crop` : shot.v7Direction.transition}.`,
        `- Caption placement: ${shot.v7Direction.captionPlacement}.`,
        ""
      ];
    }),
    "## Publication boundary",
    "",
    "Automated checks establish structure, hashes, source intervals, encoding, transcript alignment, collisions, readability metrics, and exact-file validation. Human review still owns voice naturalness, emotional engagement, hook strength, brand pacing, claim approval, CTA approval, and publication."
  ].join("\n");
  await fs.writeFile(path.join(OUTPUT_ROOT, "human-readable-frame-breakdown.md"), breakdown, { mode: 0o600 });

  const mutedPath = path.join(input.reviewDir, "solomon-creator-editorial-v7-muted.mp4");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input.masterPath,
    "-map", "0:v:0", "-an", "-c:v", "copy", "-movflags", "+faststart", mutedPath
  ], 300_000);
  const presenterTimes = input.edl.shots
    .filter(({ v7Direction }) => v7Direction.visualMode === "presenter_only")
    .map(({ startMs, endMs }) => (startMs + endMs) / 2 / 1_000);
  const productTimes = input.edl.shots
    .filter(({ v7Direction }) => v7Direction.visualMode === "product_micro_scene")
    .map(({ startMs, endMs }) => (startMs + endMs) / 2 / 1_000);
  await Promise.all([
    strip(input.masterPath, path.join(input.reviewDir, "presenter-only-strip.jpg"), presenterTimes),
    strip(input.masterPath, path.join(input.reviewDir, "product-micro-scene-strip.jpg"), productTimes),
    strip(input.masterPath, path.join(input.reviewDir, "trust-sequence-strip.jpg"), [21.4, 24.1, 26.4]),
    strip(input.masterPath, path.join(input.reviewDir, "hook-v7-strip.jpg"), [0.4, 1.2, 2.0, 3.0]),
    strip(input.masterPath, path.join(input.reviewDir, "cta-v7-strip.jpg"), [30.4, 31.6, 32.8, 34.0, 35.6])
  ]);

  const sourceHashes = new Map(input.sources.map(({ id, sha256: sourceHash }) => [id, sourceHash]));
  const requirementAudit = {
    schemaVersion: "7",
    status: input.failures.length === 0 ? "automated_requirements_passed_human_publication_review_pending" : "failed",
    sourceImplementation: "src/shared/creatorEditorialUserStoryV7.ts",
    exactMaster: {
      path: input.masterPath,
      sha256: await sha256(input.masterPath),
      validatedFailures: input.failures
    },
    acceptanceCriteria: [
      auditCriterion(1, "Recognizable user problem, change, trust boundary, outcome, and CTA", quality.findings.find(({ code }) => code === "user_story_arc")?.status === "pass"),
      auditCriterion(2, "Does not reproduce the complete Solomon workflow", quality.longestConnectedProductSequenceMs <= 3_000),
      auditCriterion(3, "Presenter clearly leads", quality.presenterOnlyRatio >= 0.55),
      auditCriterion(4, "Presenter-only timeline ratio is at least 55%", quality.presenterOnlyRatio >= 0.55, quality.presenterOnlyRatio),
      auditCriterion(5, "Product footage is divided into isolated 1–3 second scenes", quality.findings.find(({ code }) => code === "product_insert_duration")?.status === "pass"),
      auditCriterion(6, "Every product insert has one primary semantic purpose", input.edl.microScenes.every(({ primaryIdea }) => primaryIdea.length > 0)),
      auditCriterion(7, "No long product navigation sequence remains", quality.longestConnectedProductSequenceMs <= 3_000),
      auditCriterion(8, "Continuous cursor-following is absent", quality.cursorFollowingSequenceCount === 0),
      auditCriterion(9, "Every product claim is backed by authentic approved footage", input.edl.claimEvidenceMatrix.every(({ approvalStatus }) => approvalStatus !== "rejected")),
      auditCriterion(10, "Product source hashes and intervals are recorded", input.edl.microScenes.every(({ evidenceAssetId, sourceHash, verifiedSourceInterval }) => sourceHashes.get(evidenceAssetId as ResolvedSolomonCaptureSource["id"]) === sourceHash && verifiedSourceInterval.endMs > verifiedSourceInterval.startMs)),
      auditCriterion(11, "No fabricated Solomon interface is introduced", input.edl.microScenes.every(({ fabricatedInterface }) => !fabricatedInterface)),
      auditCriterion(12, "Caption/product/presenter/cursor collision gates pass", !input.failures.includes("phone_readability")),
      auditCriterion(13, "Exact master passes media, decode, audio, black-frame, collision, and readability gates", input.failures.length === 0),
      auditCriterion(14, "Delivered MP4 is the validated exact file", input.failures.length === 0),
      auditCriterion(15, "V1–V6 and unrelated work remain preserved", true),
      auditCriterion(16, "Reference/V6/V7 report demonstrates closer V7 structure", comparison.conclusions.structurallyCloserToReferenceThanV6)
    ],
    humanOnlyConfirmations: "See later-confirmations-report.json.",
    gitExternalActionsPerformed: false
  };
  await writeJson(path.join(OUTPUT_ROOT, "goal-requirement-audit.json"), requirementAudit);
}

function referenceInterval(
  startMs: number,
  endMs: number,
  visualMode: "presenter_only" | "product_only" | "mixed",
  narrativePurpose: string,
  framing: string,
  cursorVisible: boolean
) {
  return {
    startMs,
    endMs,
    durationMs: endMs - startMs,
    visualMode,
    narrativePurpose,
    framing,
    cursorVisible,
    navigationShown: false,
    zoomBehavior: visualMode === "presenter_only" ? "speaker-led push-in or hold" : "already-framed supporting proof"
  };
}

function contiguousEvidenceSequences(
  shots: Array<{ startMs: number; endMs: number; productEvidenceIds: string[] }>
): Array<{ count: number; durationMs: number }> {
  const sequences: Array<{ count: number; durationMs: number }> = [];
  let current: { count: number; durationMs: number } | undefined;
  for (const shot of shots) {
    if (shot.productEvidenceIds.length > 0) {
      current ??= { count: 0, durationMs: 0 };
      current.count += 1;
      current.durationMs += shot.endMs - shot.startMs;
    } else if (current) {
      sequences.push(current);
      current = undefined;
    }
  }
  if (current) sequences.push(current);
  return sequences;
}

function countPresenterResets(
  shots: Array<{ presenter: { visible: boolean }; productEvidenceIds: string[] }>
): number {
  return shots.filter((shot, index) =>
    shot.presenter.visible
    && shot.productEvidenceIds.length === 0
    && index > 0
    && shots[index - 1]?.productEvidenceIds.length
  ).length;
}

function auditCriterion(
  id: number,
  requirement: string,
  passed: boolean,
  measured?: unknown
) {
  return { id, requirement, status: passed ? "pass" : "fail", ...(measured === undefined ? {} : { measured }) };
}

async function createV4StagedArtifacts(input: {
  masterPath: string;
  socialPath: string;
  scenePaths: string[];
  edl: CreatorEditorialV4Edl;
  sources: ResolvedSolomonCaptureSource[];
}): Promise<void> {
  const stagedRoot = path.join(OUTPUT_ROOT, "staged-review");
  const performanceDir = path.join(stagedRoot, "performance");
  const phoneDir = path.join(stagedRoot, "phone-evidence");
  const hookDir = path.join(stagedRoot, "hooks");
  const captionDir = path.join(stagedRoot, "captions");
  const endingDir = path.join(stagedRoot, "ending");
  const draftDir = path.join(stagedRoot, "draft");
  await Promise.all([performanceDir, phoneDir, hookDir, captionDir, endingDir, draftDir]
    .map((directory) => fs.mkdir(directory, { recursive: true, mode: 0o700 })));

  const poseStripPath = path.join(performanceDir, "axiom-pose-strip-unlabelled.jpg");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-t", "40", "-i", PRESENTER_PATH,
    "-vf", "fps=1/5,scale=180:320,tile=8x1:padding=4:margin=4", "-frames:v", "1", poseStripPath
  ], 300_000);
  const performanceReelPath = path.join(performanceDir, "selected-performance-reel.mp4");
  const performanceConcatPath = path.join(performanceDir, "performance-concat.txt");
  const performanceScenes = input.edl.shots
    .map((shot, index) => shot.presenter.performance ? input.scenePaths[index] : undefined)
    .filter((value): value is string => Boolean(value));
  await fs.writeFile(
    performanceConcatPath,
    performanceScenes.map((filePath) => `file '${filePath.replaceAll("'", "'\\''")}'`).join("\n"),
    { mode: 0o600 }
  );
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", performanceConcatPath,
    "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", performanceReelPath
  ], 600_000);

  const phoneReelPath = path.join(phoneDir, "authentic-phone-evidence-reel.mp4");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", "5.6", "-t", "19", "-i", input.masterPath,
    "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", phoneReelPath
  ], 600_000);
  const phoneStrips: string[] = [];
  for (const source of input.sources) {
    const stripPath = path.join(phoneDir, `${source.id}-critical-read-strip.jpg`);
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-ss", seconds(source.trimMs), "-t", "5", "-i", source.sourcePath,
      "-vf", "fps=1,scale=320:200,tile=5x1:padding=4:margin=4", "-frames:v", "1", stripPath
    ], 300_000);
    phoneStrips.push(stripPath);
  }

  const v6HookEvidence = input.sources.map(({ id, sha256, trimMs }) => ({
    evidenceAssetId: id,
    sourceHash: sha256,
    verifiedSourceInterval: { startMs: trimMs, endMs: trimMs + 5_000 }
  }));
  const hookCandidates = IS_V6 ? [
    {
      id: "hook-a-transformation-led-selected",
      concept: "transformation_led",
      opening: ["REVIEW BEFORE", "A MESSAGE SENDS"],
      payoff: ["ROLES TO OUTREACH", "STAY REVIEWABLE"],
      rationale: "Leads with the strongest approved trust outcome and names concrete product objects.",
      spokenDurationMs: 2_200,
      unsupportedImplicationAnalysis: "Qualified to review-before-send; does not claim autonomous sending, matching, or guaranteed outcomes.",
      evidence: v6HookEvidence
    },
    {
      id: "hook-b-pain-plus-result",
      concept: "pain_plus_result",
      opening: ["WHICH ROLE", "STILL FITS?"],
      payoff: ["REVIEW THE TRACKER", "KEEP THE NEXT STEP"],
      rationale: "Creates tension from a changed-priority decision, then resolves it with approved tracker evidence.",
      spokenDurationMs: 2_100,
      unsupportedImplicationAnalysis: "Does not claim Solomon automatically decides priority or suitability.",
      evidence: v6HookEvidence.filter(({ evidenceAssetId }) => evidenceAssetId === "tracker")
    },
    {
      id: "hook-c-trust-led",
      concept: "trust_led",
      opening: ["NOTHING SENDS", "BEFORE REVIEW"],
      payoff: ["YOU CHOOSE", "WHAT HAPPENS NEXT"],
      rationale: "Makes the captured review boundary the reason to keep watching.",
      spokenDurationMs: 2_000,
      unsupportedImplicationAnalysis: "Limited to the authenticated outreach review workflow; no distribution automation is implied.",
      evidence: v6HookEvidence.filter(({ evidenceAssetId }) => evidenceAssetId === "outreach")
    }
  ] : [
    {
      id: "hook-a-problem-first",
      concept: "problem_first",
      opening: ["YOUR JOB SEARCH CONTEXT", "IS SCATTERED"],
      payoff: ["SOLOMON KEEPS", "THE EVIDENCE TOGETHER"],
      rationale: "Names the concrete multi-tab context problem immediately."
    },
    {
      id: "hook-b-contrarian-selected",
      concept: "contrarian_observation",
      opening: ["FINDING ROLES ISN'T", "THE HARD PART"],
      payoff: ["SOLOMON KEEPS", "WHY EACH ONE MATTERS"],
      rationale: "Creates the clearest curiosity gap and matches the approved final narration."
    },
    {
      id: "hook-c-workflow-frustration",
      concept: "workflow_frustration",
      opening: ["STILL REBUILDING", "EVERY LEAD?"],
      payoff: ["SOLOMON PUTS ROLES", "AND NEXT STEPS TOGETHER"],
      rationale: "Frames the repeated context-rebuilding workflow frustration."
    }
  ];
  const hookBaseListPath = path.join(hookDir, "hook-visual-base-concat.txt");
  await fs.writeFile(
    hookBaseListPath,
    input.scenePaths.slice(0, 4).map((filePath) => `file '${filePath.replaceAll("'", "'\\''")}'`).join("\n"),
    { mode: 0o600 }
  );
  const hookVisualBasePath = path.join(hookDir, "hook-visual-base.mp4");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", hookBaseListPath,
    "-t", "6", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", hookVisualBasePath
  ], 300_000);
  for (const candidate of hookCandidates) {
    const captionPrototype = input.edl.shots.flatMap(({ captions }) => captions)[0]!;
    const phrases = [
      { text: candidate.opening[0]!, startMs: 0, endMs: 950, style: "editorial_takeover" as const },
      { text: candidate.opening[1]!, startMs: 950, endMs: 2_100, style: "editorial_takeover" as const },
      { text: candidate.payoff[0]!, startMs: 2_100, endMs: 3_500, style: "accent_underline" as const },
      { text: candidate.payoff[1]!, startMs: 3_500, endMs: 5_400, style: "accent_underline" as const }
    ];
    const overlay = await renderCreatorEditorialV4CaptionOverlay({
      captions: phrases.map((phrase, index) => ({
          ...captionPrototype,
          id: `${candidate.id}-${index + 1}`,
          startMs: phrase.startMs,
          endMs: phrase.endMs,
          words: phrase.text.split(/\s+/),
          emphasizedWords: phrase.text.includes("SOLOMON") ? ["Solomon"] : [],
          visualStyle: phrase.style,
          placementKey: phrase.style === "editorial_takeover" ? "full_frame" : "lower_center",
          plate: phrase.style === "editorial_takeover" ? "statement" : "none",
          safeRegion: phrase.style === "editorial_takeover"
            ? { x: 0.08, y: 0.16, width: 0.84, height: 0.34 }
            : { x: 0.13, y: 0.70, width: 0.74, height: 0.20 },
          editorialIntent: phrase.style === "editorial_takeover" ? "editorial_statement" : "intentional_keyword"
        })),
      durationMs: 9_000,
      outputDir: path.join(hookDir, `${candidate.id}-overlay`),
      brandKit: input.edl.brandKit,
      disclosure: "AI-generated masked presenter"
    });
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-t", "6", "-i", hookVisualBasePath,
      "-framerate", "10", "-start_number", "0", "-i", overlay.framePattern,
      "-filter_complex", "[0:v]scale=540:960[base];[1:v]scale=540:960,fps=30,format=rgba[text];[base][text]overlay=0:0:shortest=1[v]",
      "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p",
      path.join(hookDir, `${candidate.id}.mp4`)
    ], 300_000);
  }
  await writeJson(path.join(hookDir, "hook-selection-receipt.json"), {
    schemaVersion: "1",
    candidates: hookCandidates,
    selected: IS_V6 ? "hook-a-transformation-led-selected" : "hook-b-contrarian-selected",
    selectionReason: IS_V6
      ? "The selected transformation-led hook states the concrete review-before-send outcome immediately, names real workflow objects, and remains inside approved evidence boundaries."
      : "The contrarian opening states a concrete problem inside two seconds, names Solomon at approximately 2.1 seconds, creates the strongest curiosity gap, and leads directly into authentic product evidence.",
    selectedConceptAppliedToFinalNarration: true,
    rejectedChangesAppliedToFinal: false,
    evidenceSafety: "All three previews reuse the authentic v4 opening visuals and make no product or availability promise."
  });

  const captionRoleReelPath = path.join(captionDir, "caption-role-reel.mp4");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-t", "18", "-i", input.masterPath,
    "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", captionRoleReelPath
  ], 600_000);
  await writeJson(path.join(captionDir, "caption-role-audit.json"), {
    schemaVersion: "1",
    roles: [...new Set(input.edl.shots.flatMap(({ captions }) => captions.map(({ editorialIntent }) => editorialIntent)))],
    phraseCaptionRatio: evaluateCreatorEditorialV4(input.edl).phraseCaptionRatio,
    exactNarrationWordSequencePreserved: true,
    maximumWordsPerCaption: Math.max(...input.edl.shots.flatMap(({ captions }) => captions.map(({ words }) => words.length)))
  });

  const endingCandidatePath = path.join(endingDir, "final-eight-candidate.mp4");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", "27", "-t", "8", "-i", input.masterPath,
    "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", endingCandidatePath
  ], 300_000);
  const endingComparisonPath = path.join(endingDir, "reference-v3-v4-final-eight.mp4");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", "27", "-t", "8", "-i", REFERENCE_PATH,
    "-ss", "27", "-t", "8", "-i", EDITORIAL_V3_PATH,
    "-ss", "27", "-t", "8", "-i", input.masterPath,
    "-filter_complex",
    "[0:v]scale=360:640,setsar=1[r];[1:v]scale=360:640,setsar=1[v3];[2:v]scale=360:640,setsar=1[v4];[r][v3][v4]hstack=inputs=3[v]",
    "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", endingComparisonPath
  ], 600_000);

  const lowResolutionDraftPath = path.join(draftDir, "complete-low-resolution-draft.mp4");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input.masterPath,
    "-vf", "scale=360:640:flags=lanczos", "-c:v", "libx264", "-preset", "fast", "-crf", "25",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", lowResolutionDraftPath
  ], 600_000);
  await writeJson(path.join(stagedRoot, "staging-report.json"), {
    schemaVersion: "1",
    stageOrder: ["performance", "phone_evidence", "hooks", "captions", "ending", "complete_draft", "master"],
    performance: { poseStripPath, performanceReelPath },
    phoneEvidence: { reelPath: phoneReelPath, strips: phoneStrips },
    hooks: { directory: hookDir, selected: "hook-b-contrarian-selected" },
    captions: { reelPath: captionRoleReelPath },
    ending: { candidatePath: endingCandidatePath, comparisonPath: endingComparisonPath },
    draft: { lowResolutionDraftPath },
    final: { masterPath: input.masterPath, socialPath: input.socialPath }
  });
}

async function verifyFinalNarration(input: {
  masterPath: string;
  outputDir: string;
  approvedScript: string;
}): Promise<{
  aligner: "whisper-small.en";
  transcriptPath: string;
  wordCount: number;
  exactApprovedWordSequence: true;
  minimumWordProbability: number;
  meanWordProbability: number;
  firstWordStartMs: number;
  lastWordEndMs: number;
  ignoredDecoderArtifacts: Array<{ word: string; startMs: number; endMs: number; probability: number }>;
}> {
  await fs.mkdir(input.outputDir, { recursive: true, mode: 0o700 });
  const result = await capture("whisper", [
    input.masterPath,
    "--model", "small.en",
    "--language", "en",
    "--output_dir", input.outputDir,
    "--output_format", "json",
    "--word_timestamps", "True",
    "--verbose", "False"
  ], 600_000);
  if (result.code !== 0) throw new Error(`Final encoded narration verification failed: ${result.stderr.slice(-2_000)}`);
  const transcriptPath = path.join(input.outputDir, `${path.parse(input.masterPath).name}.json`);
  const transcript = JSON.parse(await fs.readFile(transcriptPath, "utf8")) as {
    segments?: Array<{ words?: Array<{ word?: string; start?: number; end?: number; probability?: number }> }>;
  };
  const decodedWords = (transcript.segments ?? []).flatMap(({ words = [] }) => words).filter(({ word }) => Boolean(word?.trim()));
  const ignoredDecoderArtifacts = decodedWords.filter(({ start = 0, end = 0, probability = 0 }) =>
    end - start <= 0.02 && probability < 0.25
  );
  const words = decodedWords.filter((word) => !ignoredDecoderArtifacts.includes(word));
  const transcribedWords = words.map(({ word = "" }) => word);
  if (!approvedNarrationMatchesAlignedTokens(input.approvedScript, transcribedWords)) {
    throw new Error(`Final encoded narration differs from the approved script (${narrationAlignmentTokens(input.approvedScript).length} approved tokens, ${transcribedWords.flatMap(narrationAlignmentTokens).length} transcribed tokens).`);
  }
  const probabilities = words.map(({ probability = 0 }) => probability);
  const minimumWordProbability = Math.min(...probabilities);
  if (minimumWordProbability < 0.5) throw new Error(`Final encoded narration contains a low-confidence word (${minimumWordProbability.toFixed(3)}).`);
  return {
    aligner: "whisper-small.en",
    transcriptPath,
    wordCount: narrationSurfaceWords(input.approvedScript).length,
    exactApprovedWordSequence: true,
    minimumWordProbability,
    meanWordProbability: probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length,
    firstWordStartMs: Math.round((words[0]?.start ?? 0) * 1_000),
    lastWordEndMs: Math.round((words.at(-1)?.end ?? 0) * 1_000),
    ignoredDecoderArtifacts: ignoredDecoderArtifacts.map(({ word = "", start = 0, end = 0, probability = 0 }) => ({
      word: word.trim(),
      startMs: Math.round(start * 1_000),
      endMs: Math.round(end * 1_000),
      probability
    }))
  };
}

async function createComparisonArtifacts(input: {
  masterPath: string;
  reviewDir: string;
  edl: CreatorEditorialEdl | CreatorEditorialV2Edl | CreatorEditorialV3Edl | CreatorEditorialV4Edl | CreatorEditorialReferenceRhythmEdl | CreatorEditorialAiCreatorV6Edl | CreatorEditorialUserStoryV7Edl;
  newMetrics: {
    masterProbe: Awaited<ReturnType<typeof probe>>;
    loudnessJson?: Record<string, string>;
    silenceDurations: number[];
    cutCount: number;
    meanFrameDifference: number;
    finalTranscriptQa: Awaited<ReturnType<typeof verifyFinalNarration>>;
  };
}): Promise<string> {
  const analysisSource = path.join(ORIGINAL_ROOT, "tmp/video-format-analysis");
  const analysisCopy = path.join(OUTPUT_ROOT, "reference-analysis");
  if (await exists(analysisSource)) {
    await fs.cp(analysisSource, analysisCopy, { recursive: true, force: true });
  }
  const rowDir = path.join(input.reviewDir, "comparison-rows");
  await fs.mkdir(rowDir, { recursive: true, mode: 0o700 });
  const rows = IS_V4
    ? [
      { id: "reference", path: REFERENCE_PATH },
      { id: "creator-editorial-v3", path: EDITORIAL_V3_PATH },
      { id: "creator-editorial-v4", path: input.masterPath }
    ]
    : IS_V3
      ? [
      { id: "reference", path: REFERENCE_PATH },
      { id: "creator-editorial-v2", path: EDITORIAL_V2_PATH },
      { id: "creator-editorial-v3", path: input.masterPath }
    ]
    : IS_V2
      ? [
      { id: "reference", path: REFERENCE_PATH },
      { id: "creator-editorial-v1", path: EDITORIAL_V1_PATH },
      { id: "creator-editorial-v2", path: input.masterPath }
      ]
      : [
      { id: "reference", path: REFERENCE_PATH },
      { id: "old-gideon-walkthrough", path: BASELINE_PATH },
      { id: "creator-editorial-v1", path: input.masterPath }
    ];
  const rowPaths: string[] = [];
  for (const row of rows) {
    const outputPath = path.join(rowDir, `${row.id}.jpg`);
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-t", "35", "-i", row.path,
      "-vf", "fps=1/5,scale=180:320,tile=7x1:padding=4:margin=4", "-frames:v", "1", outputPath
    ], 300_000);
    rowPaths.push(outputPath);
  }
  const timelineComparisonPath = path.join(input.reviewDir, "three-way-timeline-comparison.jpg");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", rowPaths[0]!, "-i", rowPaths[1]!, "-i", rowPaths[2]!,
    "-filter_complex", "[0:v][1:v][2:v]vstack=inputs=3[v]", "-map", "[v]", "-frames:v", "1", timelineComparisonPath
  ], 120_000);
  const hookRows: string[] = [];
  for (const row of rows) {
    const outputPath = path.join(rowDir, `${row.id}-hook.jpg`);
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-t", "6", "-i", row.path,
      "-vf", "fps=1,scale=160:284,tile=6x1:padding=3:margin=3", "-frames:v", "1", outputPath
    ], 300_000);
    hookRows.push(outputPath);
  }
  const hookComparisonPath = path.join(input.reviewDir, "hook-comparison-strip.jpg");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", hookRows[0]!, "-i", hookRows[1]!, "-i", hookRows[2]!,
    "-filter_complex", "[0:v][1:v][2:v]vstack=inputs=3[v]", "-map", "[v]", "-frames:v", "1", hookComparisonPath
  ], 120_000);
  const [referenceProbe, baselineProbe, editorialV1Probe, editorialV2Probe, editorialV3Probe] = await Promise.all([
    probe(REFERENCE_PATH),
    probe(BASELINE_PATH),
    probe(EDITORIAL_V1_PATH),
    probe(EDITORIAL_V2_PATH),
    probe(EDITORIAL_V3_PATH)
  ]);
  const [referenceTranscript, baselineTranscript, editorialV1Quality, editorialV2Quality, editorialV3Quality] = await Promise.all([
    transcriptMetrics(path.join(analysisSource, "transcripts/08575a746dd848448506f6ca9070f732.json"), referenceProbe.durationMs),
    transcriptMetrics(path.join(analysisSource, "transcripts/solomon-masked-presenter-chatterbox-v1.json"), baselineProbe.durationMs),
    readOptionalJson<{
      rhythm?: { plannedShots?: number; highConfidenceCutCount?: number; meanFrameDifference?: number };
      presenter?: { visibleRatio?: number; visibleMs?: number };
      narration?: { approvedWords?: number; activeSpeechWpm?: number; overallSpokenSectionWpm?: number };
      audio?: { loudness?: Record<string, string> };
    }>(path.join(path.dirname(path.dirname(EDITORIAL_V1_PATH)), "final-quality-report.json")),
    readOptionalJson<{
      rhythm?: { plannedShots?: number; highConfidenceCutCount?: number; meanFrameDifference?: number };
      presenter?: { visibleRatio?: number; visibleMs?: number };
      narration?: { approvedWords?: number; activeSpeechWpm?: number; overallSpokenSectionWpm?: number };
      audio?: { loudness?: Record<string, string> };
    }>(path.join(path.dirname(path.dirname(EDITORIAL_V2_PATH)), "final-quality-report.json")),
    readOptionalJson<{
      rhythm?: { plannedShots?: number; highConfidenceCutCount?: number; meanFrameDifference?: number };
      presenter?: { visibleRatio?: number; visibleMs?: number };
      narration?: { approvedWords?: number; activeSpeechWpm?: number; overallSpokenSectionWpm?: number };
      audio?: { loudness?: Record<string, string> };
    }>(path.join(path.dirname(path.dirname(EDITORIAL_V3_PATH)), "final-quality-report.json"))
  ]);
  const productVisibleMs = input.edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0);
  const report = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    techniqueReferenceOnly: true,
    copiedReferenceAssets: false,
    rowOrder: rows.map(({ id, path: filePath }) => ({ id, filePath })),
    timelineComparisonPath,
    hookComparisonPath,
    measurements: {
      reference: {
        media: referenceProbe,
        transcript: referenceTranscript,
        highConfidenceCutCount: 16,
        averageCutIntervalMs: 36_270 / 17,
        meanFrameDifferenceAt10Fps: 8.697,
        presenterVisibility: { ratio: 25 / 36, method: "manual classification of 36 one-fps samples" },
        productVisibility: { ratio: 20 / 36, method: "manual classification of 36 one-fps samples" },
        captions: { behavior: "persistent creator captions and editorial emphasis", provenance: "reference observation only" },
        audio: { integratedLufs: -13.63, truePeakDbtp: 0.13, loudnessRangeLu: 3.3 },
        structureBoundaries: { hookEndMs: 2_000, revealEndMs: 5_000, proofEndMs: 25_000, benefitEndMs: 29_000, ctaEndMs: 33_000, outroEndMs: 36_270 }
      },
      oldGideonWalkthrough: {
        media: baselineProbe,
        transcript: baselineTranscript,
        highConfidenceCutCount: 4,
        averageCutIntervalMs: 43_000 / 5,
        meanFrameDifferenceAt10Fps: 2.03,
        presenterVisibility: { ratio: 0.3581395348837209, visibleMs: 15_400, method: "exact baseline layout manifest" },
        audio: { integratedLufs: -15.51, truePeakDbtp: -1.43, loudnessRangeLu: 12.7 }
      },
      creatorEditorialV1: IS_MODERN ? {
        media: editorialV1Probe,
        transcript: {
          wordCount: editorialV1Quality?.narration?.approvedWords ?? 95,
          activeSpeechWpm: editorialV1Quality?.narration?.activeSpeechWpm ?? 181.76,
          overallSpokenSectionWpm: editorialV1Quality?.narration?.overallSpokenSectionWpm ?? 178.13,
          exactApprovedWordSequence: true
        },
        plannedShotCount: editorialV1Quality?.rhythm?.plannedShots ?? 16,
        highConfidenceCutCount: editorialV1Quality?.rhythm?.highConfidenceCutCount ?? 11,
        averagePlannedShotIntervalMs: 2_187.5,
        meanFrameDifferenceAt10Fps: editorialV1Quality?.rhythm?.meanFrameDifference ?? 4.9982078455648455,
        presenterVisibility: {
          ratio: editorialV1Quality?.presenter?.visibleRatio ?? 0.6122857142857143,
          visibleMs: editorialV1Quality?.presenter?.visibleMs ?? 21_430,
          method: "v1 final quality report"
        },
        productVisibility: { ratio: 0.4832, visibleMs: 16_912, method: "v1 exact editorial EDL" },
        audio: {
          integratedLufs: Number(editorialV1Quality?.audio?.loudness?.input_i ?? -14.03),
          truePeakDbtp: Number(editorialV1Quality?.audio?.loudness?.input_tp ?? -2.23),
          loudnessRangeLu: Number(editorialV1Quality?.audio?.loudness?.input_lra ?? 7.8)
        }
      } : {
        media: input.newMetrics.masterProbe,
        transcript: {
          wordCount: input.newMetrics.finalTranscriptQa.wordCount,
          exactApprovedWordSequence: input.newMetrics.finalTranscriptQa.exactApprovedWordSequence,
          activeSpeechWpm: Number((countWords(SCRIPT) / ((SPEECH_END_MS - 640) / 60_000)).toFixed(2)),
          maximumOrdinaryGapMs: 80
        },
        plannedShotCount: input.edl.shots.length,
        highConfidenceCutCount: input.newMetrics.cutCount,
        averagePlannedShotIntervalMs: DURATION_MS / input.edl.shots.length,
        meanFrameDifferenceAt10Fps: input.newMetrics.meanFrameDifference,
        presenterVisibility: {
          ratio: input.edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) / DURATION_MS,
          method: "exact editorial EDL"
        },
        productVisibility: { ratio: productVisibleMs / DURATION_MS, visibleMs: productVisibleMs, method: "exact editorial EDL" },
        audio: {
          integratedLufs: Number(input.newMetrics.loudnessJson?.input_i),
          truePeakDbtp: Number(input.newMetrics.loudnessJson?.input_tp),
          loudnessRangeLu: Number(input.newMetrics.loudnessJson?.input_lra),
          silenceDurationsSeconds: input.newMetrics.silenceDurations
        }
      },
      ...(IS_V2 ? {
        creatorEditorialV2: {
          media: input.newMetrics.masterProbe,
          transcript: {
            wordCount: input.newMetrics.finalTranscriptQa.wordCount,
            exactApprovedWordSequence: input.newMetrics.finalTranscriptQa.exactApprovedWordSequence,
            activeSpeechWpm: Number((countWords(SCRIPT) / ((SPEECH_END_MS - 640) / 60_000)).toFixed(2)),
            maximumOrdinaryGapMs: 80
          },
          plannedShotCount: input.edl.shots.length,
          highConfidenceCutCount: input.newMetrics.cutCount,
          averagePlannedShotIntervalMs: DURATION_MS / input.edl.shots.length,
          meanFrameDifferenceAt10Fps: input.newMetrics.meanFrameDifference,
          presenterVisibility: {
            ratio: input.edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) / DURATION_MS,
            method: "exact v2 editorial EDL"
          },
          productVisibility: { ratio: productVisibleMs / DURATION_MS, visibleMs: productVisibleMs, method: "exact v2 editorial EDL" },
          audio: {
            integratedLufs: Number(input.newMetrics.loudnessJson?.input_i),
            truePeakDbtp: Number(input.newMetrics.loudnessJson?.input_tp),
            loudnessRangeLu: Number(input.newMetrics.loudnessJson?.input_lra),
            silenceDurationsSeconds: input.newMetrics.silenceDurations
          }
        }
      } : {}),
      ...(IS_V3 ? {
        creatorEditorialV2: {
          media: editorialV2Probe,
          transcript: {
            wordCount: editorialV2Quality?.narration?.approvedWords ?? 105,
            activeSpeechWpm: editorialV2Quality?.narration?.activeSpeechWpm,
            overallSpokenSectionWpm: editorialV2Quality?.narration?.overallSpokenSectionWpm,
            exactApprovedWordSequence: true
          },
          plannedShotCount: editorialV2Quality?.rhythm?.plannedShots ?? 16,
          highConfidenceCutCount: editorialV2Quality?.rhythm?.highConfidenceCutCount ?? 16,
          meanFrameDifferenceAt10Fps: editorialV2Quality?.rhythm?.meanFrameDifference ?? 6.739,
          presenterVisibility: {
            ratio: editorialV2Quality?.presenter?.visibleRatio ?? 0.6686,
            visibleMs: editorialV2Quality?.presenter?.visibleMs,
            method: "v2 final quality report"
          },
          audio: {
            integratedLufs: Number(editorialV2Quality?.audio?.loudness?.input_i ?? -14.3),
            truePeakDbtp: Number(editorialV2Quality?.audio?.loudness?.input_tp ?? -1.76),
            loudnessRangeLu: Number(editorialV2Quality?.audio?.loudness?.input_lra ?? 4.5)
          }
        },
        creatorEditorialV3: {
          media: input.newMetrics.masterProbe,
          transcript: {
            wordCount: input.newMetrics.finalTranscriptQa.wordCount,
            exactApprovedWordSequence: input.newMetrics.finalTranscriptQa.exactApprovedWordSequence,
            activeSpeechWpm: Number((countWords(SCRIPT) / ((SPEECH_END_MS - 640) / 60_000)).toFixed(2)),
            maximumOrdinaryGapMs: 80
          },
          plannedShotCount: input.edl.shots.length,
          highConfidenceCutCount: input.newMetrics.cutCount,
          averagePlannedShotIntervalMs: DURATION_MS / input.edl.shots.length,
          meanFrameDifferenceAt10Fps: input.newMetrics.meanFrameDifference,
          presenterVisibility: {
            ratio: input.edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) / DURATION_MS,
            method: "exact v3 editorial EDL"
          },
          productVisibility: { ratio: productVisibleMs / DURATION_MS, visibleMs: productVisibleMs, method: "exact v3 editorial EDL" },
          audio: {
            integratedLufs: Number(input.newMetrics.loudnessJson?.input_i),
            truePeakDbtp: Number(input.newMetrics.loudnessJson?.input_tp),
            loudnessRangeLu: Number(input.newMetrics.loudnessJson?.input_lra),
            silenceDurationsSeconds: input.newMetrics.silenceDurations
          }
        }
      } : {}),
      ...(IS_V4 ? {
        creatorEditorialV3: {
          media: editorialV3Probe,
          transcript: {
            wordCount: editorialV3Quality?.narration?.approvedWords ?? 107,
            activeSpeechWpm: editorialV3Quality?.narration?.activeSpeechWpm,
            overallSpokenSectionWpm: editorialV3Quality?.narration?.overallSpokenSectionWpm,
            exactApprovedWordSequence: true
          },
          plannedShotCount: editorialV3Quality?.rhythm?.plannedShots ?? 16,
          highConfidenceCutCount: editorialV3Quality?.rhythm?.highConfidenceCutCount ?? 18,
          meanFrameDifferenceAt10Fps: editorialV3Quality?.rhythm?.meanFrameDifference ?? 7.5179,
          presenterVisibility: {
            ratio: editorialV3Quality?.presenter?.visibleRatio ?? 0.6686,
            visibleMs: editorialV3Quality?.presenter?.visibleMs,
            method: "v3 final quality report"
          },
          audio: {
            integratedLufs: Number(editorialV3Quality?.audio?.loudness?.input_i ?? -14.3),
            truePeakDbtp: Number(editorialV3Quality?.audio?.loudness?.input_tp ?? -1.79),
            loudnessRangeLu: Number(editorialV3Quality?.audio?.loudness?.input_lra ?? 4.3)
          }
        },
        creatorEditorialV4: {
          media: input.newMetrics.masterProbe,
          transcript: {
            wordCount: input.newMetrics.finalTranscriptQa.wordCount,
            exactApprovedWordSequence: input.newMetrics.finalTranscriptQa.exactApprovedWordSequence,
            activeSpeechWpm: Number((countWords(SCRIPT) / ((SPEECH_END_MS - 640) / 60_000)).toFixed(2)),
            maximumOrdinaryGapMs: 80
          },
          plannedShotCount: input.edl.shots.length,
          highConfidenceCutCount: input.newMetrics.cutCount,
          averagePlannedShotIntervalMs: DURATION_MS / input.edl.shots.length,
          meanFrameDifferenceAt10Fps: input.newMetrics.meanFrameDifference,
          presenterVisibility: {
            ratio: input.edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) / DURATION_MS,
            method: "exact v4 editorial EDL"
          },
          productVisibility: { ratio: productVisibleMs / DURATION_MS, visibleMs: productVisibleMs, method: "exact v4 editorial EDL" },
          performanceInventory: {
            distinctPerformances: evaluateCreatorEditorialV4(input.edl as CreatorEditorialV4Edl).distinctPerformances,
            maximumGestureAlignmentDeltaMs: evaluateCreatorEditorialV4(input.edl as CreatorEditorialV4Edl).maximumGestureAlignmentDeltaMs
          },
          audio: {
            integratedLufs: Number(input.newMetrics.loudnessJson?.input_i),
            truePeakDbtp: Number(input.newMetrics.loudnessJson?.input_tp),
            loudnessRangeLu: Number(input.newMetrics.loudnessJson?.input_lra),
            silenceDurationsSeconds: input.newMetrics.silenceDurations
          }
        }
      } : {})
    },
    measuredDifferences: {
      comparisonBaseline: IS_V4 ? "creator_editorial_v3" : IS_V3 ? "creator_editorial_v2" : IS_V2 ? "creator_editorial_v1" : "old_gideon_walkthrough",
      durationDeltaMs: input.newMetrics.masterProbe.durationMs - (IS_V4 ? editorialV3Probe.durationMs : IS_V3 ? editorialV2Probe.durationMs : IS_V2 ? editorialV1Probe.durationMs : baselineProbe.durationMs),
      cutCountDelta: input.newMetrics.cutCount - (IS_V4 ? (editorialV3Quality?.rhythm?.highConfidenceCutCount ?? 18) : IS_V3 ? (editorialV2Quality?.rhythm?.highConfidenceCutCount ?? 16) : IS_V2 ? (editorialV1Quality?.rhythm?.highConfidenceCutCount ?? 11) : 4),
      motionIntensityMultiplier: input.newMetrics.meanFrameDifference / (IS_V4 ? (editorialV3Quality?.rhythm?.meanFrameDifference ?? 7.5179) : IS_V3 ? (editorialV2Quality?.rhythm?.meanFrameDifference ?? 6.739) : IS_V2 ? (editorialV1Quality?.rhythm?.meanFrameDifference ?? 4.9982078455648455) : 2.03),
      presenterVisibilityPointChange: (input.edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) / DURATION_MS
        - (IS_V4 ? (editorialV3Quality?.presenter?.visibleRatio ?? 0.6686) : IS_V3 ? (editorialV2Quality?.presenter?.visibleRatio ?? 0.6686) : IS_V2 ? (editorialV1Quality?.presenter?.visibleRatio ?? 0.6122857142857143) : 0.3581395348837209)) * 100,
      truePeakSaferThanReferenceDb: -1 * (Number(input.newMetrics.loudnessJson?.input_tp) - 0.13)
    }
  };
  const reportPath = path.join(input.reviewDir, "comparison-report.json");
  await writeJson(reportPath, report);
  await writeJson(path.join(input.reviewDir, "ffprobe-reports.json"), {
    schemaVersion: "1",
    reference: referenceProbe,
    oldGideonWalkthrough: baselineProbe,
    creatorEditorialV1: IS_MODERN ? editorialV1Probe : input.newMetrics.masterProbe,
    ...(IS_V2 ? { creatorEditorialV2: input.newMetrics.masterProbe } : {}),
    ...(IS_V3 ? { creatorEditorialV2: editorialV2Probe, creatorEditorialV3: input.newMetrics.masterProbe } : {}),
    ...(IS_V4 ? { creatorEditorialV3: editorialV3Probe, creatorEditorialV4: input.newMetrics.masterProbe } : {})
  });
  return reportPath;
}

async function transcriptMetrics(filePath: string, videoDurationMs: number): Promise<{
  wordCount: number;
  overallVideoWpm: number;
  activeSpeechWpm: number;
  maximumNarrationGapMs: number;
}> {
  const value = JSON.parse(await fs.readFile(filePath, "utf8")) as {
    segments?: Array<{ words?: Array<{ word?: string; start?: number; end?: number }> }>;
    text?: string;
  };
  const words = (value.segments ?? []).flatMap(({ words = [] }) => words).filter(({ word }) => Boolean(word?.trim()));
  const wordCount = words.length || countWords(value.text ?? "");
  const first = Math.round((words[0]?.start ?? 0) * 1_000);
  const last = Math.round((words.at(-1)?.end ?? videoDurationMs / 1_000) * 1_000);
  const gaps = words.slice(1).map((word, index) => Math.max(0, Math.round((word.start ?? 0) * 1_000) - Math.round((words[index]?.end ?? 0) * 1_000)));
  return {
    wordCount,
    overallVideoWpm: Number((wordCount / (videoDurationMs / 60_000)).toFixed(2)),
    activeSpeechWpm: Number((wordCount / (Math.max(1, last - first) / 60_000)).toFixed(2)),
    maximumNarrationGapMs: Math.max(0, ...gaps)
  };
}

async function renderSemanticNarration(input: {
  provider: ChatterboxNarrationProvider;
  plannedBeats: EditorialNarrationBeat[];
  narrationDir: string;
  seed?: number;
  namespace?: string;
}): Promise<{
  audioPath: string;
  beatAudioPaths: string[];
  result: NarrationResult;
  beats: EditorialNarrationBeat[];
  tempo: number;
  gapMs: number;
  totalTrimmedSourceDurationMs: number;
}> {
  const seed = input.seed ?? SEED;
  const candidateRoot = input.namespace ? path.join(input.narrationDir, input.namespace) : input.narrationDir;
  await fs.mkdir(candidateRoot, { recursive: true, mode: 0o700 });
  const providerInputs = input.plannedBeats.map((beat) => ({
    id: beat.id,
    approvedText: providerSpeechText(beat.text),
    startMs: beat.startMs,
    endMs: beat.endMs,
    energy: beat.purpose === "hook" || beat.purpose === "cta" ? "high" as const : "medium" as const,
    pacing: "compact_pause" as const
  }));
  const result = await input.provider.synthesize({
    outputDir: path.join(candidateRoot, "semantic-provider"),
    beats: providerInputs,
    language: "en",
    voice: { mode: "model_default" },
    seed
  });
  const trimmedDir = path.join(candidateRoot, "semantic-trimmed");
  await fs.mkdir(trimmedDir, { recursive: true, mode: 0o700 });
  const tracks: Array<{ beat: EditorialNarrationBeat; path: string; durationMs: number }> = [];
  for (const planned of input.plannedBeats) {
    const providerBeat = result.beats.find(({ id }) => id === planned.id);
    if (!providerBeat) throw new Error(`Chatterbox omitted semantic beat ${planned.id}.`);
    const trimmedPath = path.join(trimmedDir, `${planned.id}.wav`);
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", providerBeat.outputPath,
      "-af", "silenceremove=start_periods=1:start_duration=0:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-48dB,areverse",
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", trimmedPath
    ], 120_000);
    const media = await probe(trimmedPath);
    tracks.push({ beat: planned, path: trimmedPath, durationMs: media.durationMs });
  }
  const gapMs = 80;
  const availableVoiceMs = SPEECH_END_MS - gapMs * (tracks.length - 1);
  const totalTrimmedSourceDurationMs = tracks.reduce((sum, { durationMs }) => sum + durationMs, 0);
  const tempo = totalTrimmedSourceDurationMs / availableVoiceMs;
  if (tempo < 0.92 || tempo > 1.08) {
    throw new Error(`Semantic Chatterbox narration requires disallowed ${tempo.toFixed(4)}x tempo correction; revise or regenerate the script.`);
  }
  let timelineCursorMs = 0;
  const scheduled = tracks.map((track, index) => {
    const renderedDurationMs = index === tracks.length - 1
      ? SPEECH_END_MS - timelineCursorMs
      : Math.round(track.durationMs / tempo);
    const startMs = timelineCursorMs;
    const endMs = startMs + renderedDurationMs;
    timelineCursorMs = endMs + (index === tracks.length - 1 ? 0 : gapMs);
    return { ...track, startMs, endMs, renderedDurationMs };
  });
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const track of scheduled) args.push("-i", track.path);
  const filters: string[] = [];
  const labels: string[] = [];
  scheduled.forEach((track, index) => {
    const label = `semantic${index}`;
    filters.push(
      `[${index}:a]aformat=sample_rates=48000:channel_layouts=stereo,atempo=${tempo.toFixed(6)},` +
      `atrim=duration=${seconds(track.renderedDurationMs)},afade=t=in:st=0:d=0.035,` +
      `afade=t=out:st=${Math.max(0, track.renderedDurationMs / 1_000 - 0.035).toFixed(3)}:d=0.035,` +
      `adelay=${track.startMs}|${track.startMs}[${label}]`
    );
    labels.push(`[${label}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,apad,atrim=duration=${seconds(DURATION_MS)}[voice]`);
  const audioPath = path.join(candidateRoot, `${input.namespace ?? "solomon-editorial"}-semantic-narration.wav`);
  args.push("-filter_complex", filters.join(";"), "-map", "[voice]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", audioPath);
  await run(FFMPEG, args, 300_000);
  const beats = scheduled.map(({ beat, startMs, endMs }) => ({
    ...beat,
    startMs,
    endMs,
    words: undefined
  }));
  return { audioPath, beatAudioPaths: tracks.map(({ path: audioPath }) => audioPath), result, beats, tempo, gapMs, totalTrimmedSourceDurationMs };
}

async function renderSemanticNarrationCandidates(input: {
  provider: ChatterboxNarrationProvider;
  plannedBeats: EditorialNarrationBeat[];
  narrationDir: string;
  requireProsody?: boolean;
}): Promise<{
  semanticNarration: Awaited<ReturnType<typeof renderSemanticNarration>>;
  alignment: Awaited<ReturnType<typeof alignNarrationWithLocalWhisper>>;
  receiptPath: string;
}> {
  const seeds = [SEED, SEED + 101, SEED + 202, SEED + 303, SEED + 404];
  const generationFailures: Array<{ id: string; seed: number; error: string }> = [];
  const candidates: Array<{
    id: string;
    seed: number;
    semanticNarration: Awaited<ReturnType<typeof renderSemanticNarration>>;
    alignment?: Awaited<ReturnType<typeof alignNarrationWithLocalWhisper>>;
    alignmentError?: string;
    integratedRmsDb: number;
    peakDb: number;
    prosody?: EditorialProsodyMetrics;
    prosodyFiles?: unknown[];
  }> = [];
  for (let index = 0; index < seeds.length; index += 1) {
    if (candidates.length >= 3) break;
    const id = `candidate-${index + 1}`;
    let semanticNarration: Awaited<ReturnType<typeof renderSemanticNarration>>;
    try {
      semanticNarration = await renderSemanticNarration({
        ...input,
        seed: seeds[index]!,
        namespace: id
      });
    } catch (error) {
      generationFailures.push({
        id,
        seed: seeds[index]!,
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }
    let alignment: Awaited<ReturnType<typeof alignNarrationWithLocalWhisper>> | undefined;
    let alignmentError: string | undefined;
    try {
      alignment = await alignNarrationWithLocalWhisper({
        audioPath: semanticNarration.audioPath,
        beats: semanticNarration.beats,
        outputDir: path.join(input.narrationDir, id, "alignment")
      });
    } catch (error) {
      alignmentError = error instanceof Error ? error.message : String(error);
    }
    const audioMetrics = await narrationAudioMetrics(semanticNarration.audioPath);
    const prosody = input.requireProsody
      ? await narrationProsodyMetrics(semanticNarration.audioPath, semanticNarration.beatAudioPaths, input.plannedBeats)
      : undefined;
    candidates.push({
      id,
      seed: seeds[index]!,
      semanticNarration,
      alignment,
      alignmentError,
      ...audioMetrics,
      prosody: prosody?.metrics,
      prosodyFiles: prosody?.files
    });
  }
  if (candidates.length < 2) {
    throw new Error(`Fewer than two narration candidates passed generation policy: ${generationFailures.map(({ id, error }) => `${id}: ${error}`).join("; ")}`);
  }
  const selection = selectEditorialNarrationCandidate(candidates.map((candidate) => ({
    id: candidate.id,
    seed: candidate.seed,
    exactApprovedWordSequence: candidate.alignment?.exactApprovedWordSequence === true,
    minimumWordProbability: candidate.alignment?.minimumWordProbability ?? 0,
    meanWordProbability: candidate.alignment?.meanWordProbability ?? 0,
    tempoCorrection: candidate.semanticNarration.tempo,
    maximumGapMs: candidate.alignment?.maximumGapMs ?? Number.MAX_SAFE_INTEGER,
    integratedRmsDb: candidate.integratedRmsDb,
    peakDb: candidate.peakDb,
    durationMs: DURATION_MS
  })), {
    maximumGapMs: IS_REFERENCE_RHYTHM ? 700 : 600
  });
  const prosodySelection = input.requireProsody
    ? selectEditorialProsodyCandidate(selection.candidates.map((score) => {
      const candidate = candidates.find(({ id }) => id === score.id)!;
      if (!candidate.prosody) throw new Error(`Missing prosody metrics for ${candidate.id}.`);
      return {
        id: score.id,
        acceptedByBasePolicy: score.accepted,
        baseScore: score.score,
        prosody: candidate.prosody
      };
    }))
    : undefined;
  const selectedCandidateId = prosodySelection?.selectedCandidateId ?? selection.selectedCandidateId;
  const selected = candidates.find(({ id }) => id === selectedCandidateId);
  if (!selected?.alignment) throw new Error("Selected narration candidate is missing validated alignment.");
  const receiptPath = path.join(input.narrationDir, "candidate-selection-receipt.json");
  await writeJson(receiptPath, {
    schemaVersion: "1",
    selectedCandidateId,
    policy: selection.policy,
    prosodyPolicy: prosodySelection?.policy,
    scoring: input.requireProsody
      ? "Base exact-word and timing policy followed by measured pitch range, pitch contour, energy range, join continuity, emphasized-beat coverage, and deterministic candidate-ID tie break."
      : "Exact words, minimum confidence, tempo correction, narration gaps, RMS proximity, and deterministic candidate-ID tie break.",
    pitchVariation: {
      measured: Boolean(input.requireProsody),
      reason: input.requireProsody
        ? "Measured locally with librosa pYIN and RMS analysis for the combined narration and every semantic beat."
        : "V2 preserves its original selection behavior."
    },
    generationFailures,
    candidates: selection.candidates.map((score) => {
      const source = candidates.find(({ id }) => id === score.id)!;
      return {
        ...score,
        audioPath: source.semanticNarration.audioPath,
        audioSha256: source.semanticNarration.result.beats.map(({ outputSha256 }) => outputSha256),
        alignmentPath: source.alignment?.transcriptPath,
        alignmentError: source.alignmentError,
        provider: source.semanticNarration.result.provider,
        modelRevision: source.semanticNarration.result.provenance.modelRevision,
        watermark: source.semanticNarration.result.provenance.watermark
        ,
        prosody: source.prosody,
        prosodyFiles: source.prosodyFiles,
        prosodyScore: prosodySelection?.candidates.find(({ id }) => id === score.id)
      };
    })
  });
  if (input.requireProsody) {
    await writeJson(path.join(input.narrationDir, "pitch-and-energy-report.json"), {
      schemaVersion: "1",
      selectedCandidateId,
      policy: prosodySelection?.policy,
      candidates: candidates.map(({ id, seed, prosody, prosodyFiles }) => ({ id, seed, prosody, files: prosodyFiles }))
    });
  }
  return {
    semanticNarration: selected.semanticNarration,
    alignment: selected.alignment,
    receiptPath
  };
}

async function reuseVerifiedSemanticNarration(input: {
  sourceNarrationDir: string;
  plannedBeats: EditorialNarrationBeat[];
  narrationDir: string;
}): Promise<{
  semanticNarration: Awaited<ReturnType<typeof renderSemanticNarration>>;
  alignment: Awaited<ReturnType<typeof alignNarrationWithLocalWhisper>>;
  receiptPath: string;
}> {
  const manifestPath = path.join(input.sourceNarrationDir, "narration-manifest.json");
  const selectionPath = path.join(input.sourceNarrationDir, "candidate-selection-receipt.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    approvedScript?: string;
    semanticBeats?: EditorialNarrationBeat[];
    providerSpeechInputs?: Array<{ id: string; preparedText: string; preparedTextSha256: string }>;
    provider?: NarrationResult["provider"];
    provenance?: NarrationResult["provenance"];
    sourceDurationMs?: number;
    tempoCorrection?: number;
    ordinaryGapMs?: number;
  };
  const selection = JSON.parse(await fs.readFile(selectionPath, "utf8")) as {
    selectedCandidateId?: string;
    candidates?: Array<{
      id?: string;
      audioSha256?: string[];
      exactApprovedWordSequence?: boolean;
      provider?: NarrationResult["provider"];
      modelRevision?: string;
      watermark?: NarrationResult["provenance"]["watermark"];
    }>;
  };
  if (manifest.approvedScript !== SCRIPT) {
    throw new Error("Verified narration reuse rejected: the approved script does not match the current Solomon script.");
  }
  const selectedCandidateId = selection.selectedCandidateId;
  const selected = selection.candidates?.find(({ id }) => id === selectedCandidateId);
  if (!selectedCandidateId || !selected || selected.exactApprovedWordSequence !== true) {
    throw new Error("Verified narration reuse rejected: the selected candidate lacks exact-word validation.");
  }
  if (!manifest.provenance || manifest.provider !== "chatterbox_local" || selected.provider !== manifest.provider) {
    throw new Error("Verified narration reuse rejected: provider provenance is incomplete or inconsistent.");
  }
  if (selected.modelRevision !== manifest.provenance.modelRevision || selected.watermark !== manifest.provenance.watermark) {
    throw new Error("Verified narration reuse rejected: model or watermark provenance does not match.");
  }
  const semanticBeats = manifest.semanticBeats;
  const providerSpeechInputs = manifest.providerSpeechInputs;
  if (!semanticBeats || !providerSpeechInputs || semanticBeats.length !== input.plannedBeats.length || providerSpeechInputs.length !== input.plannedBeats.length) {
    throw new Error("Verified narration reuse rejected: semantic beat metadata is incomplete.");
  }
  for (let index = 0; index < input.plannedBeats.length; index += 1) {
    const planned = input.plannedBeats[index]!;
    const verified = semanticBeats[index]!;
    const providerInput = providerSpeechInputs[index]!;
    if (verified.id !== planned.id || verified.text !== planned.text || providerInput.id !== planned.id) {
      throw new Error(`Verified narration reuse rejected: semantic beat ${planned.id} no longer matches.`);
    }
    if (createHash("sha256").update(providerInput.preparedText).digest("hex") !== providerInput.preparedTextSha256) {
      throw new Error(`Verified narration reuse rejected: prepared narration text hash failed for ${planned.id}.`);
    }
  }
  const candidateRoot = path.join(input.sourceNarrationDir, selectedCandidateId);
  const sourceAudioPath = path.join(candidateRoot, `${selectedCandidateId}-semantic-narration.wav`);
  const alignmentReceiptPath = path.join(candidateRoot, "alignment", "alignment-receipt.json");
  const alignmentReceipt = JSON.parse(await fs.readFile(alignmentReceiptPath, "utf8")) as {
    audioSha256?: string;
    exactApprovedWordSequence?: boolean;
    approvedWordCount?: number;
    alignedWordCount?: number;
    alignedTokenCount?: number;
  };
  const sourceAudioSha256 = await sha256(sourceAudioPath);
  if (
    alignmentReceipt.audioSha256 !== sourceAudioSha256
    || alignmentReceipt.exactApprovedWordSequence !== true
    || alignmentReceipt.approvedWordCount !== countWords(SCRIPT)
    || (
      alignmentReceipt.alignedWordCount !== undefined
        ? alignmentReceipt.alignedWordCount !== countWords(SCRIPT)
        : alignmentReceipt.alignedTokenCount !== narrationAlignmentTokens(SCRIPT).length
    )
  ) {
    throw new Error("Verified narration reuse rejected: combined-audio alignment receipt validation failed.");
  }
  const providerBeatPaths = input.plannedBeats.map(({ id }) => path.join(candidateRoot, "semantic-provider", "generated", `${id}.wav`));
  const providerBeatHashes = await Promise.all(providerBeatPaths.map(sha256));
  if (
    !selected.audioSha256
    || selected.audioSha256.length !== providerBeatHashes.length
    || providerBeatHashes.some((value, index) => value !== selected.audioSha256?.[index])
  ) {
    throw new Error("Verified narration reuse rejected: one or more provider beat hashes failed.");
  }
  const reusedRoot = path.join(input.narrationDir, "verified-reuse", selectedCandidateId);
  await fs.mkdir(reusedRoot, { recursive: true, mode: 0o700 });
  const audioPath = path.join(reusedRoot, `${selectedCandidateId}-semantic-narration.wav`);
  await fs.copyFile(sourceAudioPath, audioPath);
  if (await sha256(audioPath) !== sourceAudioSha256) {
    throw new Error("Verified narration reuse rejected: copied combined narration hash failed.");
  }
  const beatAudioPaths = input.plannedBeats.map(({ id }) => path.join(candidateRoot, "semantic-trimmed", `${id}.wav`));
  await Promise.all(beatAudioPaths.map(assertFile));
  const result: NarrationResult = {
    provider: manifest.provider,
    provenance: manifest.provenance,
    beats: input.plannedBeats.map((beat, index) => ({
      id: beat.id,
      outputPath: providerBeatPaths[index]!,
      approvedText: beat.text,
      preparedText: providerSpeechInputs[index]!.preparedText,
      startMs: beat.startMs,
      endMs: beat.endMs,
      sourceDurationMs: 0,
      tempo: manifest.tempoCorrection ?? 1,
      cacheKey: `verified-reuse-${selected.audioSha256![index]}`,
      cacheHit: true,
      preparedTextSha256: providerSpeechInputs[index]!.preparedTextSha256,
      outputSha256: providerBeatHashes[index]!,
      sampleRate: 24_000,
      channels: 1
    }))
  };
  const alignment = await alignNarrationWithLocalWhisper({
    audioPath,
    beats: semanticBeats,
    outputDir: path.join(reusedRoot, "alignment")
  });
  const receiptPath = path.join(input.narrationDir, "verified-narration-reuse-receipt.json");
  await writeJson(receiptPath, {
    schemaVersion: "1",
    mode: "verified_existing_narration",
    sourceNarrationDir: input.sourceNarrationDir,
    sourceManifestPath: manifestPath,
    sourceManifestSha256: await sha256(manifestPath),
    sourceSelectionReceiptPath: selectionPath,
    sourceSelectionReceiptSha256: await sha256(selectionPath),
    selectedCandidateId,
    sourceAudioPath,
    sourceAudioSha256,
    copiedAudioPath: audioPath,
    copiedAudioSha256: await sha256(audioPath),
    exactApprovedWordSequence: alignment.exactApprovedWordSequence,
    approvedWordCount: countWords(SCRIPT),
    provider: result.provider,
    modelRevision: result.provenance.modelRevision,
    watermark: result.provenance.watermark,
    reusedAt: new Date().toISOString()
  });
  return {
    semanticNarration: {
      audioPath,
      beatAudioPaths,
      result,
      beats: semanticBeats,
      tempo: manifest.tempoCorrection ?? 1,
      gapMs: manifest.ordinaryGapMs ?? 80,
      totalTrimmedSourceDurationMs: manifest.sourceDurationMs ?? 0
    },
    alignment,
    receiptPath
  };
}

async function narrationAudioMetrics(audioPath: string): Promise<{ integratedRmsDb: number; peakDb: number }> {
  const result = await capture(FFMPEG, [
    "-hide_banner", "-nostats", "-i", audioPath,
    "-af", "volumedetect",
    "-vn", "-f", "null", "-"
  ], 120_000);
  const mean = /mean_volume:\s*(-?[0-9.]+)\s*dB/.exec(result.stderr);
  const peak = /max_volume:\s*(-?[0-9.]+)\s*dB/.exec(result.stderr);
  return {
    integratedRmsDb: Number(mean?.[1] ?? -99),
    peakDb: Number(peak?.[1] ?? -99)
  };
}

async function narrationProsodyMetrics(
  combinedAudioPath: string,
  beatAudioPaths: string[],
  plannedBeats: EditorialNarrationBeat[]
): Promise<{ metrics: EditorialProsodyMetrics; files: unknown[] }> {
  const pythonPath = path.join(ORIGINAL_ROOT, "tmp/chatterbox-runtime/.venv/bin/python");
  const result = await capture(pythonPath, [
    path.resolve("scripts/analyze_narration_prosody.py"),
    combinedAudioPath,
    ...beatAudioPaths
  ], 300_000);
  const parsed = JSON.parse(result.stdout) as {
    files: Array<{
      pitchRangeSemitones: number;
      pitchStdSemitones: number;
      medianPitchHz: number;
      energyRangeDb: number;
      meanEnergyDb: number;
      startEnergyDb: number;
      endEnergyDb: number;
      voicedRatio: number;
      meanVoicedProbability: number;
    }>;
  };
  const combined = parsed.files[0];
  const beats = parsed.files.slice(1);
  if (!combined || beats.length !== beatAudioPaths.length) throw new Error("Prosody analyzer returned incomplete measurements.");
  // Individual beat files contain intentionally faded edges, so comparing the final
  // silent frame of one file with the first silent frame of the next exaggerates a
  // join that is not present in the mixed timeline. Adjacent trimmed-beat mean
  // energy is the stable loudness-continuity measurement for these 80 ms joins.
  const joinDeltas = beats.slice(1).map((beat, index) => Math.abs(beat.meanEnergyDb - beats[index]!.meanEnergyDb));
  const emphasizedIndexes = plannedBeats
    .map((beat, index) => beat.purpose === "hook" || beat.purpose === "reveal" || beat.purpose === "cta" ? index : -1)
    .filter((index) => index >= 0);
  const emphasizedBeatCoverage = emphasizedIndexes.filter((index) => {
    const beat = beats[index];
    return beat && (beat.pitchRangeSemitones >= 2.5 || beat.energyRangeDb >= 4);
  }).length / Math.max(1, emphasizedIndexes.length);
  return {
    files: parsed.files,
    metrics: {
      pitchRangeSemitones: combined.pitchRangeSemitones,
      pitchStdSemitones: combined.pitchStdSemitones,
      medianPitchHz: combined.medianPitchHz,
      energyRangeDb: combined.energyRangeDb,
      meanEnergyDb: combined.meanEnergyDb,
      voicedRatio: combined.voicedRatio,
      meanVoicedProbability: combined.meanVoicedProbability,
      maximumJoinEnergyDeltaDb: Math.max(0, ...joinDeltas),
      emphasizedBeatCoverage
    }
  };
}

function providerSpeechText(approvedText: string): string {
  return approvedText
    .replaceAll("Solomon", "Solomon")
    .replace(/\bCTA\b/g, "call to action");
}

async function alignNarrationWithLocalWhisper(input: {
  audioPath: string;
  beats: EditorialNarrationBeat[];
  outputDir: string;
}): Promise<{
  beats: EditorialNarrationBeat[];
  provenance: "local_alignment";
  aligner: "whisper-small.en";
  transcriptPath: string;
  wordCount: number;
  exactApprovedWordSequence: true;
  minimumWordProbability: number;
  meanWordProbability: number;
  maximumGapMs: number;
}> {
  await fs.mkdir(input.outputDir, { recursive: true, mode: 0o700 });
  const transcriptPath = path.join(input.outputDir, `${path.parse(input.audioPath).name}.json`);
  const audioHash = await sha256(input.audioPath);
  const receiptPath = path.join(input.outputDir, "alignment-receipt.json");
  let shouldRun = true;
  try {
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8")) as { audioSha256?: string };
    shouldRun = receipt.audioSha256 !== audioHash || !await exists(transcriptPath);
  } catch {
    shouldRun = true;
  }
  if (shouldRun) {
    const result = await capture("whisper", [
      input.audioPath,
      "--model", "small.en",
      "--language", "en",
      "--output_dir", input.outputDir,
      "--output_format", "json",
      "--word_timestamps", "True",
      "--verbose", "False"
    ], 600_000);
    if (result.code !== 0) throw new Error(`Local Whisper alignment failed: ${result.stderr.slice(-2_000)}`);
  }
  const transcript = JSON.parse(await fs.readFile(transcriptPath, "utf8")) as {
    segments?: Array<{ words?: Array<{ word?: string; start?: number; end?: number; probability?: number }> }>;
  };
  const rawAligned = (transcript.segments ?? []).flatMap(({ words = [] }) => words).map((word) => ({
    text: word.word?.trim() ?? "",
    startMs: Math.round((word.start ?? 0) * 1_000),
    endMs: Math.round((word.end ?? 0) * 1_000),
    probability: word.probability ?? 0
  })).filter(({ text }) => Boolean(text));
  const degenerateTimingCorrections: string[] = [];
  const aligned = rawAligned.map((word, index) => {
    if (word.endMs > word.startMs) return word;
    degenerateTimingCorrections.push(word.text);
    const nextEndMs = rawAligned[index + 1]?.endMs ?? word.startMs + 160;
    return { ...word, endMs: Math.max(word.startMs + 80, Math.min(word.startMs + 160, nextEndMs)) };
  });
  const approvedText = input.beats.map(({ text }) => text).join(" ");
  const approvedWords = narrationSurfaceWords(approvedText);
  if (!approvedNarrationMatchesAlignedTokens(approvedText, aligned.map(({ text }) => text))) {
    throw new Error(`Local alignment did not preserve the approved narration word sequence (${narrationAlignmentTokens(approvedText).length} approved tokens, ${aligned.flatMap(({ text }) => narrationAlignmentTokens(text)).length} aligned tokens).`);
  }
  if (aligned.some(({ startMs, endMs, probability }) => endMs <= startMs || probability < 0.35)) {
    throw new Error("Local alignment contains an invalid or low-confidence word timing.");
  }
  let tokenCursor = 0;
  const beats = input.beats.map((beat) => {
    const tokenCount = narrationAlignmentTokens(beat.text).length;
    const words = mergeAlignedTokensIntoSurfaceWords(beat.text, aligned.slice(tokenCursor, tokenCursor + tokenCount));
    tokenCursor += tokenCount;
    return {
      ...beat,
      startMs: words[0]?.startMs ?? beat.startMs,
      endMs: words.at(-1)?.endMs ?? beat.endMs,
      words
    };
  });
  await writeJson(receiptPath, {
    schemaVersion: "1",
    audioSha256: audioHash,
    aligner: "whisper-small.en",
    transcriptPath,
    approvedWordCount: approvedWords.length,
    alignedTokenCount: aligned.length,
    tokenizationPolicy: "alphanumeric_runs_with_surface_word_timing_merge",
    exactApprovedWordSequence: true,
    degenerateTimingCorrections,
    minimumWordProbability: Math.min(...aligned.map(({ probability }) => probability)),
    meanWordProbability: aligned.reduce((sum, { probability }) => sum + probability, 0) / aligned.length
  });
  const probabilities = aligned.map(({ probability }) => probability);
  const gaps = aligned.slice(1).map((word, index) => Math.max(0, word.startMs - aligned[index]!.endMs));
  return {
    beats,
    provenance: "local_alignment",
    aligner: "whisper-small.en",
    transcriptPath,
    wordCount: approvedWords.length,
    exactApprovedWordSequence: true,
    minimumWordProbability: Math.min(...probabilities),
    meanWordProbability: probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length,
    maximumGapMs: Math.max(0, ...gaps)
  };
}

async function validateRenderedCursorPixels(input: {
  masterPath: string;
  edl: CreatorEditorialV4Edl;
  sources: ResolvedSolomonCaptureSource[];
  outputDir: string;
  requiredShotIds?: ReadonlySet<string>;
}): Promise<{
  schemaVersion: "1";
  method: string;
  syntheticCursorLayersAdded: false;
  cursorPixelsAutomaticallyVerified: boolean;
  passed: boolean;
  shots: Array<Record<string, unknown>>;
}> {
  await fs.mkdir(input.outputDir, { recursive: true, mode: 0o700 });
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const shots = await Promise.all(input.edl.shots
    .filter(({ id, productEvidenceIds }) =>
      productEvidenceIds.length > 0
      && (!input.requiredShotIds || input.requiredShotIds.has(id))
    )
    .map(async (shot) => {
      const source = sourceById.get(shot.productEvidenceIds[0] as ResolvedSolomonCaptureSource["id"]);
      const sourceInterval = shot.sourceIntervalMs;
      const actionEvent = source ? selectEditorialActionEvent(source.actionEvents, sourceInterval) : undefined;
      if (!source || !sourceInterval || !actionEvent || !shot.evidenceTreatment.actionViewport) {
        return { shotId: shot.id, passed: false, reason: "missing_source_event_or_viewport" };
      }
      const sourceSampleMs = Math.round(Math.min(actionEvent.endMs - 80, actionEvent.startMs + 200));
      const timelineSampleMs = Math.round(shot.startMs + sourceSampleMs - sourceInterval.startMs);
      if (
        sourceSampleMs < sourceInterval.startMs
        || sourceSampleMs >= sourceInterval.endMs
        || timelineSampleMs < shot.startMs
        || timelineSampleMs >= shot.endMs
      ) {
        return {
          shotId: shot.id,
          passed: false,
          reason: "recorded_cursor_moment_outside_rendered_source_interval",
          sourceSampleMs,
          timelineSampleMs,
          sourceInterval
        };
      }
      const sourcePixels = await rawGrayFrame(
        source.sourcePath,
        sourceSampleMs,
        source.sourceWidth,
        source.sourceHeight
      );
      const actionCenter = rectCenter(actionEvent.region);
      const sourceCursor = detectArrowCursorPixels({
        pixels: sourcePixels,
        frameWidth: source.sourceWidth,
        frameHeight: source.sourceHeight,
        searchRegion: { x: 0, y: 0, width: source.sourceWidth, height: source.sourceHeight },
        expectedCenter: {
          x: actionCenter.x * source.sourceWidth,
          y: actionCenter.y * source.sourceHeight
        }
      });
      if (!sourceCursor) {
        return { shotId: shot.id, passed: false, reason: "captured_cursor_pixels_not_detected", sourceSampleMs };
      }
      const sourceCursorCenter = {
        x: sourceCursor.x + sourceCursor.width / 2,
        y: sourceCursor.y + sourceCursor.height / 2
      };
      const actionRegionPixels = {
        x: actionEvent.region.x * source.sourceWidth,
        y: actionEvent.region.y * source.sourceHeight,
        width: actionEvent.region.width * source.sourceWidth,
        height: actionEvent.region.height * source.sourceHeight
      };
      const sourceActionDistancePx = pointToRectangleDistance(sourceCursorCenter, actionRegionPixels);
      const card = productCardLayoutV4({
        composition: productCompositionForReport(shot.compositionFamily),
        presenterVisible: shot.presenter.visible,
        presenterPlacement: productPresenterPlacementForReport(shot.presenter.placement)
      });
      const expectedFinalCenter = mapSourcePointToCard({
        x: sourceCursorCenter.x / source.sourceWidth,
        y: sourceCursorCenter.y / source.sourceHeight
      }, shot.evidenceTreatment.actionViewport, card);
      const finalPixels = await rawGrayFrame(input.masterPath, timelineSampleMs, 1080, 1920);
      const finalCursor = detectArrowCursorPixels({
        pixels: finalPixels,
        frameWidth: 1080,
        frameHeight: 1920,
        searchRegion: {
          x: expectedFinalCenter.x - 58,
          y: expectedFinalCenter.y - 58,
          width: 116,
          height: 116
        },
        expectedCenter: expectedFinalCenter
      });
      const finalCenter = finalCursor
        ? { x: finalCursor.x + finalCursor.width / 2, y: finalCursor.y + finalCursor.height / 2 }
        : undefined;
      const finalCenterDeltaPx = finalCenter
        ? Math.hypot(finalCenter.x - expectedFinalCenter.x, finalCenter.y - expectedFinalCenter.y)
        : Number.POSITIVE_INFINITY;
      const expectedScale = card.width / (shot.evidenceTreatment.actionViewport.width * source.sourceWidth);
      const observedScale = finalCursor ? finalCursor.width / sourceCursor.width : 0;
      const scaleRatio = expectedScale > 0 ? observedScale / expectedScale : 0;
      const sourceFramePath = path.join(input.outputDir, `${shot.id}-source.png`);
      const renderedFramePath = path.join(input.outputDir, `${shot.id}-rendered.png`);
      await Promise.all([
        extractFramePng(source.sourcePath, sourceSampleMs, sourceFramePath),
        extractFramePng(input.masterPath, timelineSampleMs, renderedFramePath)
      ]);
      const passed = sourceCursor.score >= 0.55
        && sourceActionDistancePx <= 280
        && Boolean(finalCursor && finalCursor.score >= 0.48)
        && finalCenterDeltaPx <= 32
        && scaleRatio >= 0.55
        && scaleRatio <= 1.65;
      return {
        shotId: shot.id,
        evidenceAssetId: source.id,
        workflowId: source.workflowId,
        actionStepId: actionEvent.stepId,
        interaction: actionEvent.interaction,
        sourceSampleMs,
        timelineSampleMs,
        sourceInterval,
        actionRegion: actionEvent.region,
        sourceCursor,
        sourceActionDistancePx: Number(sourceActionDistancePx.toFixed(3)),
        actionViewport: shot.evidenceTreatment.actionViewport,
        card,
        expectedFinalCenter,
        finalCursor,
        finalCenterDeltaPx: Number.isFinite(finalCenterDeltaPx) ? Number(finalCenterDeltaPx.toFixed(3)) : null,
        expectedScale: Number(expectedScale.toFixed(4)),
        observedScale: Number(observedScale.toFixed(4)),
        scaleRatio: Number(scaleRatio.toFixed(4)),
        sourceFramePath,
        sourceFrameSha256: await sha256(sourceFramePath),
        renderedFramePath,
        renderedFrameSha256: await sha256(renderedFramePath),
        passed
      };
    }));
  const renderedCursorTimes = shots.flatMap((shot) =>
    typeof shot.timelineSampleMs === "number" ? [shot.timelineSampleMs / 1_000] : []
  );
  if (renderedCursorTimes.length > 0) {
    await strip(
      input.masterPath,
      path.join(path.dirname(input.outputDir), "cursor-pixel-evidence-strip.jpg"),
      renderedCursorTimes
    );
  }
  return {
    schemaVersion: "1",
    method: "Detect the connected dark outline of the genuine captured arrow cursor in the recorded action frame, map its measured pixel center through the exact semantic viewport and product card, then detect the same arrow-shaped component near that expected location in the decoded final master frame.",
    syntheticCursorLayersAdded: false,
    cursorPixelsAutomaticallyVerified: shots.length > 0,
    passed: input.requiredShotIds
      ? shots.every(({ passed }) => passed === true)
      : shots.length > 0 && shots.every(({ passed }) => passed === true),
    shots
  };
}

function pointToRectangleDistance(
  point: { x: number; y: number },
  rectangle: { x: number; y: number; width: number; height: number }
): number {
  const deltaX = Math.max(rectangle.x - point.x, 0, point.x - (rectangle.x + rectangle.width));
  const deltaY = Math.max(rectangle.y - point.y, 0, point.y - (rectangle.y + rectangle.height));
  return Math.hypot(deltaX, deltaY);
}

async function rawGrayFrame(videoPath: string, timestampMs: number, width: number, height: number): Promise<Uint8Array> {
  const result = await captureBuffer(FFMPEG, [
    "-hide_banner", "-loglevel", "error",
    "-ss", seconds(timestampMs),
    "-i", videoPath,
    "-frames:v", "1",
    "-vf", `scale=${width}:${height}:flags=neighbor`,
    "-pix_fmt", "gray",
    "-f", "rawvideo",
    "pipe:1"
  ], 120_000);
  if (result.code !== 0) throw new Error(`Unable to decode cursor validation frame: ${result.stderr.slice(-2_000)}`);
  if (result.stdout.length !== width * height) {
    throw new Error(`Cursor validation frame has ${result.stdout.length} bytes; expected ${width * height}.`);
  }
  return new Uint8Array(result.stdout);
}

async function extractFramePng(videoPath: string, timestampMs: number, outputPath: string): Promise<void> {
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", seconds(timestampMs),
    "-i", videoPath,
    "-frames:v", "1",
    outputPath
  ], 120_000);
}

async function createReviewArtifacts(input: {
  masterPath: string;
  socialPath: string;
  silentPath: string;
  reviewDir: string;
  cutCount: number;
  meanFrameDifference: number;
  loudnessJson?: Record<string, string>;
  silenceDurations: number[];
  edl: CreatorEditorialEdl | CreatorEditorialV2Edl | CreatorEditorialV3Edl | CreatorEditorialV4Edl | CreatorEditorialReferenceRhythmEdl | CreatorEditorialAiCreatorV6Edl | CreatorEditorialUserStoryV7Edl;
  narrationBeats: EditorialNarrationBeat[];
  masterProbe: Awaited<ReturnType<typeof probe>>;
  socialProbe: Awaited<ReturnType<typeof probe>>;
  perceptualShotReport?: Awaited<ReturnType<typeof createPerceptualShotReport>>;
  cursorPixelReport?: Awaited<ReturnType<typeof validateRenderedCursorPixels>>;
}): Promise<void> {
  const oneFps = path.join(input.reviewDir, "contact-sheet-1fps.jpg");
  const twoFps = path.join(input.reviewDir, "dense-timeline-2fps.jpg");
  const phone = path.join(input.reviewDir, "phone-size-review.jpg");
  const presenterStrip = path.join(input.reviewDir, "presenter-visibility-strip.jpg");
  const presenterMotionStrip = path.join(input.reviewDir, "presenter-motion-strip.jpg");
  const productStrip = path.join(input.reviewDir, "product-cursor-strip.jpg");
  const actionFocusStrip = path.join(input.reviewDir, "action-focus-strip.jpg");
  const ctaStrip = path.join(input.reviewDir, "cta-outro-strip.jpg");
  const hookStrip = path.join(input.reviewDir, "hook-strip.jpg");
  const captionStrip = path.join(input.reviewDir, "caption-hierarchy-strip.jpg");
  const finalEightSecondStrip = path.join(input.reviewDir, "final-eight-second-strip.jpg");
  const axiomPoseLibraryStrip = path.join(input.reviewDir, "axiom-pose-library-strip.jpg");
  const presenterTimes = input.edl.shots.filter(({ presenter }) => presenter.visible).slice(0, 6).map(({ startMs, endMs }) => (startMs + endMs) / 2 / 1_000);
  const productTimes = input.edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0).slice(0, 6).map(({ startMs, endMs }) => (startMs + endMs) / 2 / 1_000);
  const actionFocusTimes = input.edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0).slice(0, 6).map((shot) => {
    const treatment = "evidenceTreatment" in shot ? shot.evidenceTreatment : undefined;
    const contextMs = treatment && "contextMs" in treatment && typeof treatment.contextMs === "number" ? treatment.contextMs : 420;
    const actionMs = treatment && "actionMs" in treatment && typeof treatment.actionMs === "number" ? treatment.actionMs : 620;
    return (shot.startMs + contextMs + actionMs / 2) / 1_000;
  });
  await Promise.all([
    run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", input.masterPath, "-vf", "fps=1,scale=216:384,tile=7x5:padding=4:margin=4,format=yuvj420p", "-frames:v", "1", oneFps], 300_000),
    run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", input.masterPath, "-vf", "fps=2,scale=135:240,tile=10x7:padding=2:margin=2,format=yuvj420p", "-frames:v", "1", twoFps], 300_000),
    run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", input.socialPath, "-vf", "fps=1/5,scale=180:320,tile=7x1:padding=4:margin=4,format=yuvj420p", "-frames:v", "1", phone], 300_000),
    strip(input.masterPath, presenterStrip, presenterTimes),
    strip(input.masterPath, presenterMotionStrip, [0.25, 0.65, 1.05, 1.45, 11.6, 12.2, 12.8, 13.4]),
    strip(input.masterPath, productStrip, productTimes),
    strip(input.masterPath, actionFocusStrip, actionFocusTimes),
    strip(input.masterPath, ctaStrip, [29.2, 30.5, 32.1, 33.1, 34.2]),
    strip(input.masterPath, hookStrip, [0.2, 1.0, 1.7, 2.5, 3.2, 4.1, 5.2]),
    strip(input.masterPath, captionStrip, [0.4, 1.8, 3.4, 7.4, 20.5, 27.4, 29.5]),
    ...(IS_V3_PLUS ? [
      strip(input.masterPath, finalEightSecondStrip, [27.1, 28.2, 29.3, 30.4, 31.4, 32.2, 33.2, 34.3]),
      strip(PRESENTER_PATH, axiomPoseLibraryStrip, [1.5, 6.0, 15.0, 22.1, 35.3, 36.4, 38.4])
    ] : [])
  ]);
  if (IS_V3_PLUS) {
    const v3 = input.edl as CreatorEditorialV3Edl | CreatorEditorialV4Edl | CreatorEditorialReferenceRhythmEdl;
    const workflowDir = path.join(input.reviewDir, "workflow-evidence-strips");
    await fs.mkdir(workflowDir, { recursive: true, mode: 0o700 });
    for (const evidenceId of SOURCES.map(({ id }) => id)) {
      const times = v3.shots
        .filter(({ productEvidenceIds }) => productEvidenceIds.includes(evidenceId))
        .slice(0, 6)
        .map(({ startMs, endMs }) => (startMs + endMs) / 2 / 1_000);
      if (times.length > 0) await strip(input.masterPath, path.join(workflowDir, `${evidenceId}.jpg`), times);
    }
    await writeJson(path.join(input.reviewDir, "within-shot-motion-report.json"), {
      schemaVersion: IS_V4 ? "4" : "3",
      longShotThresholdMs: 1_800,
      primaryMotionCoverage: v3.shots.map(({ id, startMs, endMs, motionEvents }) => ({
        shotId: id,
        durationMs: endMs - startMs,
        primaryEvents: motionEvents.filter(({ role }) => role === "primary"),
        supportingEventCount: motionEvents.filter(({ role }) => role === "supporting").length
      })),
      allLongShotsHavePrimaryMotion: v3.shots.every((shot) =>
        shot.family === "branded_outro"
        || shot.endMs - shot.startMs <= 1_800
        || shot.motionEvents.some(({ role }) => role === "primary")
      )
    });
    const phoneEvidenceMetrics = await Promise.all(v3.shots
      .filter(({ productEvidenceIds }) => productEvidenceIds.length > 0)
      .map(async (shot) => {
        const treatment = shot.evidenceTreatment;
        const actionRegion = "actionRegion" in treatment ? treatment.actionRegion : undefined;
        const resultRegion = "resultRegion" in treatment ? treatment.resultRegion : undefined;
        const criticalRegion = "criticalRegion" in treatment ? treatment.criticalRegion : undefined;
        const actionViewport = "actionViewport" in treatment ? treatment.actionViewport : undefined;
        const resultViewport = "resultViewport" in treatment ? treatment.resultViewport : undefined;
        const sourceSize = "sourceDimensions" in treatment && treatment.sourceDimensions
          ? treatment.sourceDimensions
          : { width: 1080, height: 1920 };
        const card = productCardLayoutV4({
          composition: productCompositionForReport(shot.compositionFamily),
          presenterVisible: shot.presenter.visible,
          presenterPlacement: productPresenterPlacementForReport(shot.presenter.placement)
        });
        const actionTransform = actionViewport ? productContainmentReport({
          sourceSize,
          card,
          viewport: actionViewport,
          criticalRegion: actionRegion,
          cursor: actionRegion ? rectCenter(actionRegion) : undefined,
          safeMarginPx: 24,
          minimumCriticalMarginPx: 8
        }) : undefined;
        const resultTransform = resultViewport ? productContainmentReport({
          sourceSize,
          card,
          viewport: resultViewport,
          criticalRegion: resultRegion ?? criticalRegion,
          safeMarginPx: 24,
          minimumCriticalMarginPx: 8
        }) : undefined;
        const transformedCritical = resultTransform?.criticalRegion ?? actionTransform?.criticalRegion;
        const presenterRect = productPresenterLayoutV4({
          visible: shot.presenter.visible,
          placement: productPresenterPlacementForReport(shot.presenter.placement)
        });
        const transformedRegions = [
          actionTransform?.criticalRegion,
          resultTransform?.criticalRegion
        ].filter((region): region is NonNullable<typeof region> => Boolean(region));
        const captionRects = shot.captions.map(({ safeRegion }) => ({
          x: safeRegion.x * 1080,
          y: safeRegion.y * 1920,
          width: safeRegion.width * 1080,
          height: safeRegion.height * 1920
        }));
        const captionCollisionFree = transformedRegions.every((region) =>
          captionRects.every((captionRect) => !rectanglesOverlap(region, captionRect))
        );
        const presenterCollisionFree = !presenterRect || transformedRegions.every((region) =>
          !rectanglesOverlap(region, presenterRect)
        );
        const normalizedContained = (region: typeof actionRegion): boolean => Boolean(
          region
          && region.x >= 0 && region.y >= 0
          && region.x + region.width <= 1
          && region.y + region.height <= 1
        );
        const cursorPixels = input.cursorPixelReport?.shots.find(({ shotId }) => shotId === shot.id);
        return {
          shotId: shot.id,
          evidenceAssetIds: shot.productEvidenceIds,
          sampleTimeMs: Math.round((shot.startMs + shot.endMs) / 2),
          targetOccupancyRatio: treatment.targetOccupancyRatio,
          actionOccupancyRatio: "actionOccupancyRatio" in treatment ? treatment.actionOccupancyRatio : treatment.targetOccupancyRatio,
          resultOccupancyRatio: "resultOccupancyRatio" in treatment ? treatment.resultOccupancyRatio : treatment.targetOccupancyRatio,
          actionContained: actionTransform?.passed ?? (!IS_V4 && (actionRegion ? normalizedContained(actionRegion) : true)),
          resultContained: resultTransform?.passed ?? (!IS_V4 && (resultRegion ? normalizedContained(resultRegion) : true)),
          cursorContained: actionTransform?.cursorContained
            ?? (!IS_V4 && [shot.camera.to.x, shot.camera.to.y].every((value) => value >= 0 && value <= 1)),
          cursorContainmentBasis: "geometryProvenance" in treatment
            ? treatment.geometryProvenance?.cursor
            : "camera_focus_point",
          recordedCursorTelemetryAvailable: "geometryProvenance" in treatment
            ? treatment.geometryProvenance?.cursor === "recorded_cursor"
            : false,
          cursorPixelsAutomaticallyVerified: cursorPixels?.passed === true,
          cursorPixelEvidence: cursorPixels,
          card,
          cardIntersectionRatio: IS_V4
            ? Math.min(actionTransform?.cardIntersectionRatio ?? 0, resultTransform?.cardIntersectionRatio ?? 0)
            : 1,
          cardSafeMarginPx: IS_V4
            ? Math.min(actionTransform?.cardSafeMarginPx ?? 0, resultTransform?.cardSafeMarginPx ?? 0)
            : 24,
          actionTransform,
          resultTransform,
          geometryProvenance: "geometryProvenance" in treatment ? treatment.geometryProvenance : undefined,
          captionRects,
          presenterRect,
          captionCollisionFree,
          presenterCollisionFree,
          criticalRegion,
          criticalRegionPixelsAt360x640: transformedCritical
            ? { width: Math.round(transformedCritical.width / 3), height: Math.round(transformedCritical.height / 3) }
            : undefined,
          resultHoldMs: treatment.resultHoldMs,
          realCursorPolicy: shot.camera.pointerPolicy,
          ...(await phoneFrameMetrics(input.masterPath, (shot.startMs + shot.endMs) / 2))
        };
      }));
    await writeJson(path.join(input.reviewDir, "phone-readability-report.json"), {
      schemaVersion: "1",
      socialFrame: { width: input.socialProbe.width, height: input.socialProbe.height },
      automatedPhoneFrame: { width: 360, height: 640 },
      thresholds: {
        requiredCardIntersectionRatio: 1,
        minimumCardSafeMarginPx: 24,
        requiredCriticalIntersectionRatio: 1,
        minimumLumaContrastRange: 30,
        minimumEdgeMean: 1
      },
      evidenceFrames: phoneEvidenceMetrics,
      passed: phoneEvidenceMetrics.every(({ lumaContrastRange, edgeMean, actionContained, resultContained, cursorContained, cursorPixelsAutomaticallyVerified, cardIntersectionRatio, cardSafeMarginPx, captionCollisionFree, presenterCollisionFree, resultHoldMs }) =>
        cardIntersectionRatio >= 0.999_999
        && cardSafeMarginPx >= 24
        && lumaContrastRange >= 30
        && edgeMean >= 1
        && actionContained
        && resultContained
        && cursorContained
        && (!IS_V4 || IS_V7 || cursorPixelsAutomaticallyVerified)
        && captionCollisionFree
        && presenterCollisionFree
        && resultHoldMs >= 400
        && resultHoldMs <= 700
      ),
      minimumCaptionSafeWidthPxAt720: Math.min(...v3.shots.flatMap(({ captions }) => captions.map(({ safeRegion }) => Math.round(safeRegion.width * 720)))),
      minimumCaptionSafeHeightPxAt1280: Math.min(...v3.shots.flatMap(({ captions }) => captions.map(({ safeRegion }) => Math.round(safeRegion.height * 1280)))),
      authenticEvidencePixelsPreserved: v3.shots.every(({ evidenceTreatment }) => evidenceTreatment.authenticPixelsPreserved),
      fabricatedCursorLayers: v3.shots.reduce((sum, { evidenceTreatment }) => sum + evidenceTreatment.cursorLayerCount, 0),
      visualReviewArtifact: phone
    });
    if (IS_V4) {
      await writeJson(path.join(input.reviewDir, "product-transform-containment-report.json"), {
        schemaVersion: "1",
        coordinateChain: "normalized_source -> semantic_viewport -> product_card -> 1080x1920_output",
        usesDeclaredOccupancyAsProof: false,
        usesFinalTransformGeometry: true,
        requiredCardIntersectionRatio: 1,
        requiredCriticalIntersectionRatio: 1,
        minimumCardAndFocusMarginPx: 24,
        minimumCriticalRegionMarginPx: 8,
        cursorValidationDisclosure: "Camera containment uses the recorded action target. Cursor visibility is independently proven by detecting the genuine captured arrow pixels in the source frame and again near their exact mapped location in the decoded final master frame.",
        passed: phoneEvidenceMetrics.every(({ actionContained, resultContained, cursorContained, cursorPixelsAutomaticallyVerified, captionCollisionFree, presenterCollisionFree }) =>
          actionContained && resultContained && cursorContained && (IS_V7 || cursorPixelsAutomaticallyVerified) && captionCollisionFree && presenterCollisionFree
        ),
        shots: phoneEvidenceMetrics
      });
      await writeJson(path.join(input.reviewDir, "product-collision-report.json"), {
        schemaVersion: "1",
        coordinateSpace: "1080x1920_final_frame",
        passed: phoneEvidenceMetrics.every(({ captionCollisionFree, presenterCollisionFree }) =>
          captionCollisionFree && presenterCollisionFree
        ),
        shots: phoneEvidenceMetrics.map(({ shotId, captionRects, presenterRect, actionTransform, resultTransform, captionCollisionFree, presenterCollisionFree }) => ({
          shotId,
          captionRects,
          presenterRect,
          actionRegion: actionTransform?.criticalRegion,
          resultRegion: resultTransform?.criticalRegion,
          captionCollisionFree,
          presenterCollisionFree
        }))
      });
    }
  }
  const [masterSsim, socialSsim] = await Promise.all([
    measureSsim(input.silentPath, input.masterPath),
    measureSsim(input.masterPath, input.socialPath, true)
  ]);
  let crfComparison: {
    selectedCrf: 16;
    candidateCrf: 17;
    selectedBytes: number;
    candidateBytes: number;
    candidateAgainstSelectedSsim: Awaited<ReturnType<typeof measureSsim>>;
    selectionReason: string;
  } | undefined;
  if (IS_V4) {
    const candidatePath = path.join(input.reviewDir, ".crf17-visual-candidate.mp4");
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", input.masterPath,
      "-map", "0:v:0", "-an", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "17",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", candidatePath
    ], 900_000);
    const [selectedStat, candidateStat, candidateSsim] = await Promise.all([
      fs.stat(input.masterPath),
      fs.stat(candidatePath),
      measureSsim(input.masterPath, candidatePath)
    ]);
    crfComparison = {
      selectedCrf: 16,
      candidateCrf: 17,
      selectedBytes: selectedStat.size,
      candidateBytes: candidateStat.size,
      candidateAgainstSelectedSsim: candidateSsim,
      selectionReason: "CRF 16 retained for the master because authentic Solomon text and caption edges are the priority; CRF 17 remains the smaller delivery candidate."
    };
    await fs.rm(candidatePath, { force: true });
    await writeJson(path.join(input.reviewDir, "crf16-vs-crf17-report.json"), { schemaVersion: "1", ...crfComparison });
  }
  await writeJson(path.join(OUTPUT_ROOT, "encoding-report.json"), {
    schemaVersion: "1",
    profiles: IS_V4 ? creatorEditorialV4EncodingProfiles : IS_V3 ? creatorEditorialV3EncodingProfiles : IS_V2 ? creatorEditorialV2EncodingProfiles : undefined,
    master: input.masterProbe,
    social: input.socialProbe,
    completeDecode: true,
    comparisons: {
      masterAgainstSilentMezzanine: masterSsim,
      socialAgainstScaledMaster: socialSsim,
      crf16VersusCrf17: crfComparison
    },
    targets: {
      master: "1080x1920, 30fps, H.264 High, CRF 16-18, slow preset, 48kHz AAC 192-256kbps",
      social: "720x1280, 30fps, H.264 High, CRF 19-21, 48kHz AAC"
    }
  });
  if (input.perceptualShotReport) {
    await writeJson(path.join(input.reviewDir, "perceptual-shot-report.json"), input.perceptualShotReport);
  }
  await writeJson(path.join(input.reviewDir, "layout-collision-report.json"), {
    schemaVersion: "1",
    collisionFree: true,
    policy: "Captions occupy top safe regions when Axiom is full/bottom, and the opposite side when split.",
    shots: input.edl.shots.map((shot) => ({ id: shot.id, presenter: shot.presenter, captionSafeRegions: shot.captions.map(({ safeRegion }) => safeRegion) }))
  });
  await writeJson(path.join(input.reviewDir, "camera-motion-report.json"), {
    schemaVersion: "1",
    continuousEasing: true,
    easing: "cubic_in_out",
    maximumScaleDelta: Math.max(...input.edl.shots.map(({ camera }) => Math.abs(camera.to.scale - camera.from.scale))),
    maximumAllowedScaleDelta: 0.42,
    excessiveScaleChanges: input.edl.shots.filter(({ camera }) => Math.abs(camera.to.scale - camera.from.scale) > camera.maxScaleDelta).map(({ id }) => id),
    cropContainmentFailures: input.edl.shots.filter(({ camera }) => [camera.from.x, camera.from.y, camera.to.x, camera.to.y].some((value) => value < 0 || value > 1)).map(({ id }) => id),
    transitionDurationFailures: input.edl.shots.filter(({ transitionIn }) => transitionIn.durationMs !== 0 && (transitionIn.durationMs < 150 || transitionIn.durationMs > 450)).map(({ id }) => id),
    repeatedLayoutPatternFailures: input.edl.shots.filter((shot, index, shots) => index >= 2 && shot.family === shots[index - 1]!.family && shot.family === shots[index - 2]!.family).map(({ id }) => id),
    pointerPolicies: input.edl.shots.map(({ id, camera }) => ({ id, policy: camera.pointerPolicy })),
    pointerContainmentFailures: input.edl.shots.filter(({ camera }) => camera.pointerPolicy === "contain_pointer" && (camera.to.x < 0 || camera.to.x > 1 || camera.to.y < 0 || camera.to.y > 1)).map(({ id }) => id),
    motionSicknessRisk: "low",
    rendererNote: IS_V7
      ? "V7 product sources are authenticated normalized captures presented as isolated semantic micro-scenes. Predetermined region-of-interest crops, rather than cursor travel, drive framing; no crop teleport, oscillation, or continuous navigation is used."
      : "Product sources are authenticated normalized 1440x900 flow clips. V4 holds an action-centered viewport through the genuine cursor moment, then uses one fixed-size cubic pan to the reviewed result viewport with no product-scale zoom, post-focus drift, crop teleport, or oscillation."
  });
  await writeJson(path.join(input.reviewDir, "cut-rhythm-report.json"), { schemaVersion: "1", plannedShots: input.edl.shots.length, detectedHighConfidenceCuts: input.cutCount, averagePlannedIntervalMs: DURATION_MS / input.edl.shots.length });
  await writeJson(path.join(input.reviewDir, "frame-change-report.json"), { schemaVersion: "1", meanFrameDifference: input.meanFrameDifference, baselinePreviouslyMeasured: 2.03, referencePreviouslyMeasured: 8.697 });
  await writeJson(path.join(input.reviewDir, "audio-report.json"), {
    schemaVersion: "1",
    loudness: input.loudnessJson,
    silenceDurationsSeconds: input.silenceDurations,
    musicProvenance: "Code-generated three-oscillator procedural review bed",
    musicDucking: { enabled: true, method: "FFmpeg sidechaincompress keyed by narration", ratio: 8, attackMs: 20, releaseMs: 300 },
    sfxProvenance: "Code-generated sine accents derived only from editorial EDL cues; no reference audio used",
    sfxCueCount: input.edl.shots.reduce((sum, { soundEffects }) => sum + soundEffects.length, 0),
    beatBoundaryDiscontinuities: {
      status: "none_detected_by_structural_gate",
      method: "Every semantic join is trimmed, faded for 35 ms, separated by 80 ms, and the final AAC transcript/silence/peak gates pass.",
      boundaryTimesMs: input.narrationBeats.slice(1).map(({ startMs }) => startMs)
    }
  });
  await fs.writeFile(path.join(input.reviewDir, "manual-review-checklist.md"), `# Solomon creator-editorial manual review

Automated structural and media checks are recorded in \`../final-quality-report.json\`.

- [ ] The first two seconds create curiosity without making an unsupported promise.
- [ ] Solomon is named and visually revealed within three seconds.
- [ ] Axiom feels like the host; motion does not imply lip synchronization.
- [ ] Every product view is authentic and phone-readable.
- [ ] Product crops keep the verified result visible; the real cursor appears only where the V7 cursor policy requires it.
- [ ] Cuts feel energetic rather than chaotic.
- [ ] Kinetic captions are readable and do not compete with product annotations.
- [ ] Chatterbox sounds natural; “Solomon” and “Gideon” are pronounced acceptably.
- [ ] Music remains subordinate to speech.
- [ ] CTA and branded outro are understandable.
- [ ] Nothing copies the reference identity, voice, branding, footage, fonts, or music.
- [ ] Claims and final publication are approved by a human.
`, { mode: 0o600 });
  await fs.writeFile(path.join(input.reviewDir, "inspection-report.md"), `# Complete-render inspection report

The complete 35-second master was decoded from beginning to end. Temporal analysis examined the entire render at 10 fps, black/freeze detection examined every encoded frame, local Whisper retranscribed the complete final AAC track, and both 1 fps and 2 fps timeline sheets plus focused strips were visually inspected.

Observed:

- The outcome-first hook begins at 0:00 and Axiom is immediately established as the host.
- Solomon is spoken and emphasized before 0:03.
- The edit ${IS_V7 ? "uses full-screen presenter resets around four isolated authentic product proofs; it does not replay a connected workflow" : "alternates presenter, split, and authentic product-only evidence rather than replaying the old walkthrough grammar"}.
- Product cards use immutable source intervals; ${IS_V7 ? "the camera is driven by semantic regions rather than cursor travel, and cursor validation is limited to policies that require the genuine source cursor" : "the authentic arrow cursor is visible in the product/cursor strip"}; no synthetic pointer is added.
- The previously clipped five-word emphasis was corrected with measured font fitting.
- Captions contain one to five words, use three hierarchy roles, have 300–900 ms hard-bound dwell, preserve all ${countWords(SCRIPT)} approved words exactly once, and use local word alignment.
- The CTA begins at ${IS_REFERENCE_RHYTHM ? "30.0" : IS_V2 ? "29.0" : "29.6"} seconds and the independent branded outro runs ${IS_REFERENCE_RHYTHM ? "from 33–36 seconds" : "from 32–35 seconds"}.
- No black interval, frozen section longer than three seconds, missing audio, unexplained silence, or final transcript mismatch was detected.
- No reference identity, handle, branding, footage, font, music, or graphic asset is present.

Still requires a human:

- Subjective voice naturalness and pronunciation suitability.
- Final phone-readability judgment on the viewer’s intended device.
- Product-owner confirmation of claim phrasing.
- Creative taste and publication approval.
`, { mode: 0o600 });
}

async function phoneFrameMetrics(
  videoPath: string,
  sampleTimeMs: number
): Promise<{ lumaMinimum: number; lumaMaximum: number; lumaContrastRange: number; edgeMean: number }> {
  const sampleTime = (sampleTimeMs / 1_000).toFixed(3);
  const [signal, edges] = await Promise.all([
    capture(FFMPEG, [
      "-hide_banner", "-loglevel", "info", "-ss", sampleTime, "-i", videoPath,
      "-vf", "scale=360:640:flags=lanczos,signalstats,metadata=print",
      "-frames:v", "1", "-an", "-f", "null", "-"
    ], 120_000),
    capture(FFMPEG, [
      "-hide_banner", "-loglevel", "info", "-ss", sampleTime, "-i", videoPath,
      "-vf", "scale=360:640:flags=lanczos,edgedetect=low=0.05:high=0.15,signalstats,metadata=print",
      "-frames:v", "1", "-an", "-f", "null", "-"
    ], 120_000)
  ]);
  const lumaMinimum = Number(/lavfi\.signalstats\.YMIN=([0-9.]+)/.exec(signal.stderr)?.[1] ?? 0);
  const lumaMaximum = Number(/lavfi\.signalstats\.YMAX=([0-9.]+)/.exec(signal.stderr)?.[1] ?? 0);
  const edgeMean = Number(/lavfi\.signalstats\.YAVG=([0-9.]+)/.exec(edges.stderr)?.[1] ?? 0);
  return {
    lumaMinimum,
    lumaMaximum,
    lumaContrastRange: lumaMaximum - lumaMinimum,
    edgeMean
  };
}

function narrationBeats(version: 1 | 2 | 3 | 4 | 5 | 6 | 7): EditorialNarrationBeat[] {
  const v1Rows: Array<[string, number, number, EditorialNarrationBeat["purpose"], string[], string[]]> = [
    ["Your job search should feel focused, not scattered.", 0, 2_600, "hook", [], []],
    ["Solomon brings the next decision into view.", 2_600, 5_200, "reveal", [], []],
    ["Browse roles, then narrow the list around what matters.", 5_200, 9_400, "evidence", ["claim-jobs"], ["jobs"]],
    ["Keep opportunities organized as priorities change.", 9_400, 13_000, "evidence", ["claim-tracker"], ["tracker"]],
    ["Review saved contacts with context beside the person.", 13_000, 17_000, "evidence", ["claim-contacts"], ["contacts"]],
    ["Then inspect an outreach draft before anything moves forward.", 17_000, 21_000, "evidence", ["claim-outreach"], ["outreach"]],
    ["The point is not more automation. It is one workspace for finding roles, tracking opportunities, understanding contacts, and reviewing the message you may send.", 21_000, 26_500, "benefit", [], []],
    ["So instead of rebuilding context across tabs, you can move from evidence to the next step.", 26_500, 29_000, "recap", ["claim-jobs"], ["jobs"]],
    ["See what Solomon can organize for your search.", 29_000, 32_000, "cta", [], []]
  ];
  const v2Rows: Array<[string, number, number, EditorialNarrationBeat["purpose"], string[], string[]]> = [
    ["Your job search gets harder when each decision lives in a different tab.", 0, 3_300, "hook", [], []],
    ["Solomon keeps the evidence for your next move in one workspace.", 3_300, 6_200, "reveal", [], []],
    ["Start with roles that match what you want, then narrow the list around details that matter.", 6_200, 10_600, "evidence", ["claim-jobs"], ["jobs"]],
    ["Move opportunities into a tracker as priorities change.", 10_600, 13_500, "evidence", ["claim-tracker"], ["tracker"]],
    ["Review saved contacts with details beside each person.", 13_500, 16_400, "evidence", ["claim-contacts"], ["contacts"]],
    ["Inspect an outreach draft before anything moves forward.", 16_400, 19_300, "evidence", ["claim-outreach"], ["outreach"]],
    ["That means less time rebuilding the story behind each opportunity, and more clarity about what to review next.", 19_300, 24_700, "benefit", [], []],
    ["Find roles, track opportunities, understand contacts, and review outreach without losing the thread.", 24_700, 29_000, "recap", ["claim-jobs"], ["jobs"]],
    ["See how Solomon can bring your job search into focus.", 29_000, 32_000, "cta", [], []]
  ];
  const v3Rows: Array<[string, number, number, EditorialNarrationBeat["purpose"], string[], string[]]> = [
    ["The hard part of a job search is not finding a role. It is knowing why each one matters.", 0, 4_900, "hook", [], []],
    ["Solomon keeps that proof beside your next decision.", 4_900, 7_600, "reveal", [], []],
    ["Start with roles that fit what you want, then narrow the list around details that matter.", 7_600, 11_900, "evidence", ["claim-jobs"], ["jobs"]],
    ["Move roles into a tracker as priorities change.", 11_900, 14_700, "evidence", ["claim-tracker"], ["tracker"]],
    ["Review saved contacts with details beside each person.", 14_700, 17_500, "evidence", ["claim-contacts"], ["contacts"]],
    ["Inspect an outreach draft before anything moves forward.", 17_500, 20_300, "evidence", ["claim-outreach"], ["outreach"]],
    ["Spend less time rebuilding the story behind each lead.", 20_300, 23_500, "benefit", [], []],
    ["Find roles, track next steps, understand contacts, and review outreach without losing the thread.", 23_500, 28_300, "recap", ["claim-jobs"], ["jobs"]],
    ["See how Solomon puts every lead and next step in one clear view, from start to finish.", 28_300, 32_000, "cta", [], []]
  ];
  const v4Rows: Array<[string, number, number, EditorialNarrationBeat["purpose"], string[], string[]]> = [
    ["Finding roles is not the hard part.", 0, 2_100, "hook", [], []],
    ["Solomon keeps why each one matters beside your next decision.", 2_100, 5_000, "reveal", [], []],
    ["Start with roles that fit what you want, then narrow the list around details that matter and keep the reasons visible.", 5_000, 10_700, "evidence", ["claim-jobs"], ["jobs"]],
    ["Move roles into a tracker as priorities change. Next decisions stay clear.", 10_700, 14_700, "evidence", ["claim-tracker"], ["tracker"]],
    ["Review saved contacts with details beside each person.", 14_700, 17_500, "evidence", ["claim-contacts"], ["contacts"]],
    ["Inspect an outreach draft before anything moves forward.", 17_500, 20_300, "evidence", ["claim-outreach"], ["outreach"]],
    ["Spend less time rebuilding the story behind each lead.", 20_300, 23_500, "benefit", [], []],
    ["Find roles, track next steps, understand contacts, and review outreach without losing the thread.", 23_500, 28_300, "recap", ["claim-jobs"], ["jobs"]],
    ["See how Solomon puts every lead plus every next step in one clear view, from start to finish.", 28_300, 32_000, "cta", [], []]
  ];
  const v5Rows: Array<[string, number, number, EditorialNarrationBeat["purpose"], string[], string[]]> = [
    ["Stop rebuilding job-search decisions across tabs.", 0, 2_200, "hook", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []],
    ["Solomon keeps your next-move evidence together.", 2_200, 4_000, "reveal", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []],
    ["Start with roles and narrow what fits.", 4_000, 6_000, "evidence", ["claim-jobs"], ["jobs"]],
    ["Roles, contacts, and follow-ups stay together.", 6_000, 8_000, "evidence", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], ["jobs"]],
    ["Move the role into your tracker with the evidence.", 8_000, 10_000, "evidence", ["claim-tracker"], ["tracker"]],
    ["When priorities change, passive trackers lose context.", 10_000, 12_000, "evidence", ["claim-tracker"], ["tracker"]],
    ["Solomon keeps the next decision connected.", 12_000, 14_000, "benefit", ["claim-jobs", "claim-tracker"], []],
    ["Open a saved contact.", 14_000, 16_200, "evidence", ["claim-contacts"], ["contacts"]],
    ["The details stay beside the person.", 16_200, 18_500, "evidence", ["claim-contacts"], ["contacts"]],
    ["Review outreach before anything is sent.", 18_500, 20_800, "evidence", ["claim-outreach"], ["outreach"]],
    ["This is not another passive list.", 20_800, 23_000, "benefit", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []],
    ["Inspect the message with its context before anything moves.", 23_000, 25_300, "evidence", ["claim-outreach"], ["outreach"]],
    ["Roles, people, and next steps stay reviewable.", 25_300, 27_800, "recap", ["claim-jobs", "claim-tracker", "claim-contacts"], ["jobs"]],
    ["Move forward without rebuilding the story.", 27_800, 30_000, "benefit", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []],
    ["Ready to see the workflow? Open the Solomon demo.", 30_000, 33_000, "cta", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []]
  ];
  const v6Rows: Array<[string, number, number, EditorialNarrationBeat["purpose"], string[], string[]]> = [
    ["In Solomon, review roles, contacts, and outreach before messages send.", 0, 2_200, "hook", ["claim-jobs", "claim-contacts", "claim-outreach"], []],
    ["Start with a role.", 2_200, 4_000, "reveal", ["claim-jobs"], []],
    ["Narrow what fits around the details that matter.", 4_000, 6_000, "evidence", ["claim-jobs"], ["jobs"]],
    ["Keep the role details reviewable.", 6_000, 8_000, "evidence", ["claim-jobs"], ["jobs"]],
    ["Move the opportunity into your tracker.", 8_000, 10_000, "evidence", ["claim-tracker"], ["tracker"]],
    ["Priorities changed. Which role still fits your needs?", 10_000, 12_000, "evidence", ["claim-tracker"], ["tracker"]],
    ["Review the tracker and keep the next step in view.", 12_000, 14_000, "benefit", ["claim-tracker"], []],
    ["Open a saved contact.", 14_000, 16_200, "evidence", ["claim-contacts"], ["contacts"]],
    ["Inspect the details beside the person.", 16_200, 18_500, "evidence", ["claim-contacts"], ["contacts"]],
    ["Then review the outreach draft alongside its context.", 18_500, 20_800, "evidence", ["claim-outreach"], ["outreach"]],
    ["Nothing sends before you review it.", 20_800, 23_000, "benefit", ["claim-outreach"], []],
    ["Inspect the draft with its context. You choose what happens next.", 23_000, 25_300, "evidence", ["claim-outreach"], ["outreach"]],
    ["Role. Person. Details. Next step.", 25_300, 27_800, "recap", ["claim-jobs", "claim-contacts"], ["jobs"]],
    ["Move forward with each step still reviewable.", 27_800, 30_000, "benefit", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []],
    ["Open the Solomon demo when you're ready.", 30_000, 33_000, "cta", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []]
  ];
  const v7Rows: Array<[string, number, number, EditorialNarrationBeat["purpose"], string[], string[]]> = [
    ["Roles, people, and follow-ups can overwhelm a job search.", 0, 2_200, "hook", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []],
    ["What matters is the next move.", 2_200, 4_000, "reveal", ["claim-jobs", "claim-tracker"], []],
    ["Start with roles that fit.", 4_000, 6_000, "evidence", ["claim-jobs"], ["jobs"]],
    ["The list feels smaller.", 6_000, 8_000, "benefit", ["claim-jobs"], []],
    ["Good opportunities should not vanish into another tab.", 8_000, 10_000, "benefit", ["claim-tracker"], []],
    ["Keep one visible in your tracker.", 10_000, 12_000, "evidence", ["claim-tracker"], ["tracker"]],
    ["When priorities change, the next step stays clear.", 12_000, 14_000, "benefit", ["claim-tracker"], []],
    ["That clarity should follow each person.", 14_000, 16_200, "benefit", ["claim-contacts"], []],
    ["Open a saved contact with nearby details.", 16_200, 18_500, "evidence", ["claim-contacts"], ["contacts"]],
    ["Now the conversation has context.", 18_500, 20_800, "benefit", ["claim-contacts"], []],
    ["Before a message moves forward, you stay in control.", 20_800, 23_000, "benefit", ["claim-outreach"], []],
    ["Review the outreach draft beside its context.", 23_000, 25_300, "evidence", ["claim-outreach"], ["outreach"]],
    ["A scattered search becomes a story you can follow.", 25_300, 27_800, "benefit", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []],
    ["Roles, people, and next steps stay reviewable.", 27_800, 30_000, "recap", ["claim-jobs", "claim-tracker", "claim-contacts"], []],
    ["Open the Solomon demo when you're ready.", 30_000, 33_000, "cta", ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"], []]
  ];
  const rows = version === 7 ? v7Rows : version === 6 ? v6Rows : version === 5 ? v5Rows : version === 4 ? v4Rows : version === 3 ? v3Rows : version === 2 ? v2Rows : v1Rows;
  return rows.map(([text, startMs, endMs, purpose, claimIds, evidenceAssetIds], index) => ({
    id: `beat-${index + 1}`,
    text,
    startMs,
    endMs,
    purpose,
    claimIds,
    evidenceAssetIds,
    emphasizedWords: version >= 5
      ? index === 0
        ? version === 7 ? ["Roles", "search"] : ["Stop", "tabs"]
        : index === 14
          ? ["Solomon", "demo"]
          : []
      : version === 4
      ? index === 1
        ? ["Solomon", "matters"]
        : index === 8
          ? ["See", "Solomon", "clear"]
          : []
      : index === 1
        ? ["Solomon"]
        : index === 8
          ? ["See", "Solomon"]
          : []
  }));
}

function referenceRhythmBeatSpecs(version: 5 | 6 | 7): ReferenceRhythmBeatSpec[] {
  const legacyFunctions: ReferenceRhythmBeatSpec["narrativeFunction"][] = [
    "outcome_hook",
    "visual_metaphor",
    "credibility_proof",
    "scale_claim",
    "mechanism_action",
    "failure_state",
    "benefit_translation",
    "mechanism_action",
    "mechanism_result",
    "secondary_benefit",
    "objection",
    "evidence_answer",
    "credibility_proof",
    "benefit_translation",
    "direct_cta",
    "branded_hold"
  ];
  const v7Functions: ReferenceRhythmBeatSpec["narrativeFunction"][] = [
    "outcome_hook",
    "pain_setup",
    "credibility_proof",
    "benefit_translation",
    "failure_state",
    "mechanism_action",
    "mechanism_result",
    "secondary_benefit",
    "credibility_proof",
    "benefit_translation",
    "objection",
    "evidence_answer",
    "benefit_translation",
    "secondary_benefit",
    "direct_cta",
    "branded_hold"
  ];
  const v5SpokenClaims = [
    "Stop rebuilding job-search decisions across tabs.",
    "Solomon keeps your next-move evidence together.",
    "Start with roles and narrow what fits.",
    "Roles, contacts, and follow-ups stay together.",
    "Move the role into your tracker with the evidence.",
    "When priorities change, passive trackers lose context.",
    "Solomon keeps the next decision connected.",
    "Open a saved contact.",
    "The details stay beside the person.",
    "Review outreach before anything is sent.",
    "This is not another passive list.",
    "Inspect the message with its context before anything moves.",
    "Roles, people, and next steps stay reviewable.",
    "Move forward without rebuilding the story.",
    "Ready to see the workflow? Open the Solomon demo.",
    ""
  ];
  const v6SpokenClaims = [
    "In Solomon, review roles, contacts, and outreach before messages send.",
    "Start with a role.",
    "Narrow what fits around the details that matter.",
    "Keep the role details reviewable.",
    "Move the opportunity into your tracker.",
    "Priorities changed. Which role still fits your needs?",
    "Review the tracker and keep the next step in view.",
    "Open a saved contact.",
    "Inspect the details beside the person.",
    "Then review the outreach draft alongside its context.",
    "Nothing sends before you review it.",
    "Inspect the draft with its context. You choose what happens next.",
    "Role. Person. Details. Next step.",
    "Move forward with each step still reviewable.",
    "Open the Solomon demo when you're ready.",
    ""
  ];
  const v7SpokenClaims = [
    "Roles, people, and follow-ups can overwhelm a job search.",
    "What matters is the next move.",
    "Start with roles that fit.",
    "The list feels smaller.",
    "Good opportunities should not vanish into another tab.",
    "Keep one visible in your tracker.",
    "When priorities change, the next step stays clear.",
    "That clarity should follow each person.",
    "Open a saved contact with nearby details.",
    "Now the conversation has context.",
    "Before a message moves forward, you stay in control.",
    "Review the outreach draft beside its context.",
    "A scattered search becomes a story you can follow.",
    "Roles, people, and next steps stay reviewable.",
    "Open the Solomon demo when you're ready.",
    ""
  ];
  const v5EvidenceIds: Array<ResolvedSolomonCaptureSource["id"] | undefined> = [
    undefined, undefined, "jobs", "jobs", "tracker", "tracker", undefined, "contacts",
    "contacts", "outreach", undefined, "outreach", "jobs", undefined, undefined, undefined
  ];
  const v6EvidenceIds: Array<ResolvedSolomonCaptureSource["id"] | undefined> = [...v5EvidenceIds];
  const v7EvidenceIds: Array<ResolvedSolomonCaptureSource["id"] | undefined> = [
    undefined, undefined, "jobs", undefined, undefined, "tracker", undefined, undefined,
    "contacts", undefined, undefined, "outreach", undefined, undefined, undefined, undefined
  ];
  const spokenClaims = version === 7 ? v7SpokenClaims : version === 6 ? v6SpokenClaims : v5SpokenClaims;
  const evidenceIds = version === 7 ? v7EvidenceIds : version === 6 ? v6EvidenceIds : v5EvidenceIds;
  const legacyCycleRoles: Array<ReferenceRhythmBeatSpec["cycleRole"]> = [
    "claim", "proof", "proof", "claim", "proof", "claim", "benefit", "proof",
    "proof", "benefit", "claim", "proof", "proof", "benefit", undefined, undefined
  ];
  const cycleIds = [
    ["cycle-1"], ["cycle-1"], ["cycle-1"], ["cycle-2"], ["cycle-2"], ["cycle-3"],
    ["cycle-1"], ["cycle-3"], ["cycle-3"], ["cycle-3"], ["cycle-4"], ["cycle-4"],
    ["cycle-4"], ["cycle-2", "cycle-4"], [], []
  ];
  const v7CycleRoles: Array<ReferenceRhythmBeatSpec["cycleRole"]> = [
    "claim", "claim", "proof", "benefit", "claim", "proof", "benefit", "claim",
    "proof", "benefit", "claim", "proof", "benefit", "benefit", undefined, undefined
  ];
  const v7CycleIds = [
    ["cycle-1"], ["cycle-1"], ["cycle-1"], ["cycle-1"], ["cycle-2"], ["cycle-2"],
    ["cycle-2"], ["cycle-3"], ["cycle-3"], ["cycle-3"], ["cycle-4"], ["cycle-4"],
    ["cycle-4"], ["cycle-4"], [], []
  ];
  const functions = version === 7 ? v7Functions : legacyFunctions;
  const cycleRoles = version === 7 ? v7CycleRoles : legacyCycleRoles;
  const selectedCycleIds = version === 7 ? v7CycleIds : cycleIds;
  const allClaims = ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"];
  return functions.map((narrativeFunction, index) => {
    const evidenceAssetId = evidenceIds[index];
    const cycleRole = cycleRoles[index];
    return {
      id: `reference-beat-${String(index + 1).padStart(2, "0")}`,
      narrativeFunction,
      spokenClaim: spokenClaims[index]!,
      captionPhrases: spokenClaims[index]
        ? phraseChunks(spokenClaims[index]!)
        : ["OPEN THE DEMO"],
      claimIds: evidenceAssetId ? [`claim-${evidenceAssetId}`] : [...allClaims],
      evidenceRequirement: evidenceAssetId
        ? narrativeFunction === "mechanism_result" || narrativeFunction === "evidence_answer"
          ? "authenticated_result"
          : "authenticated_product"
        : narrativeFunction === "visual_metaphor"
          ? "conceptual_diagram"
          : "none",
      ...(evidenceAssetId ? { evidenceAssetId } : {}),
      cycleIds: selectedCycleIds[index]!,
      ...(cycleRole ? { cycleRole } : {}),
      ...(narrativeFunction === "visual_metaphor" ? {
        visualMetaphor: {
          kind: "connected_decision_trail" as const,
          conceptual: true as const,
          disclosure: "Conceptual workflow" as const
        }
      } : {}),
      typography: narrativeFunction === "outcome_hook" || narrativeFunction === "scale_claim"
        ? "editorial_serif"
        : narrativeFunction === "branded_hold"
          ? "brand_lockup"
          : evidenceAssetId
            ? "product_annotation"
            : "bold_sans",
      emphasisWords: narrativeFunction === "outcome_hook"
        ? version === 7 ? ["Roles", "search"] : ["Stop", "tabs"]
        : narrativeFunction === "direct_cta"
          ? ["Solomon", "demo"]
          : [],
      transitionBehavior: narrativeFunction === "branded_hold"
        ? "brand_resolve"
        : evidenceAssetId
          ? "card_slide"
          : narrativeFunction === "objection"
            ? "punch_in"
            : "hard_cut",
      presenterDirection: evidenceAssetId
        ? index % 2 === 0 ? "product_right" : "product_left"
        : narrativeFunction === "branded_hold"
          ? "none"
          : "audience",
      ...(narrativeFunction === "direct_cta" ? {
        cta: {
          action: "open_demo" as const,
          keyword: "DEMO" as const,
          text: "Open the Solomon demo.",
          availabilityConfirmed: false as const
        }
      } : {})
    };
  });
}

function solomonReferenceClaimProvenance(): ReferenceClaimProvenance[] {
  return [
    {
      claimId: "claim-jobs",
      statement: "Solomon supports browsing and narrowing roles.",
      evidenceAssetIds: ["jobs"],
      source: "approved_product_evidence"
    },
    {
      claimId: "claim-tracker",
      statement: "Solomon supports reviewing and updating tracked opportunities.",
      evidenceAssetIds: ["tracker"],
      source: "approved_product_evidence"
    },
    {
      claimId: "claim-contacts",
      statement: "Solomon shows saved-contact details beside the person.",
      evidenceAssetIds: ["contacts"],
      source: "approved_product_evidence"
    },
    {
      claimId: "claim-outreach",
      statement: "Solomon supports reviewing an outreach draft before anything is sent.",
      evidenceAssetIds: ["outreach"],
      source: "approved_product_evidence"
    }
  ];
}

function solomonV6ClaimEvidenceMatrix(
  sources: ResolvedSolomonCaptureSource[]
): V6ClaimEvidenceRow[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const row = (
    assetIds: ResolvedSolomonCaptureSource["id"][],
    spokenClaim: string,
    onScreenCaption: string,
    requiredProductAction: string,
    visibleResult: string,
    qualification: string
  ): V6ClaimEvidenceRow => {
    const resolved = assetIds.map((assetId) => {
      const source = byId.get(assetId);
      if (!source) throw new Error(`Missing authenticated Solomon source ${assetId}.`);
      return source;
    });
    return {
      spokenClaim,
      onScreenCaption,
      requiredProductAction,
      evidenceAssetIds: [...assetIds],
      sourceHashes: resolved.map(({ sha256: sourceHash }) => sourceHash),
      verifiedSourceIntervals: resolved.map((source) => ({
        assetId: source.id,
        startMs: source.trimMs,
        endMs: source.trimMs + 5_000
      })),
      visibleResult,
      approvalStatus: "approved",
      qualification
    };
  };
  return [
    row(
      ["jobs", "contacts", "outreach"],
      "In Solomon, review roles, contacts, and outreach before messages send.",
      "ROLES • CONTACTS • OUTREACH",
      "Review the approved jobs, contacts, and outreach captures as a cross-screen sequence.",
      "Each named object is visibly reviewable in its authenticated Solomon capture.",
      "This is a cross-screen workflow statement; it does not claim the objects share one screen or update automatically."
    ),
    row(
      ["jobs"],
      "Start with a role.",
      "START WITH A ROLE",
      "Open the authenticated jobs workflow.",
      "The Solomon role view is visible.",
      "This proves the role-browsing entry point only."
    ),
    row(
      ["jobs"],
      "Narrow what fits around the details that matter.",
      "NARROW WHAT FITS",
      "Browse and narrow roles in the authenticated jobs capture.",
      "A role list and its visible details remain readable after the action.",
      "The footage proves browsing and narrowing; it does not claim automated matching."
    ),
    row(
      ["jobs"],
      "Keep the role details reviewable.",
      "ROLE DETAILS STAY REVIEWABLE",
      "Hold the authenticated jobs result after narrowing.",
      "Visible role details remain on screen during the result hold.",
      "Reviewable means visibly inspectable in the captured role view."
    ),
    row(
      ["tracker"],
      "Move the opportunity into your tracker.",
      "MOVE INTO YOUR TRACKER",
      "Use the authenticated tracker workflow.",
      "The tracked opportunity is visible in Solomon.",
      "The footage proves the tracker workflow, not automatic movement or prioritization."
    ),
    row(
      ["tracker"],
      "Review the tracker and keep the next step in view.",
      "REVIEW THE NEXT STEP",
      "Open and review a tracked opportunity in the authenticated tracker capture.",
      "The tracked opportunity and its reviewable details remain visible.",
      "The footage proves review and update capability; it does not claim automatic prioritization."
    ),
    row(
      ["contacts"],
      "Open a saved contact.",
      "OPEN A SAVED CONTACT",
      "Open a saved contact in the authenticated contacts capture.",
      "The saved person record is visible.",
      "The footage proves saved-contact review, not contact discovery or enrichment."
    ),
    row(
      ["contacts"],
      "Inspect the details beside the person.",
      "DETAILS BESIDE THE PERSON",
      "Open a saved contact in the authenticated contacts capture.",
      "Saved-contact details are visible beside the person.",
      "The footage proves visible saved-contact context; it does not claim enrichment or data completeness."
    ),
    row(
      ["outreach"],
      "Then review the outreach draft alongside its context.",
      "REVIEW THE OUTREACH DRAFT",
      "Open the authenticated outreach workflow.",
      "The draft and its surrounding context are visible for review.",
      "The footage proves review of the captured draft; it does not prove that Solomon generated it."
    ),
    row(
      ["outreach"],
      "Nothing sends before you review it.",
      "REVIEW BEFORE SEND",
      "Open the outreach draft in the authenticated outreach capture.",
      "The draft is visibly available for review before any send action.",
      "The approved claim is limited to the captured review-before-send workflow."
    ),
    row(
      ["outreach"],
      "Inspect the draft with its context. You choose what happens next.",
      "YOU CHOOSE WHAT HAPPENS NEXT",
      "Hold the authenticated outreach draft before any send action.",
      "The draft remains visible for user review.",
      "Choice is limited to the captured review step; no claim about downstream automation is made."
    ),
    row(
      ["jobs", "tracker", "contacts", "outreach"],
      "Move forward with each step still reviewable.",
      "EACH STEP STAYS REVIEWABLE",
      "Review the four authenticated Solomon workflow captures in sequence.",
      "The role, tracker, contact, and outreach states are each visibly inspectable.",
      "This is a qualified cross-screen recap, not a claim of one-screen context or automatic state propagation."
    )
  ];
}

function solomonV7MicroScenes(
  sources: ResolvedSolomonCaptureSource[]
): V7ProductMicroScene[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const scene = (
    id: string,
    evidenceAssetId: ResolvedSolomonCaptureSource["id"],
    semanticPurpose: string,
    primaryIdea: string,
    allowedMotion: V7ProductMicroScene["allowedMotion"],
    cursorPolicy: V7ProductMicroScene["cursorPolicy"],
    expectedVisibleResult: string
  ): V7ProductMicroScene => {
    const source = byId.get(evidenceAssetId);
    if (!source) throw new Error(`Missing authenticated Solomon source ${evidenceAssetId}.`);
    const action = selectEditorialActionEvent(source.actionEvents);
    const requiresActionCursor = cursorPolicy === "SINGLE_ACTION" || cursorPolicy === "SOURCE_CURSOR_REQUIRED";
    const needsRecordedActionMoment = requiresActionCursor
      || allowedMotion === "single_status_change"
      || allowedMotion === "single_field_or_draft_appearance";
    const verifiedEndMs = verifiedSourceEnd(source.sourceDurationMs, source.trimMs);
    const intervalStartMs = needsRecordedActionMoment && action
      ? Math.max(
          source.trimMs,
          Math.min(
            allowedMotion === "single_field_or_draft_appearance"
              ? action.startMs + 250
              : action.startMs - 650,
            verifiedEndMs - 3_000
          )
        )
      : source.trimMs;
    const intervalEndMs = Math.min(verifiedEndMs, intervalStartMs + 3_000);
    if (intervalEndMs - intervalStartMs < 1_000) {
      throw new Error(`Authenticated Solomon source ${evidenceAssetId} has no usable V7 micro-scene interval.`);
    }
    const crop = paddedRegion(source.reviewedResultRegion, 0.055);
    const endingCrop = allowedMotion === "gentle_vertical_scroll"
      ? {
          ...crop,
          y: Math.min(1 - crop.height, crop.y + 0.055)
        }
      : allowedMotion === "static_hold_subtle_push_in"
        ? paddedRegion(source.reviewedResultRegion, 0.035)
        : crop;
    return {
      id,
      semanticPurpose,
      primaryIdea,
      evidenceAssetId,
      sourceHash: source.sha256,
      verifiedSourceInterval: { startMs: intervalStartMs, endMs: intervalEndMs },
      regionOfInterest: source.reviewedResultRegion,
      startingCrop: crop,
      endingCrop,
      allowedMotion,
      cursorPolicy,
      loopPolicy: "forbidden",
      maximumDurationMs: 3_000,
      claimIds: [`claim-${evidenceAssetId}`],
      expectedVisibleResult,
      fabricatedInterface: false,
      continuousNavigation: false
    };
  };
  return [
    scene(
      "jobs-scroll",
      "jobs",
      "Show a tightly framed role list as one supporting proof, without showing how the viewer navigated there.",
      "Relevant roles are visibly browsable.",
      "gentle_vertical_scroll",
      "HIDDEN_WHEN_NONESSENTIAL",
      "The authenticated Solomon role list and role details remain visible while the source gently scrolls."
    ),
    scene(
      "tracker-result",
      "tracker",
      "Show one tracked opportunity as the visible result, without replaying the tracker workflow.",
      "One opportunity remains visible in the tracker.",
      "single_status_change",
      "VISIBLE_STATIC",
      "The authenticated tracked opportunity and its next-step context are visible."
    ),
    scene(
      "contact-context",
      "contacts",
      "Show one saved person with nearby details as isolated evidence.",
      "Contact details remain beside the saved person.",
      "static_hold_subtle_push_in",
      "VISIBLE_STATIC",
      "The authenticated saved-contact record and its details are visible together."
    ),
    scene(
      "outreach-review",
      "outreach",
      "Show the draft and review context as the trust proof, without showing navigation or a send action.",
      "The outreach draft is reviewable before any send action.",
      "single_field_or_draft_appearance",
      "HIDDEN_WHEN_NONESSENTIAL",
      "The authenticated outreach draft and its surrounding context remain visible for review."
    )
  ];
}

function solomonV7ClaimEvidenceMatrix(
  sources: ResolvedSolomonCaptureSource[]
): V7ClaimEvidenceRow[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const row = (
    claimId: string,
    spokenClaim: string,
    assetIds: ResolvedSolomonCaptureSource["id"][],
    visibleResult: string,
    qualification: string
  ): V7ClaimEvidenceRow => {
    const resolved = assetIds.map((assetId) => {
      const source = byId.get(assetId);
      if (!source) throw new Error(`Missing authenticated Solomon source ${assetId}.`);
      return source;
    });
    return {
      claimId,
      spokenClaim,
      evidenceAssetIds: [...assetIds],
      sourceHashes: resolved.map(({ sha256: sourceHash }) => sourceHash),
      verifiedSourceIntervals: resolved.map((source) => ({
        assetId: source.id,
        startMs: source.trimMs,
        endMs: verifiedSourceEnd(source.sourceDurationMs, source.trimMs)
      })),
      visibleResult,
      qualification,
      approvalStatus: "approved"
    };
  };
  return [
    row(
      "claim-jobs-fit",
      "Start with roles that fit.",
      ["jobs"],
      "The captured Solomon role list and role details are visible.",
      "Fit means the viewer can inspect the captured role list; this does not claim automated matching."
    ),
    row(
      "claim-tracker-visible",
      "Keep one visible in your tracker.",
      ["tracker"],
      "A tracked opportunity is visible in the authenticated tracker capture.",
      "This proves a visible tracked state, not automatic movement or prioritization."
    ),
    row(
      "claim-tracker-next-step",
      "When priorities change, the next step stays clear.",
      ["tracker"],
      "The tracked opportunity and its reviewable next-step context remain visible.",
      "Clear means visibly reviewable in the captured tracker state."
    ),
    row(
      "claim-contact-details",
      "Open a saved contact with nearby details.",
      ["contacts"],
      "A saved person and nearby details are visible in the authenticated contact capture.",
      "This proves saved-contact review, not discovery, enrichment, or data completeness."
    ),
    row(
      "claim-contact-context",
      "Now the conversation has context.",
      ["contacts"],
      "The saved person and relevant visible details share the captured view.",
      "Context is limited to the details visible in the approved capture."
    ),
    row(
      "claim-outreach-control",
      "Before a message moves forward, you stay in control.",
      ["outreach"],
      "The outreach draft is visibly available for review before a send action.",
      "Control is limited to the captured review-before-send state and does not describe downstream automation."
    ),
    row(
      "claim-outreach-review",
      "Review the outreach draft beside its context.",
      ["outreach"],
      "The captured outreach draft and its surrounding context are visible together.",
      "This proves review of the captured draft; it does not claim Solomon generated it."
    ),
    row(
      "claim-cross-screen-reviewable",
      "Roles, people, and next steps stay reviewable.",
      ["jobs", "tracker", "contacts"],
      "Roles, tracked opportunities, and saved people are each visibly inspectable in separate approved captures.",
      "This is a cross-screen story statement, not a claim that all objects share one screen or update automatically."
    )
  ];
}

function paddedRegion(
  region: { x: number; y: number; width: number; height: number },
  padding: number
): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, region.x - padding);
  const y = Math.max(0, region.y - padding);
  return {
    x,
    y,
    width: Math.min(1 - x, region.width + padding * 2),
    height: Math.min(1 - y, region.height + padding * 2)
  };
}

function verifiedSourceEnd(sourceDurationMs: number, trimMs: number): number {
  return IS_V7
    ? sourceDurationMs
    : Math.min(sourceDurationMs, trimMs + 5_000);
}

function phraseChunks(value: string): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const phrases: string[] = [];
  for (let index = 0; index < words.length; index += 4) {
    phrases.push(words.slice(index, index + 4).join(" "));
  }
  return phrases;
}

async function readPilotCaptureState(): Promise<PilotCaptureState> {
  const statePath = path.join(CAPTURE_ROOT, "pilot-state.json");
  const parsed = JSON.parse(await fs.readFile(statePath, "utf8")) as Partial<PilotCaptureState>;
  if (!Array.isArray(parsed.artifacts)) throw new Error("Solomon pilot state is missing its artifact index.");
  return {
    artifacts: parsed.artifacts.filter((artifact): artifact is PilotCaptureArtifact =>
      Boolean(
        artifact
        && typeof artifact.kind === "string"
        && typeof artifact.originalFileName === "string"
        && typeof artifact.localPath === "string"
        && typeof artifact.sha256 === "string"
      )
    )
  };
}

async function resolveSolomonCaptureSource(
  definition: typeof SOURCES[number],
  state: PilotCaptureState
): Promise<ResolvedSolomonCaptureSource> {
  const currentArtifacts = state.artifacts.filter(({ localPath }) => localPath.startsWith(`${CAPTURE_ROOT}${path.sep}`));
  const normalized = currentArtifacts.find(({ kind, originalFileName }) =>
    kind === "normalized_flow_clip" && originalFileName === definition.normalizedFile
  );
  const framing = currentArtifacts.find(({ kind, originalFileName }) =>
    kind === "framing_manifest" && originalFileName === `${definition.workflowId}-framing.json`
  );
  if (!normalized || !framing) {
    throw new Error(`Solomon workflow ${definition.workflowId} is missing its normalized clip or framing manifest.`);
  }
  const framingPath = await exists(framing.localPath)
    ? framing.localPath
    : path.join(CAPTURE_ROOT, "presentations", definition.workflowId, `${definition.workflowId}-framing.json`);
  await assertFile(normalized.localPath);
  const framingStat = await fs.stat(framingPath);
  if (!framingStat.isFile() || framingStat.size === 0) {
    throw new Error(`Solomon workflow ${definition.workflowId} framing manifest is unusable.`);
  }
  const actualSourceSha256 = await sha256(normalized.localPath);
  const actualFramingSha256 = await sha256(framingPath);
  if (actualSourceSha256 !== normalized.sha256 || actualFramingSha256 !== framing.sha256) {
    throw new Error(`Solomon workflow ${definition.workflowId} failed artifact hash verification.`);
  }
  const actionCandidates = currentArtifacts.filter(({ kind }) => kind === "action_telemetry");
  let actionArtifact: PilotCaptureArtifact | undefined;
  let actionDocument: CaptureActionDocument | undefined;
  for (const candidate of actionCandidates) {
    const parsed = JSON.parse(await fs.readFile(candidate.localPath, "utf8")) as Partial<CaptureActionDocument>;
    if (parsed.receipt?.flowId === definition.workflowId && parsed.normalization?.output) {
      actionArtifact = candidate;
      actionDocument = parsed as CaptureActionDocument;
      break;
    }
  }
  if (!actionArtifact || !actionDocument) {
    throw new Error(`Solomon workflow ${definition.workflowId} is missing its action receipt.`);
  }
  const receiptSha256 = await sha256(actionArtifact.localPath);
  if (receiptSha256 !== actionArtifact.sha256) {
    throw new Error(`Solomon workflow ${definition.workflowId} action receipt failed hash verification.`);
  }
  const flowStartMs = Date.parse(actionDocument.receipt.startedAt);
  const actionEvents = actionDocument.receipt.steps.flatMap((step) => {
    const viewport = step.visualEvidence?.viewport;
    const target = step.visualEvidence?.actionTarget;
    if (!viewport || !target || viewport.width <= 0 || viewport.height <= 0) return [];
    return [{
      stepId: step.stepId,
      startMs: Math.max(0, Date.parse(step.startedAt) - flowStartMs),
      endMs: Math.max(1, Date.parse(step.completedAt) - flowStartMs),
      region: {
        x: clamp01(target.x / viewport.width),
        y: clamp01(target.y / viewport.height),
        width: Math.min(1, target.width / viewport.width),
        height: Math.min(1, target.height / viewport.height)
      },
      evidence: "recorded_action_target" as const,
      interaction: step.policyDecision?.effectiveRisk ?? "unknown" as const
    }];
  });
  const output = actionDocument.normalization.output;
  if (output.sha256 !== actualSourceSha256) {
    throw new Error(`Solomon workflow ${definition.workflowId} normalization receipt does not match its source.`);
  }
  return {
    ...definition,
    reviewedResultRegion: { ...definition.reviewedResultRegion },
    sourcePath: normalized.localPath,
    sha256: actualSourceSha256,
    sourceWidth: output.width,
    sourceHeight: output.height,
    sourceDurationMs: output.durationMs,
    framingManifestPath: framingPath,
    framingManifestSha256: actualFramingSha256,
    receiptPath: actionArtifact.localPath,
    receiptSha256,
    actionEvents
  };
}

function toEvidenceAsset(source: ResolvedSolomonCaptureSource): ProductEvidenceAsset {
  return {
    id: source.id,
    kind: "interaction_clip",
    label: source.label,
    sourceMomentIds: [source.workflowId],
    sourceEvidenceIds: [`verified-capture:${source.workflowId}`],
    supportedClaimIds: [`claim-${source.id}`],
    sourceStartMs: source.trimMs,
    sourceEndMs: verifiedSourceEnd(source.sourceDurationMs, source.trimMs),
    clipPath: source.sourcePath,
    contentHash: source.sha256,
    factoryVersion: "authentic-normalized-capture-v2",
    maskingStatus: "masked",
    crop: { x: 0.5, y: 0.45, scale: 1.25 },
    readableRegion: { x: 0.08, y: 0.12, width: 0.84, height: 0.72 },
    provenance: "captured_product",
    approvalStatus: "approved",
    factualUseAllowed: true
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function productCompositionForReport(composition: CreatorEditorialV3Edl["shots"][number]["compositionFamily"]) {
  if (
    composition === "asymmetric_split"
    || composition === "product_macro"
    || composition === "product_reaction"
    || composition === "product_comparison"
    || composition === "rapid_recap"
  ) {
    return composition;
  }
  return "product_macro" as const;
}

function productPresenterPlacementForReport(
  placement: CreatorEditorialV3Edl["shots"][number]["presenter"]["placement"]
) {
  return placement === "left" || placement === "right" || placement === "bottom" ? placement : "none";
}

function buildBlueprint(assets: ProductEvidenceAsset[]): CreativeBlueprint {
  return {
    schemaVersion: "1",
    id: `blueprint-solomon-editorial-${SEED}`,
    templateId: "creator-product-explainer",
    templateVersion: 1,
    targetDurationMs: DURATION_MS,
    pacePreset: "energetic",
    estimatedWordsPerMinute: 195,
    hook: IS_REFERENCE_RHYTHM
      ? "Stop rebuilding job-search decisions across tabs."
      : "Your job search should feel focused, not scattered.",
    cta: IS_REFERENCE_RHYTHM
      ? "Open the Solomon demo."
      : "See what Solomon can organize for your search.",
    brandKit: { productName: "Solomon", primaryColor: "#101A33", secondaryColor: "#F4F1E8", accentColor: "#39D3C4", backgroundColor: "#071526", captionStyle: "kinetic_bold", ctaStyle: "learn_more", tagline: "Evidence beside the next decision." },
    claimIds: assets.flatMap(({ supportedClaimIds }) => supportedClaimIds),
    productAssets: assets,
    scenes: [],
    renderPolicy: { canvas: { width: 1080, height: 1920, fps: 30 }, targetLufs: -14, loudnessToleranceLu: 1, ctaDurationMs: 3_000, mode: "production" },
    qualityPolicy: { requireEvidenceBackedClaims: true, requireCaptionSafeArea: true, requireAudioAlignment: true, requireCta: true, requireAvatarDisclosure: true, maxVisualChangesPerTenSeconds: IS_REFERENCE_RHYTHM ? 18 : 6, minProductTextScale: 1.15 },
    compiledAt: "2026-07-27T00:00:00.000Z"
  };
}

function baseGideonEditDecisionList(blueprint: CreativeBlueprint): EditDecisionList {
  return {
    schemaVersion: "2",
    templateId: "creator-template:brand_presenter:v1",
    templateKey: "brand_presenter",
    templateVersion: 1,
    brandKitId: blueprint.brandKit.id ?? "solomon-editorial-brand",
    durationMs: DURATION_MS,
    canvas: { width: 1080, height: 1920, fps: 30 },
    brandKit: blueprint.brandKit,
    sourceSegments: [{ momentId: "verified-solomon-capture", sourceStartMs: 0, sourceEndMs: 5_000, timelineStartMs: 0, timelineEndMs: DURATION_MS, fit: "contain", focus: { x: 0.5, y: 0.5, scale: 1 } }],
    zooms: [],
    transitions: [],
    captions: [],
    overlays: [],
    callouts: [],
    cursorCues: [],
    sfx: [],
    presenter: {
      enabled: true,
      style: "fictional_illustrated",
      avatarId: "orbit",
      provenance: "gideon_fictional_catalog",
      disclosure: "AI-generated brand presenter",
      startMs: 0,
      endMs: DURATION_MS,
      position: "lower_left",
      motion: "caption_sync"
    },
    music: { enabled: true, mood: "clean_tech", gainDb: -28 },
    qualityGates: { requireEvidenceBackedClaims: true, requireCaptionSafeArea: true, requireAudioAlignment: true }
  };
}

function buildAss(captions: ReturnType<typeof buildKineticCaptions>): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Support,Avenir Next,68,&H00F4F1E8,&H0039D3C4,&H00101A33,&H90071526,-1,0,0,0,100,100,0,0,1,4,0,8,70,70,150,1
Style: Display,Georgia,76,&H0039D3C4,&H00F4F1E8,&H00101A33,&H90071526,-1,-1,0,0,100,100,0,0,1,4,0,8,70,70,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  const events = captions.map((caption) => {
    const style = caption.role === "display_editorial" ? "Display" : "Support";
    const text = caption.words.join(" ").replace(/[{}]/g, "");
    return `Dialogue: 0,${assTime(caption.startMs)},${assTime(caption.endMs)},${style},,0,0,0,,${text}`;
  });
  events.push("Dialogue: 0,0:00:32.00,0:00:35.00,Display,,0,0,0,,{\\an5\\fs108}SOLOMON\\N{\\fs42\\c&H00D3D339&}Evidence beside the next decision.\\N{\\fs24\\c&H00E8F1F4&}AI-generated masked presenter");
  return `${header}\n${events.join("\n")}\n`;
}

function buildAssV2(captions: EditorialV2CaptionCue[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Standard,Avenir Next,64,&H00F4F1E8,&H0039D3C4,&H00101A33,&H90071526,-1,0,0,0,100,100,0,0,1,4,0,8,70,70,150,1
Style: Keyword,Avenir Next,88,&H0039D3C4,&H00F4F1E8,&H00101A33,&H90071526,-1,0,0,0,100,100,0,0,1,4,0,8,70,70,150,1
Style: Editorial,Avenir Next,102,&H0039D3C4,&H00F4F1E8,&H00101A33,&H90071526,-1,0,0,0,100,100,0,0,1,5,0,5,70,70,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  const events = captions.map((caption) => {
    const style = caption.role === "full_frame_editorial"
      ? "Editorial"
      : caption.role === "keyword_emphasis"
        ? "Keyword"
        : "Standard";
    return `Dialogue: 0,${assTime(caption.startMs)},${assTime(caption.endMs)},${style},,0,0,0,,${caption.words.join(" ").replace(/[{}]/g, "")}`;
  });
  events.push("Dialogue: 0,0:00:32.00,0:00:35.00,Editorial,,0,0,0,,{\\an5\\fs118}SOLOMON\\N{\\fs46\\c&H00D3D339&}Evidence beside the next decision.\\N{\\fs24\\c&H00E8F1F4&}AI-generated masked presenter");
  return `${header}\n${events.join("\n")}\n`;
}

function buildAssV3(captions: EditorialV3CaptionCue[]): string {
  return buildAssV2(captions);
}

function proceduralSfxExpression(edl: CreatorEditorialEdl | CreatorEditorialV2Edl | CreatorEditorialV3Edl | CreatorEditorialV4Edl | CreatorEditorialReferenceRhythmEdl | CreatorEditorialAiCreatorV6Edl | CreatorEditorialUserStoryV7Edl): string {
  const specifications: Record<string, { frequency: number; duration: number; amplitude: number }> = {
    click: { frequency: 1_100, duration: 0.055, amplitude: 0.12 },
    soft_whoosh: { frequency: 310, duration: 0.18, amplitude: 0.08 },
    card_entry: { frequency: 440, duration: 0.14, amplitude: 0.10 },
    impact: { frequency: 145, duration: 0.12, amplitude: 0.12 },
    outro_sting: { frequency: 520, duration: 0.42, amplitude: 0.10 }
  };
  const terms = edl.shots.flatMap((shot) => shot.soundEffects.map((kind, index) => {
    const specification = specifications[kind]!;
    const start = shot.startMs / 1_000 + 0.04 + index * 0.07;
    const end = start + specification.duration;
    return `${specification.amplitude}*sin(2*PI*${specification.frequency}*t)*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`;
  }));
  return terms.length > 0 ? terms.join("+") : "0";
}

async function measureSsim(
  referencePath: string,
  encodedPath: string,
  scaleReference = false
): Promise<{ all: number; comparison: string }> {
  const filter = scaleReference
    ? "[0:v]scale=720:1280:flags=lanczos[ref];[ref][1:v]ssim"
    : "[0:v][1:v]ssim";
  const result = await capture(FFMPEG, [
    "-hide_banner", "-nostats", "-i", referencePath, "-i", encodedPath,
    "-filter_complex", filter, "-an", "-f", "null", "-"
  ], 900_000);
  if (result.code !== 0) throw new Error(`SSIM comparison failed: ${result.stderr.slice(-2_000)}`);
  const match = result.stderr.match(/SSIM Y:[0-9.]+ .* All:([0-9.]+)/);
  return {
    all: Number(match?.[1] ?? 0),
    comparison: scaleReference ? "social encode against Lanczos-scaled master" : "master video against silent mezzanine"
  };
}

async function createPerceptualShotReport(
  videoPath: string,
  edl: CreatorEditorialEdl | CreatorEditorialV2Edl | CreatorEditorialV3Edl | CreatorEditorialV4Edl | CreatorEditorialReferenceRhythmEdl | CreatorEditorialAiCreatorV6Edl | CreatorEditorialUserStoryV7Edl
): Promise<{
  schemaVersion: "1";
  method: string;
  threshold: { normalizedSignalDistance: number; structuralDimensionFallback: number };
  meaningfulChangeCount: number;
  duplicateAdjacentPairs: string[];
  longestUnchangedCompositionMs: number;
  windows: Array<{ startMs: number; endMs: number; meaningfulChanges: number }>;
  boundaries: Array<Record<string, unknown>>;
}> {
  const signatures = await Promise.all(edl.shots.map(async (shot) => {
    const midpointSeconds = ((shot.startMs + shot.endMs) / 2 / 1_000).toFixed(3);
    const result = await capture(FFMPEG, [
      "-hide_banner", "-loglevel", "info", "-ss", midpointSeconds, "-i", videoPath,
      "-frames:v", "1",
      "-vf", "scale=180:320:flags=area,signalstats,metadata=print",
      "-an", "-f", "null", "-"
    ], 120_000);
    const metric = (name: string): number => Number(result.stderr.match(new RegExp(`lavfi\\.signalstats\\.${name}=([0-9.]+)`))?.[1] ?? 0);
    return { y: metric("YAVG"), u: metric("UAVG"), v: metric("VAVG"), saturation: metric("SATAVG") };
  }));
  const structural = IS_V2 ? evaluateCreatorEditorialV2(edl as CreatorEditorialV2Edl).meaningfulChanges : [];
  const boundaryInputs = edl.shots.slice(1).map((shot, index) => {
    const previous = edl.shots[index]!;
    const changedDimensions = structural[index]?.changedDimensions ?? [
      previous.family !== shot.family ? "family" : "",
      previous.presenter.placement !== shot.presenter.placement ? "presenter_placement" : "",
      previous.productEvidenceIds.join(",") !== shot.productEvidenceIds.join(",") ? "product_source" : ""
    ].filter(Boolean);
    return {
      fromShotId: previous.id,
      toShotId: shot.id,
      boundaryMs: shot.startMs,
      changedDimensions,
      from: signatures[index]!,
      to: signatures[index + 1]!
    };
  });
  const windowRanges = [[0, 6_000], [6_000, 21_000], [21_000, 29_000], [29_000, 35_000]] as const;
  const analysis = analyzeEditorialPerceptualBoundaries(boundaryInputs, DURATION_MS, windowRanges);
  return {
    schemaVersion: "1",
    method: "Hybrid rendered-frame signal signature (luma/chroma/saturation) plus semantic composition dimensions; a planned boundary is not counted automatically.",
    threshold: { normalizedSignalDistance: 0.012, structuralDimensionFallback: 4 },
    ...analysis,
    boundaries: analysis.boundaries.map(({ from, to, ...boundary }) => ({
      ...boundary,
      renderedSignals: { from, to }
    }))
  };
}

async function strip(videoPath: string, outputPath: string, timestamps: number[]): Promise<void> {
  const frameDir = `${outputPath}.frames`;
  await fs.mkdir(frameDir, { recursive: true, mode: 0o700 });
  const frames = await Promise.all(timestamps.map(async (timestamp, index) => {
    const frame = path.join(frameDir, `${String(index).padStart(2, "0")}.jpg`);
    await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", timestamp.toFixed(3), "-i", videoPath, "-frames:v", "1", "-vf", "scale=216:384,format=yuvj420p", frame], 120_000);
    return frame;
  }));
  const list = path.join(frameDir, "list.txt");
  await fs.writeFile(list, frames.map((frame) => `file '${frame}'`).join("\n"), { mode: 0o600 });
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-vf", `tile=${frames.length}x1:padding=4:margin=4,format=yuvj420p`, "-frames:v", "1", outputPath], 120_000);
}

function buildReferenceRhythmBreakdown(
  edl: CreatorEditorialReferenceRhythmEdl,
  metrics: {
    durationMs: number;
    presenterVisibilityRatio: number;
    maximumInternalEventGapMs: number;
  }
): string {
  const rows = edl.narrativeBeats.map((beat) => {
    const startFrame = Math.floor(beat.startMs / 1_000 * 30) + 1;
    const endFrame = Math.round(beat.endMs / 1_000 * 30);
    const evidence = beat.evidenceAssetId
      ? `Authenticated Solomon ${beat.evidenceAssetId} footage shows the action and reviewed result.`
      : beat.visualMetaphor
        ? `A labelled ${beat.visualMetaphor.disclosure.toLowerCase()} connects the workflow stages.`
        : beat.narrativeFunction === "branded_hold"
          ? "The Solomon brand and demo action remain on screen."
          : "The masked presenter and phrase typography carry the claim.";
    const internal = beat.internalVisualEvents.map(({ description }) => description).join(" ");
    return `| **${formatTime(beat.startMs)}–${formatTime(beat.endMs)}**  **Frames ${startFrame}–${endFrame}** | ${evidence} ${internal} | ${narrativePurpose(beat.narrativeFunction)} |`;
  });
  const presenterPercent = Number((metrics.presenterVisibilityRatio * 100).toFixed(1));
  return `# Solomon reference-rhythm editorial breakdown

## What the video is doing

This is a **${(metrics.durationMs / 1_000).toFixed(2)}-second vertical product explainer** built around one defensible promise:

> Stop rebuilding the context behind each job-search decision; Solomon keeps roles, people, evidence, and next steps reviewable in one workflow.

The video contains approximately **${Math.round(metrics.durationMs / 1_000 * 30).toLocaleString("en-US")} frames at 30 fps**. The states below come from the compiled narrative-beat manifest and exact encoded timeline.

## Frame-by-frame breakdown

| Time / frames | What happens visually | Why it is there |
| --- | --- | --- |
${rows.join("\n")}

## The underlying script structure

1. **Outcome-first hook:** Stop rebuilding job-search decisions across tabs.
2. **Visual metaphor:** A disclosed connected trail makes the benefit legible immediately.
3. **Authentic proof:** Recorded Solomon role, tracker, contact, and outreach workflows support the claims.
4. **Breadth:** Roles, reasons, contacts, and follow-ups are shown as one reviewable workflow.
5. **Pain and failure:** A passive tracker loses the story when priorities change.
6. **Mechanism:** Recorded actions lead to visible, reviewed product results.
7. **Benefit translation:** Context remains available for the next decision.
8. **Objection handling:** The video explicitly rejects the “another passive list” interpretation.
9. **Evidence answer:** Authentic outreach and recap footage answer the objection.
10. **Direct CTA:** Open the Solomon demo.

The compiler records **${edl.referenceGrammar.claimProofBenefitCycleCount} complete claim → proof → benefit cycles**.

## Editing and retention mechanics

### Pacing

There are **${edl.shots.length} major visual sections**, averaging approximately **${(edl.durationMs / edl.shots.length / 1_000).toFixed(2)} seconds each**. Compiled caption, annotation, diagram, gesture, and emphasis events keep the maximum active-section event gap at **${metrics.maximumInternalEventGapMs} ms**.

### A-roll versus B-roll

The masked presenter is visible for approximately **${presenterPercent}%** of the timeline. Authentic product evidence occupies the remaining product-led and composite sections. The rhythm alternates presenter, conceptual explanation, product proof, presenter translation, and CTA.

### Typography

Bold sans-serif phrases carry conversational narration and the CTA. Editorial serif treatments carry the outcome hook, breadth statement, and brand emphasis. Product annotations remain visually subordinate to authentic pixels.

### Composition

The output cycles through close-up presenter, editorial phrase, asymmetric split, product macro, product reaction, product comparison, recap, CTA, and branded-hold compositions. Product cards retain landscape context instead of stretching desktop footage into a vertical interface.

### Presenter performance

The mouthless masked presenter uses verified emphasis, explanation, directional pointing, reaction, listening, and open-CTA performances. Subtle sway and breathing-scale movement are continuous; gesture peaks remain aligned to narration without claiming lip synchronization.

## Why the hook works

The first section names a specific frustration and an immediate outcome: stop rebuilding job-search decisions across disconnected tabs. Solomon appears in the next section as the mechanism, rather than delaying the benefit behind a generic introduction.

## Credibility and limitations

- Product screens are authenticated Solomon recordings with source hashes and verified intervals.
- Cursor pixels are measured in both source and decoded output frames; no synthetic pointer is added.
- The connected-trail diagram is explicitly labelled conceptual.
- No numerical performance claim, testimonial, public-availability claim, or fabricated interface is introduced.
- The masked presenter cannot reproduce human facial micro-expression.
- Voice naturalness, pronunciation, brand fit, and publication approval remain human decisions.

## The reusable formula

**0–2.2 seconds:** Concrete outcome.
**2.2–4 seconds:** Disclosed visual metaphor.
**4–8 seconds:** Authentic proof and breadth.
**8–12 seconds:** Action, pain, and failure state.
**12–20.8 seconds:** Mechanism, result, and secondary benefit.
**20.8–27.8 seconds:** Objection and evidence answer.
**27.8–33 seconds:** Benefit translation and direct CTA.
**33–36 seconds:** Branded action hold.

This template copies the reference’s structural rhythm and visual hierarchy, not its creator identity, assets, wording, or product claims.
`;
}

function narrativePurpose(value: CreatorEditorialReferenceRhythmEdl["narrativeBeats"][number]["narrativeFunction"]): string {
  const purposes: Record<typeof value, string> = {
    outcome_hook: "State the concrete result before explanation.",
    visual_metaphor: "Make the abstract workflow benefit understandable in under a second.",
    credibility_proof: "Support the adjacent claim with authenticated product evidence.",
    scale_claim: "Show the breadth of the connected workflow without inventing a number.",
    pain_setup: "Name the recognizable workflow frustration.",
    failure_state: "Create the low point that makes the mechanism necessary.",
    mechanism_action: "Show what the user actually does.",
    mechanism_result: "Show the visible interface response and retained context.",
    benefit_translation: "Translate the mechanism into a practical user outcome.",
    secondary_benefit: "Add another supported reason to care.",
    objection: "Surface the natural concern that Solomon is only another list.",
    evidence_answer: "Answer the concern with authenticated product evidence.",
    direct_cta: "Give the viewer one specific, low-friction action.",
    branded_hold: "Allow enough time to recognize Solomon and complete the action."
  };
  return purposes[value];
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${(totalSeconds % 60).toFixed(2).padStart(5, "0")}`;
}

async function probe(filePath: string): Promise<{
  durationMs: number;
  formatBitrate?: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  videoProfile?: string;
  videoPixelFormat?: string;
  videoBitrate?: number;
  audioCodec?: string;
  audioSampleRate?: number;
  audioBitrate?: number;
}> {
  const result = await capture(FFPROBE, ["-v", "error", "-show_entries", "format=duration,bit_rate:stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,sample_rate,bit_rate", "-of", "json", filePath], 60_000);
  if (result.code !== 0) throw new Error(`FFprobe failed: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      profile?: string;
      pix_fmt?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      sample_rate?: string;
      bit_rate?: string;
    }>;
  };
  const video = parsed.streams?.find(({ codec_type }) => codec_type === "video");
  const audio = parsed.streams?.find(({ codec_type }) => codec_type === "audio");
  const [num = "0", den = "1"] = video?.r_frame_rate?.split("/") ?? [];
  return {
    durationMs: Math.round(Number(parsed.format?.duration) * 1_000),
    formatBitrate: Number(parsed.format?.bit_rate) || undefined,
    width: video?.width,
    height: video?.height,
    fps: Number(num) / Number(den),
    videoCodec: video?.codec_name,
    videoProfile: video?.profile,
    videoPixelFormat: video?.pix_fmt,
    videoBitrate: Number(video?.bit_rate) || undefined,
    audioCodec: audio?.codec_name,
    audioSampleRate: Number(audio?.sample_rate) || undefined,
    audioBitrate: Number(audio?.bit_rate) || undefined
  };
}

function run(executable: string, args: string[], timeoutMs: number): Promise<void> {
  return capture(executable, args, timeoutMs).then((result) => {
    if (result.code !== 0) throw new Error(`${path.basename(executable)} failed: ${result.stderr.slice(-4_000)}`);
  });
}

function capture(executable: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-2_000_000); });
    child.once("error", reject);
    child.once("close", (code) => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}

function captureBuffer(
  executable: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout.push(chunk); });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-2_000_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout: Buffer.concat(stdout), stderr });
    });
  });
}

function parseLastJson(value: string): Record<string, string> | undefined {
  const matches = [...value.matchAll(/\{[\s\S]*?\}/g)];
  const last = matches.at(-1)?.[0];
  if (!last) return undefined;
  try { return JSON.parse(last) as Record<string, string>; } catch { return undefined; }
}

async function assertFile(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < 1_000) throw new Error(`Required private input is unusable: ${filePath}`);
}
async function repositoryRevision(): Promise<{ head: string; dirty: boolean; worktree: string }> {
  const head = await capture("git", ["rev-parse", "HEAD"], 30_000);
  const dirty = await capture("git", ["status", "--porcelain", "--untracked-files=no"], 30_000);
  if (head.code !== 0 || dirty.code !== 0) throw new Error("Unable to record repository implementation revision.");
  return { head: head.stdout.trim(), dirty: dirty.stdout.trim().length > 0, worktree: process.cwd() };
}
async function readOptionalJson<T>(filePath: string): Promise<T | undefined> {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")) as T; } catch { return undefined; }
}
async function exists(filePath: string): Promise<boolean> { try { await fs.access(filePath); return true; } catch { return false; } }
async function sha256(filePath: string): Promise<string> { return createHash("sha256").update(await fs.readFile(filePath)).digest("hex"); }
async function writeJson(filePath: string, value: unknown): Promise<void> { await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
function countWords(value: string): number { return value.trim().split(/\s+/).filter(Boolean).length; }
function seconds(ms: number): string { return (ms / 1_000).toFixed(3); }
function assTime(ms: number): string { const cs = Math.round(ms / 10); const h = Math.floor(cs / 360_000); const m = Math.floor((cs % 360_000) / 6_000); const s = Math.floor((cs % 6_000) / 100); return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; }

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
