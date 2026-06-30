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
});
