export interface EditorialNarrationCandidateMetrics {
  id: string;
  seed: number;
  exactApprovedWordSequence: boolean;
  minimumWordProbability: number;
  meanWordProbability: number;
  tempoCorrection: number;
  maximumGapMs: number;
  integratedRmsDb: number;
  peakDb: number;
  durationMs: number;
}

export interface EditorialNarrationCandidateScore extends EditorialNarrationCandidateMetrics {
  accepted: boolean;
  rejectionReasons: string[];
  score: number;
}

export interface EditorialNarrationSelection {
  selectedCandidateId: string;
  candidates: EditorialNarrationCandidateScore[];
  policy: {
    exactWordsRequired: true;
    minimumWordProbability: 0.35;
    tempoRange: { min: 0.92; max: 1.08 };
    maximumGapMs: number;
    tieBreak: "candidate_id";
  };
}

export function selectEditorialNarrationCandidate(
  candidates: EditorialNarrationCandidateMetrics[],
  options?: { maximumGapMs?: number }
): EditorialNarrationSelection {
  if (candidates.length < 2) throw new Error("Editorial narration selection requires at least two candidates.");
  const maximumGapMs = options?.maximumGapMs ?? 600;
  if (!Number.isFinite(maximumGapMs) || maximumGapMs < 400 || maximumGapMs > 700) {
    throw new Error("Editorial narration maximum gap must be between 400 and 700 ms.");
  }
  const ids = new Set<string>();
  const scored = candidates.map((candidate): EditorialNarrationCandidateScore => {
    if (!candidate.id || ids.has(candidate.id) || !Number.isSafeInteger(candidate.seed)) {
      throw new Error("Editorial narration candidate identifiers and seeds must be unique and valid.");
    }
    ids.add(candidate.id);
    const rejectionReasons = [
      !candidate.exactApprovedWordSequence ? "word_sequence" : undefined,
      candidate.minimumWordProbability < 0.35 ? "minimum_word_probability" : undefined,
      candidate.tempoCorrection < 0.92 || candidate.tempoCorrection > 1.08 ? "tempo_correction" : undefined,
      candidate.maximumGapMs > maximumGapMs ? "narration_gap" : undefined,
      candidate.durationMs <= 0 ? "duration" : undefined
    ].filter((reason): reason is string => Boolean(reason));
    const score = rejectionReasons.length > 0
      ? Number.NEGATIVE_INFINITY
      : 100
        - Math.abs(candidate.tempoCorrection - 1) * 120
        + candidate.meanWordProbability * 10
        + candidate.minimumWordProbability * 4
        - Math.abs(candidate.integratedRmsDb + 18) * 0.25
        - Math.max(0, candidate.maximumGapMs - 300) / 200;
    return { ...candidate, accepted: rejectionReasons.length === 0, rejectionReasons, score };
  });
  const accepted = scored.filter(({ accepted }) => accepted).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected = accepted[0];
  if (!selected) throw new Error("No editorial narration candidate passed exact-word, timing, and pace policy.");
  return {
    selectedCandidateId: selected.id,
    candidates: scored,
    policy: {
      exactWordsRequired: true,
      minimumWordProbability: 0.35,
      tempoRange: { min: 0.92, max: 1.08 },
      maximumGapMs,
      tieBreak: "candidate_id"
    }
  };
}
