import fs from "node:fs/promises";
import path from "node:path";
import { generateCaptureOpenApi } from "./captureOpenApi";

export async function writeCaptureOpenApi(outputPath = path.resolve("docs/openapi/capture-api.json")): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(generateCaptureOpenApi(), null, 2)}\n`, { mode: 0o644 });
  return outputPath;
}

if (require.main === module) {
  void writeCaptureOpenApi(process.argv[2]).then((outputPath) => process.stdout.write(`Wrote ${outputPath}\n`));
}
