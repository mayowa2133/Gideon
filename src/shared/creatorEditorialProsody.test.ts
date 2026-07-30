import { describe, expect, it } from "vitest";
import { selectEditorialProsodyCandidate, type EditorialProsodyCandidate } from "./creatorEditorialProsody";

function candidate(id: string, overrides: Partial<EditorialProsodyCandidate["prosody"]> = {}): EditorialProsodyCandidate {
  return {
    id,
    acceptedByBasePolicy: true,
    baseScore: 100,
    prosody: {
      pitchRangeSemitones: 5,
      pitchStdSemitones: 1.4,
      medianPitchHz: 150,
      energyRangeDb: 8,
      meanEnergyDb: -24,
      voicedRatio: 0.65,
      meanVoicedProbability: 0.9,
      maximumJoinEnergyDeltaDb: 3,
      emphasizedBeatCoverage: 0.8,
      ...overrides
    }
  };
}

describe("creator editorial v3 prosody selection", () => {
  it("rejects flat pitch, flat energy, weak emphasis, and discontinuous joins", () => {
    const result = selectEditorialProsodyCandidate([
      candidate("flat", { pitchRangeSemitones: 1, pitchStdSemitones: 0.4, energyRangeDb: 2, emphasizedBeatCoverage: 0.2 }),
      candidate("jagged", { maximumJoinEnergyDeltaDb: 12 }),
      candidate("natural")
    ]);
    expect(result.selectedCandidateId).toBe("natural");
    expect(result.candidates.find(({ id }) => id === "flat")?.rejectionReasons).toEqual(
      expect.arrayContaining(["flat_pitch_range", "flat_pitch_contour", "flat_energy", "weak_emphasis_coverage"])
    );
    expect(result.candidates.find(({ id }) => id === "jagged")?.rejectionReasons).toContain("join_energy_discontinuity");
  });

  it("scores stronger natural variation deterministically", () => {
    const result = selectEditorialProsodyCandidate([
      candidate("candidate-1"),
      candidate("candidate-2", { pitchRangeSemitones: 7, pitchStdSemitones: 2, energyRangeDb: 10 })
    ]);
    expect(result.selectedCandidateId).toBe("candidate-2");
    expect(selectEditorialProsodyCandidate([
      candidate("candidate-1"),
      candidate("candidate-2", { pitchRangeSemitones: 7, pitchStdSemitones: 2, energyRangeDb: 10 })
    ])).toEqual(result);
  });
});
