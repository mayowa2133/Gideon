import { describe, expect, it } from "vitest";
import { selectEditorialNarrationCandidate, type EditorialNarrationCandidateMetrics } from "./creatorEditorialNarrationSelection";

function candidate(id: string, overrides: Partial<EditorialNarrationCandidateMetrics> = {}): EditorialNarrationCandidateMetrics {
  return {
    id,
    seed: 71_624 + Number(id.at(-1) ?? 0),
    exactApprovedWordSequence: true,
    minimumWordProbability: 0.82,
    meanWordProbability: 0.97,
    tempoCorrection: 1.01,
    maximumGapMs: 80,
    integratedRmsDb: -18,
    peakDb: -3,
    durationMs: 35_000,
    ...overrides
  };
}

describe("creator editorial narration candidate selection", () => {
  it("deterministically chooses the strongest exact candidate", () => {
    const selection = selectEditorialNarrationCandidate([
      candidate("candidate-1", { tempoCorrection: 1.06, minimumWordProbability: 0.72 }),
      candidate("candidate-2", { tempoCorrection: 1.01, minimumWordProbability: 0.88 }),
      candidate("candidate-3", { tempoCorrection: 1.00, minimumWordProbability: 0.92 })
    ]);
    expect(selection.selectedCandidateId).toBe("candidate-3");
    expect(selection.candidates).toHaveLength(3);
  });

  it("rejects incorrect words, aggressive tempo correction, and long gaps", () => {
    const selection = selectEditorialNarrationCandidate([
      candidate("candidate-1", { exactApprovedWordSequence: false }),
      candidate("candidate-2", { tempoCorrection: 1.12 }),
      candidate("candidate-3"),
      candidate("candidate-4", { maximumGapMs: 700 })
    ]);
    expect(selection.selectedCandidateId).toBe("candidate-3");
    expect(selection.candidates.find(({ id }) => id === "candidate-1")?.rejectionReasons).toContain("word_sequence");
    expect(selection.candidates.find(({ id }) => id === "candidate-2")?.rejectionReasons).toContain("tempo_correction");
    expect(selection.candidates.find(({ id }) => id === "candidate-4")?.rejectionReasons).toContain("narration_gap");
  });

  it("fails closed when every candidate is invalid", () => {
    expect(() => selectEditorialNarrationCandidate([
      candidate("candidate-1", { exactApprovedWordSequence: false }),
      candidate("candidate-2", { minimumWordProbability: 0.2 })
    ])).toThrow(/No editorial narration candidate/i);
  });

  it("supports a bounded 700 ms policy for naturally paused reference-rhythm narration", () => {
    const selection = selectEditorialNarrationCandidate([
      candidate("candidate-1", { maximumGapMs: 640 }),
      candidate("candidate-2", { maximumGapMs: 780 })
    ], { maximumGapMs: 700 });
    expect(selection.selectedCandidateId).toBe("candidate-1");
    expect(selection.policy.maximumGapMs).toBe(700);
    expect(selection.candidates.find(({ id }) => id === "candidate-2")?.rejectionReasons).toContain("narration_gap");
  });
});
