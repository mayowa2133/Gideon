import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-github-live-promotion-settings.mjs");
const configScriptPath = path.join(process.cwd(), "scripts/check-live-promotion-github-config.mjs");

describe("GitHub live promotion repo settings check", () => {
  it("prints the repo settings verification plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run", "--repo", "example/Gideon"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("GitHub live promotion repo settings check dry-run:");
    expect(result.stdout).toContain("Repository: example/Gideon.");
    expect(result.stdout).toContain("secret and variable values are never read");
  });

  it("passes when all required GitHub Secrets and Variables are configured", async () => {
    const expected = await readExpectedConfiguration();
    const fakeGhDir = await writeFakeGh(expected.secrets, expected.vars);

    const result = await execFileAsync(process.execPath, [scriptPath, "--repo", "example/Gideon"], {
      cwd: process.cwd(),
      env: { PATH: `${fakeGhDir}${path.delimiter}${process.env.PATH ?? ""}` }
    });

    expect(result.stdout).toContain("GitHub live promotion repo settings check passed for example/Gideon");
    expect(result.stdout).toContain(`${expected.secrets.length} secrets`);
    expect(result.stdout).toContain(`${expected.vars.length} variables`);
  });

  it("reports missing Secret and Variable names without reading values", async () => {
    const expected = await readExpectedConfiguration();
    const fakeGhDir = await writeFakeGh(expected.secrets.slice(1), expected.vars.slice(1));

    await expect(
      execFileAsync(process.execPath, [scriptPath, "--repo", "example/Gideon"], {
        cwd: process.cwd(),
        env: { PATH: `${fakeGhDir}${path.delimiter}${process.env.PATH ?? ""}` }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(expected.secrets[0])
    });
  });
});

async function readExpectedConfiguration(): Promise<{ secrets: string[]; vars: string[] }> {
  const result = await execFileAsync(process.execPath, [configScriptPath, "--json"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "" }
  });
  return JSON.parse(result.stdout) as { secrets: string[]; vars: string[] };
}

async function writeFakeGh(secrets: string[], vars: string[]): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-fake-gh-settings-"));
  const ghPath = path.join(tempDir, "gh");
  await fs.writeFile(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "secret" && args[1] === "list") {
  process.stdout.write(JSON.stringify(${JSON.stringify(secrets.map((name) => ({ name })))}));
  process.exit(0);
}
if (args[0] === "variable" && args[1] === "list") {
  process.stdout.write(JSON.stringify(${JSON.stringify(vars.map((name) => ({ name })))}));
  process.exit(0);
}
console.error("unexpected gh args: " + args.join(" "));
process.exit(1);
`
  );
  await fs.chmod(ghPath, 0o755);
  return tempDir;
}
