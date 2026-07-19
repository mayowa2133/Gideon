import path from "node:path";
import { runCreatorVideoBenchmark } from "./creatorVideoBenchmark";

async function main(): Promise<void> {
  const outputFlag = process.argv.indexOf("--output-dir");
  const supplied = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined;
  const outputDir = supplied ? path.resolve(supplied) : path.resolve(process.cwd(), "tmp", "creator-video-benchmark");
  const report = await runCreatorVideoBenchmark(outputDir);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
