import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("production readiness audit", () => {
  const audit = readFileSync(path.join(process.cwd(), "docs/production-readiness-audit.md"), "utf8");

  it("tracks the current README completion estimate", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("Current engineering estimate: **99.99999998% complete**");
    expect(audit).toContain("Current engineering estimate: **99.99999998% complete**");
  });

  it("maps the original product gaps to evidence and remaining work", () => {
    for (const requiredGap of [
      "Real AI/LLM semantic analysis",
      "Transcription / ASR from recordings",
      "OCR / UI understanding",
      "Cloud auth, workspaces, teams, RBAC, billing, quotas",
      "Direct-to-cloud uploads and private object storage",
      "Async queues and hosted workers",
      "Provider-backed TTS",
      "Stage-level retry/cancel jobs",
      "Codex/Claude Code MCP control without Gideon API keys",
      "Social posting, scheduling, analytics",
      "Avatar generation, voice cloning"
    ]) {
      expect(audit).toContain(requiredGap);
    }
  });

  it("keeps the agent-control requirement explicit and no-key", () => {
    expect(audit).toContain("The agent supplies model reasoning; Gideon does not require LLM provider API keys");
    expect(audit).toContain("Palmier-style");
  });

  it("names the remaining production blockers", () => {
    for (const blocker of [
      "Production database-backed hosted persistence",
      "Managed Redis/BullMQ operations",
      "Production object storage credentials",
      "Live provider canary execution",
      "Signed and notarized macOS release artifact",
      "End-to-end staging smoke",
      "pnpm staging:check -- --strict",
      "pnpm staging:smoke -- --live",
      "pnpm staging:mcp:smoke -- --live --require-metric-export",
      "pnpm production:promote:check -- --live",
      "pnpm production:db:check",
      "pnpm production:queue:check",
      "pnpm production:observability:check",
      "pnpm production:storage:check",
      "pnpm production:provider-canary-report:check",
      "pnpm production:release-receipt:check",
      "pnpm production:check"
    ]) {
      expect(audit).toContain(blocker);
    }
  });
});
