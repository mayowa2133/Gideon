import path from "node:path";
import { runSolomonMaskedPresenterPilot } from "./solomonMaskedPresenterPilot";

export function parseSolomonMaskedPresenterPilotArguments(argv: string[]): {
  captureRunRoot?: string;
  outputDir?: string;
} {
  const parsed: { captureRunRoot?: string; outputDir?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--" && index === 0) continue;
    if (argument === "--capture-run" || argument === "--output-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path.`);
      if (argument === "--capture-run") parsed.captureRunRoot = path.resolve(value);
      else parsed.outputDir = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported Solomon masked-presenter argument: ${argument}`);
  }
  return parsed;
}

async function runCli(): Promise<void> {
  const report = await runSolomonMaskedPresenterPilot(parseSolomonMaskedPresenterPilotArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ ok: true, ...report }, null, 2)}\n`);
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Solomon masked-presenter pilot failed."}\n`);
    process.exitCode = 1;
  });
}
