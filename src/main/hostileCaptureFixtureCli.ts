import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { permittedFlows, prohibitedFlows, runHostileCaptureMatrix } from "./hostileCaptureFixture";

async function main(): Promise<void> {
  const executablePath = findBrowserExecutable();
  if (!executablePath) throw new Error("Hostile capture matrix requires a local Chromium executable.");
  const root = path.join(process.cwd(), "tmp", "capture-hostile-fixture");
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const report = await runHostileCaptureMatrix({ executablePath, outputDir: path.join(root, "browser-work"), now: () => new Date().toISOString(), onProgress: (flowId, stage) => console.error(`[hostile-capture] ${flowId} ${stage}`) });
  const reportPath = path.join(root, "report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  const permittedOk = report.permitted.length === permittedFlows().length && report.permitted.every((item) => item.status === "verified");
  const expected = new Map(prohibitedFlows().map((item) => [item.flow.id, item.expectedCode]));
  const blockedOk = report.prohibited.length === expected.size && report.prohibited.every((item) => expected.get(item.flowId) === item.blockerCode);
  const sideEffectsOk = Object.values(report.sideEffects).every((count) => count === 0);
  const result = { ok: permittedOk && blockedOk && sideEffectsOk, reportPath, permitted: report.permitted.length, prohibited: report.prohibited.length, sideEffects: Object.values(report.sideEffects).reduce((sum, count) => sum + count, 0) };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

function findBrowserExecutable(): string | undefined {
  const candidates = [process.env.GIDEON_CAPTURE_BROWSER_EXECUTABLE, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fsSync.existsSync(candidate));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : "Hostile capture matrix failed."); process.exitCode = 1; });
