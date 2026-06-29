import { runProviderCanaries, type ProviderCanaryMode } from "./providerCanary";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const mode: ProviderCanaryMode | undefined = args.has("--live") ? "live" : args.has("--dry-run") ? "dry_run" : undefined;
  const report = await runProviderCanaries({ mode });
  const failed = report.results.filter((result) => result.status === "failed");

  console.log(JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Provider canary failed.");
  process.exitCode = 1;
});
