export interface EditorialFrameSignalSignature {
  y: number;
  u: number;
  v: number;
  saturation: number;
}

export interface EditorialPerceptualBoundaryInput {
  fromShotId: string;
  toShotId: string;
  boundaryMs: number;
  changedDimensions: string[];
  from: EditorialFrameSignalSignature;
  to: EditorialFrameSignalSignature;
}

export function analyzeEditorialPerceptualBoundaries(
  inputs: EditorialPerceptualBoundaryInput[],
  durationMs: number,
  windows: ReadonlyArray<readonly [number, number]>,
  signalThreshold = 0.012,
  structuralDimensionFallback = 4
): {
  meaningfulChangeCount: number;
  duplicateAdjacentPairs: string[];
  longestUnchangedCompositionMs: number;
  windows: Array<{ startMs: number; endMs: number; meaningfulChanges: number }>;
  boundaries: Array<EditorialPerceptualBoundaryInput & { normalizedSignalDistance: number; meaningful: boolean }>;
} {
  const boundaries = inputs.map((input) => {
    const normalizedSignalDistance = Math.sqrt(
      ((input.from.y - input.to.y) / 255) ** 2
      + ((input.from.u - input.to.u) / 255) ** 2
      + ((input.from.v - input.to.v) / 255) ** 2
      + ((input.from.saturation - input.to.saturation) / 255) ** 2
    );
    return {
      ...input,
      normalizedSignalDistance: Number(normalizedSignalDistance.toFixed(5)),
      meaningful: normalizedSignalDistance >= signalThreshold || input.changedDimensions.length >= structuralDimensionFallback
    };
  });
  const duplicateAdjacentPairs = boundaries
    .filter(({ meaningful }) => !meaningful)
    .map(({ fromShotId, toShotId }) => `${fromShotId}->${toShotId}`);
  let unchangedStartMs = 0;
  let longestUnchangedCompositionMs = 0;
  for (const boundary of boundaries) {
    if (boundary.meaningful) {
      longestUnchangedCompositionMs = Math.max(longestUnchangedCompositionMs, boundary.boundaryMs - unchangedStartMs);
      unchangedStartMs = boundary.boundaryMs;
    }
  }
  longestUnchangedCompositionMs = Math.max(longestUnchangedCompositionMs, durationMs - unchangedStartMs);
  return {
    meaningfulChangeCount: boundaries.filter(({ meaningful }) => meaningful).length,
    duplicateAdjacentPairs,
    longestUnchangedCompositionMs,
    windows: windows.map(([startMs, endMs]) => ({
      startMs,
      endMs,
      meaningfulChanges: boundaries.filter(({ boundaryMs, meaningful }) => boundaryMs >= startMs && boundaryMs < endMs && meaningful).length
    })),
    boundaries
  };
}
