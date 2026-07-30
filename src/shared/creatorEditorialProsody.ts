export interface EditorialProsodyMetrics {
  pitchRangeSemitones: number;
  pitchStdSemitones: number;
  medianPitchHz: number;
  energyRangeDb: number;
  meanEnergyDb: number;
  voicedRatio: number;
  meanVoicedProbability: number;
  maximumJoinEnergyDeltaDb: number;
  emphasizedBeatCoverage: number;
}

export interface EditorialProsodyCandidate {
  id: string;
  acceptedByBasePolicy: boolean;
  baseScore: number;
  prosody: EditorialProsodyMetrics;
}

export interface EditorialProsodyCandidateScore extends EditorialProsodyCandidate {
  accepted: boolean;
  rejectionReasons: string[];
  prosodyScore: number;
  combinedScore: number;
}

export function selectEditorialProsodyCandidate(candidates: EditorialProsodyCandidate[]): {
  selectedCandidateId: string;
  candidates: EditorialProsodyCandidateScore[];
  policy: {
    minimumPitchRangeSemitones: 2.5;
    minimumPitchStdSemitones: 0.8;
    minimumEnergyRangeDb: 4;
    maximumJoinEnergyDeltaDb: 9;
    minimumEmphasizedBeatCoverage: 0.55;
    voicedRatio: { min: 0.25; max: 0.95 };
    tieBreak: "candidate_id";
  };
} {
  if (candidates.length < 2) throw new Error("Prosody selection requires at least two narration candidates.");
  const ids = new Set<string>();
  const scores = candidates.map((candidate): EditorialProsodyCandidateScore => {
    if (!candidate.id || ids.has(candidate.id)) throw new Error("Prosody candidate IDs must be unique.");
    ids.add(candidate.id);
    const rejectionReasons = [
      !candidate.acceptedByBasePolicy ? "base_narration_policy" : undefined,
      candidate.prosody.pitchRangeSemitones < 2.5 ? "flat_pitch_range" : undefined,
      candidate.prosody.pitchStdSemitones < 0.8 ? "flat_pitch_contour" : undefined,
      candidate.prosody.energyRangeDb < 4 ? "flat_energy" : undefined,
      candidate.prosody.maximumJoinEnergyDeltaDb > 9 ? "join_energy_discontinuity" : undefined,
      candidate.prosody.emphasizedBeatCoverage < 0.55 ? "weak_emphasis_coverage" : undefined,
      candidate.prosody.voicedRatio < 0.25 || candidate.prosody.voicedRatio > 0.95 ? "voiced_ratio" : undefined
    ].filter((value): value is string => Boolean(value));
    const prosodyScore = candidate.prosody.pitchRangeSemitones * 1.8
      + candidate.prosody.pitchStdSemitones * 3
      + Math.min(14, candidate.prosody.energyRangeDb)
      + candidate.prosody.emphasizedBeatCoverage * 12
      + candidate.prosody.meanVoicedProbability * 4
      - candidate.prosody.maximumJoinEnergyDeltaDb * 0.8;
    return {
      ...candidate,
      accepted: rejectionReasons.length === 0,
      rejectionReasons,
      prosodyScore,
      combinedScore: rejectionReasons.length === 0 ? candidate.baseScore + prosodyScore : Number.NEGATIVE_INFINITY
    };
  });
  const selected = scores.filter(({ accepted }) => accepted)
    .sort((a, b) => b.combinedScore - a.combinedScore || a.id.localeCompare(b.id))[0];
  if (!selected) throw new Error("No narration candidate passed v3 pitch, energy, join, and emphasis policy.");
  return {
    selectedCandidateId: selected.id,
    candidates: scores,
    policy: {
      minimumPitchRangeSemitones: 2.5,
      minimumPitchStdSemitones: 0.8,
      minimumEnergyRangeDb: 4,
      maximumJoinEnergyDeltaDb: 9,
      minimumEmphasizedBeatCoverage: 0.55,
      voicedRatio: { min: 0.25, max: 0.95 },
      tieBreak: "candidate_id"
    }
  };
}
