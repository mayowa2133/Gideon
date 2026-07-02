import { runProviderCanaries, type ProviderCanaryMode } from "./providerCanary";
import fs from "node:fs/promises";
import path from "node:path";

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = new Set(rawArgs);
  const mode: ProviderCanaryMode | undefined = args.has("--live") ? "live" : args.has("--dry-run") ? "dry_run" : undefined;
  const report = await runProviderCanaries({ mode });
  const failed = report.results.filter((result) => result.status === "failed");
  const reportPath = reportPathFromArgs(rawArgs) ?? process.env.GIDEON_PROVIDER_CANARY_REPORT_PATH?.trim();

  console.log(JSON.stringify(report, null, 2));
  if (reportPath) {
    await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
    await fs.writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function reportPathFromArgs(args: string[]): string | null {
  const index = args.indexOf("--report-path");
  if (index === -1) {
    return null;
  }
  const value = args[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new Error("--report-path requires a file path.");
  }
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Provider canary failed.");
  process.exitCode = 1;
});
