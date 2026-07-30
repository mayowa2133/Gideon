import { describe, expect, it } from "vitest";
import {
  BENCHMARK_HOOK_CANDIDATES,
  auditBenchmarkAvatarMotion,
  benchmarkPropsFromManifest,
  createSolomonCreatorBenchmarkManifest,
  assertSolomonCreatorBenchmarkManifest
} from "./solomonCreatorBenchmark";

const source = "/private/approved/update-job-tracker.mp4";

describe("Solomon Creator Benchmark V1", () => {
  it("compiles a deterministic 300-frame authentic-proof manifest", () => {
    const first = createSolomonCreatorBenchmarkManifest(source);
    const second = createSolomonCreatorBenchmarkManifest(source);
    assertSolomonCreatorBenchmarkManifest(first);
    expect(benchmarkPropsFromManifest(first)).toEqual(benchmarkPropsFromManifest(second));
    expect(first.scenes[0]).toMatchObject({ from: 0, to: 54, narrativeFunction: "hook" });
    expect(first.scenes.at(-1)).toMatchObject({ to: 300, narrativeFunction: "cta" });
    expect(first.productProof).toMatchObject({ sourcePixelsAuthentic: true, fabricatedInterface: false });
  });

  it("contains five supported hooks and selects the highest-scoring concrete outcome", () => {
    expect(BENCHMARK_HOOK_CANDIDATES).toHaveLength(5);
    expect(BENCHMARK_HOOK_CANDIDATES.every(({ supported }) => supported)).toBe(true);
    expect(BENCHMARK_HOOK_CANDIDATES[0]!.score).toBe(Math.max(...BENCHMARK_HOOK_CANDIDATES.map(({ score }) => score)));
  });

  it("rejects static-avatar quality and changes at least two channels at every major beat", () => {
    const report = auditBenchmarkAvatarMotion(createSolomonCreatorBenchmarkManifest(source));
    expect(report.passed).toBe(true);
    expect(report.longestUnchangedFrames).toBeLessThanOrEqual(45);
    expect(report.majorBeatChannelChanges.every(({ changedChannels }) => changedChannels >= 2)).toBe(true);
  });

  it("rejects a fabricated proof and an undisclosed CTA", () => {
    const manifest = createSolomonCreatorBenchmarkManifest(source);
    expect(() => assertSolomonCreatorBenchmarkManifest({
      ...manifest,
      productProof: { ...manifest.productProof, fabricatedInterface: true as false }
    })).toThrow(/authentic product pixels/);
    expect(() => assertSolomonCreatorBenchmarkManifest({
      ...manifest,
      cta: { ...manifest.cta, availabilityImplied: true as false }
    })).toThrow(/CTA/);
  });
});
