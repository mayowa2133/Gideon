import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("macOS CI workflow", () => {
  const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/mac-build.yml"), "utf8");

  it("uses the documented Node runtime and lockfile install", () => {
    expect(workflow).toContain("node-version: 22");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
  });

  it("runs safety and production-readiness gates before packaging", () => {
    const lintIndex = workflow.indexOf("pnpm lint");
    const testIndex = workflow.indexOf("pnpm test");
    const buildIndex = workflow.indexOf("pnpm build");
    const packageIndex = workflow.indexOf("pnpm package:mac");

    expect(lintIndex).toBeGreaterThan(-1);
    expect(testIndex).toBeGreaterThan(lintIndex);
    expect(buildIndex).toBeGreaterThan(testIndex);
    expect(packageIndex).toBeGreaterThan(buildIndex);
    expect(workflow).toContain("pnpm production:check -- --dry-run");
    expect(workflow).toContain("pnpm production:promote:check -- --dry-run");
  });

  it("keeps live production promotion evidence behind manual dispatch", () => {
    expect(workflow).toContain("run_live_promotion:");
    expect(workflow).toContain("if: ${{ github.event_name == 'workflow_dispatch' && inputs.run_live_promotion }}");
    expect(workflow).toContain("pnpm production:live-env:check");
    expect(workflow).toContain("GIDEON_PRODUCTION_PROMOTION_EVIDENCE_PATH: tmp/production-promotion-evidence.json");
    expect(workflow).toContain("pnpm production:fixtures:materialize");
    expect(workflow).toContain("pnpm production:promote:check -- --live");
    expect(workflow).toContain("pnpm production:evidence:check -- --path tmp/production-promotion-evidence.json");
    expect(workflow).toContain("cp \"${GIDEON_RELEASE_RECEIPT_PATH:-release/release-receipt.json}\" tmp/release-receipt.json");
    expect(workflow).toContain("tmp/release-receipt.json");
    expect(workflow).toContain("Gideon-production-promotion-evidence");
    expect(workflow).toContain("secrets.GIDEON_STAGING_MCP_SESSION_COOKIE");
    expect(workflow).toContain("vars.GIDEON_STAGING_MCP_PROJECT_ID");
  });
});
