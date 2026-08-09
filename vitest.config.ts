import { defineConfig } from "vitest/config";

const exclude = ["**/node_modules/**", "**/dist/**", "**/.next/**", "apps/web/e2e/**", "**/test-results/**"];

// These files launch a real browser and shell out to ffmpeg. Vitest runs test
// files in parallel across workers, so all of them could start at once alongside
// ~250 unit files -- each one then competing for the same cores it needs to
// finish inside its own timeout. That is what made them fail intermittently
// under load while passing in isolation: `capturePilot` timed out at 90s with
// eight busy cores and completed comfortably on an idle machine.
//
// Splitting them into their own serial project keeps the fast suite parallel
// while these run one at a time, so a slow machine makes them slower rather than
// flaky. Add a file here when it drives a browser, a renderer, or ffmpeg.
const resourceBound = [
  "src/main/capturePilot.integration.test.ts",
  "src/main/playwrightCaptureExecutor.integration.test.ts",
  "src/main/captureLoginAdapters.integration.test.ts",
  "src/main/captureMasking.integration.test.ts",
  "src/main/captureInventoryCrawler.integration.test.ts",
  "src/main/hostileCaptureFixture.test.ts",
  "src/main/githubLivePromotionRunner.test.ts",
  // Added after it failed in a full suite run and passed in isolation in 835ms:
  // it is not slow, it spawns ffmpeg, and spawning under parallel load is what
  // fails. This list is empirical -- a file joins it when it demonstrates
  // contention sensitivity, not because it mentions ffmpeg. Nineteen other test
  // files reference ffmpeg or chromium and are fine, so serialising on the
  // mention would cost every future run for nothing.
  "src/main/captureRunWorker.test.ts"
];

export default defineConfig({
  test: {
    exclude,
    projects: [
      { test: { name: "unit", exclude: [...exclude, ...resourceBound], sequence: { groupOrder: 0 } } },
      {
        test: {
          name: "capture-integration",
          include: resourceBound,
          fileParallelism: false,
          // Runs after the unit project rather than alongside it. Serialising
          // these files against each other was not enough: vitest runs projects
          // concurrently, so a browser+ffmpeg file still competed with ~250 unit
          // files for the cores it needs inside its own timeout. capturePilot
          // passed in isolation and failed in the full suite for exactly that.
          sequence: { groupOrder: 1 },
          testTimeout: 180_000,
          hookTimeout: 120_000
        }
      }
    ]
  }
});
