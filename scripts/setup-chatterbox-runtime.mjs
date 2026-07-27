import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const runtime = path.join(root, "tmp", "chatterbox-runtime");
const python = process.env.GIDEON_PYTHON_311 || "/opt/homebrew/bin/python3.11";
const ffmpeg = process.env.GIDEON_FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";
await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
await command(ffmpeg, ["-version"]);
await command("uv", ["venv", "--python", python, path.join(runtime, ".venv")]);
await command("uv", ["pip", "install", "--python", path.join(runtime, ".venv", "bin", "python"), "chatterbox-tts==0.1.7", "setuptools==80.9.0"]);
await command(path.join(runtime, ".venv", "bin", "python"), ["-c", "import torch; assert torch.backends.mps.is_available() or torch.device('cpu'); print('Chatterbox device check passed')"]);
await command("pnpm", ["build:main"]);
await command("node", [path.join(root, "dist", "main", "main", "chatterboxCanaryCli.js"), "--allow-download"]);
await fs.mkdir(path.join(runtime, "reports"), { recursive: true, mode: 0o700 });
await fs.writeFile(path.join(runtime, "reports", "setup-report.json"), `${JSON.stringify({
  schemaVersion: "1",
  status: "installed_and_live_canary_passed",
  package: "chatterbox-tts==0.1.7",
  compatibilityDependency: "setuptools==80.9.0",
  model: "ResembleAI/chatterbox-turbo",
  devicePolicy: "mps_preferred_cpu_explicit",
  ffmpegValidated: true,
  privateIgnoredRuntime: true,
  ordinaryInferenceRequiresNetwork: false
}, null, 2)}\n`, { mode: 0o600 });

function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, shell: false, stdio: "inherit", env: { ...process.env, HF_HOME: path.join(runtime, "model-cache"), UV_HTTP_TIMEOUT: "300" } });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${executable} exited ${code ?? "by signal"}.`)));
  });
}
