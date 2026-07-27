import fs from "node:fs/promises";
import path from "node:path";
import { ChatterboxNarrationProvider } from "./chatterboxNarrationProvider";

async function run(): Promise<void> {
  const root = path.resolve(process.env.GIDEON_CHATTERBOX_CANARY_DIR ?? path.join(process.cwd(), "tmp", "chatterbox-runtime", "reports", "node-canary"));
  const provider = new ChatterboxNarrationProvider({ allowDownload: process.argv.includes("--allow-download") });
  const result = await provider.synthesize({
    outputDir: root,
    beats: [{ id: "canary", approvedText: "Solomon brings your job search into one clear, confident workflow.", startMs: 0, endMs: 7_000, energy: "medium" }],
    language: "en",
    voice: { mode: "model_default" },
    seed: 71623
  });
  await fs.writeFile(path.join(root, "canary-report.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ ok: true, outputPath: result.beats[0]?.outputPath, provenance: result.provenance }, null, 2)}\n`);
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Chatterbox canary failed."}\n`);
  process.exitCode = 1;
});
