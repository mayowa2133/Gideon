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
  "src/main/githubLivePromotionRunner.test.ts"
];

export default defineConfig({
  test: {
    exclude,
    projects: [
      { test: { name: "unit", exclude: [...exclude, ...resourceBound] } },
      {
        test: {
          name: "capture-integration",
          include: resourceBound,
          fileParallelism: false,
          testTimeout: 180_000,
          hookTimeout: 120_000
        }
      }
    ]
  }
});
