import path from "node:path";
import { runSolomonMaskedPresenterPilot } from "./solomonMaskedPresenterPilot";
import { ChatterboxNarrationProvider } from "./chatterboxNarrationProvider";
import { MacOsSayNarrationProvider } from "./macOsSayNarrationProvider";
import { NarrationProviderChain } from "./narrationProviderChain";

export function parseSolomonMaskedPresenterPilotArguments(argv: string[]): {
  captureRunRoot?: string;
  outputDir?: string;
  narration?: "samantha" | "chatterbox";
} {
  const parsed: { captureRunRoot?: string; outputDir?: string; narration?: "samantha" | "chatterbox" } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--" && index === 0) continue;
    if (argument === "--capture-run" || argument === "--output-dir" || argument === "--narration") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path.`);
      if (argument === "--capture-run") parsed.captureRunRoot = path.resolve(value);
      else if (argument === "--output-dir") parsed.outputDir = path.resolve(value);
      else {
        if (value !== "samantha" && value !== "chatterbox") throw new Error("--narration must be samantha or chatterbox.");
        parsed.narration = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unsupported Solomon masked-presenter argument: ${argument}`);
  }
  return parsed;
}

async function runCli(): Promise<void> {
  const parsed = parseSolomonMaskedPresenterPilotArguments(process.argv.slice(2));
  if (parsed.narration === "chatterbox" && !parsed.outputDir) {
    parsed.outputDir = path.resolve("tmp", "solomon-masked-presenter-chatterbox-v1");
  }
  const narrationProvider = parsed.narration === "chatterbox"
    ? new NarrationProviderChain(new ChatterboxNarrationProvider(), new MacOsSayNarrationProvider())
    : undefined;
  const report = await runSolomonMaskedPresenterPilot({ captureRunRoot: parsed.captureRunRoot, outputDir: parsed.outputDir, narrationProvider });
  process.stdout.write(`${JSON.stringify({ ok: true, ...report }, null, 2)}\n`);
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Solomon masked-presenter pilot failed."}\n`);
    process.exitCode = 1;
  });
}
