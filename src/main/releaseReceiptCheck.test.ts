import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-release-receipt.mjs";

describe("production release receipt check", () => {
  it("prints the release receipt plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production release receipt check dry-run:");
    expect(result.stdout).toContain("accepted notarization");
    expect(result.stdout).toContain("Gatekeeper assessment");
    expect(result.stdout).toContain("artifact SHA-256");
  });

  it("passes for a safe notarized release receipt matching generated artifacts", async () => {
    const releaseDir = await createReleaseFixture();
    const receiptPath = path.join(releaseDir, "release-receipt.json");
    await writeReceipt(releaseDir, receiptPath);

    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? "",
        GIDEON_RELEASE_DIR: releaseDir,
        GIDEON_RELEASE_RECEIPT_PATH: receiptPath
      }
    });

    expect(result.stdout).toContain("Production release receipt check passed");
  });

  it("rejects missing notarization and install smoke evidence", async () => {
    const releaseDir = await createReleaseFixture();
    const receiptPath = path.join(releaseDir, "release-receipt.json");
    await writeReceipt(releaseDir, receiptPath, {
      notarization: { status: "invalid", requestId: "abc", completedAt: "not-a-date" },
      installSmoke: { result: "failed", checkedAt: new Date().toISOString() }
    });

    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_RELEASE_DIR: releaseDir,
          GIDEON_RELEASE_RECEIPT_PATH: receiptPath
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Release receipt notarization.status must be accepted")
    });
  });

  it("rejects artifact hash drift and secret-like material", async () => {
    const releaseDir = await createReleaseFixture();
    const receiptPath = path.join(releaseDir, "release-receipt.json");
    const artifacts = await artifactEntries(releaseDir);
    artifacts[0] = { ...artifacts[0], sha256: "bad", size: 1 };
    await writeReceipt(releaseDir, receiptPath, {
      artifacts,
      notes: "APPLE_APP_SPECIFIC_PASSWORD=secret"
    });

    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_RELEASE_DIR: releaseDir,
          GIDEON_RELEASE_RECEIPT_PATH: receiptPath
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Release receipt sha256 does not match Gideon-0.1.0-arm64.dmg")
    });
  });
});

async function createReleaseFixture(): Promise<string> {
  const releaseDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-release-receipt-"));
  await fs.writeFile(path.join(releaseDir, "Gideon-0.1.0-arm64.dmg"), "fake-dmg");
  await fs.writeFile(path.join(releaseDir, "Gideon-0.1.0-arm64-mac.zip"), "fake-zip");
  await fs.writeFile(path.join(releaseDir, "latest-mac.yml"), "version: 0.1.0\n");
  await fs.writeFile(path.join(releaseDir, "provenance.json"), JSON.stringify({ schemaVersion: 1, product: "Gideon" }));
  return releaseDir;
}

async function writeReceipt(releaseDir: string, receiptPath: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const now = new Date().toISOString();
  const receipt = {
    schemaVersion: 1,
    product: "Gideon",
    version: "0.1.0",
    channel: "production",
    generatedAt: now,
    source: {
      gitCommit: "0123456789abcdef0123456789abcdef01234567",
      workflowRunId: "123456789"
    },
    artifacts: await artifactEntries(releaseDir),
    notarization: {
      status: "accepted",
      requestId: "notary-123456",
      completedAt: now
    },
    stapling: {
      dmg: "accepted"
    },
    gatekeeper: {
      spctlAssessment: "accepted",
      checkedAt: now
    },
    installSmoke: {
      result: "passed",
      checkedAt: now
    },
    ...overrides
  };
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

async function artifactEntries(releaseDir: string): Promise<Array<{ fileName: string; size: number; sha256: string }>> {
  const fileNames = ["Gideon-0.1.0-arm64.dmg", "Gideon-0.1.0-arm64-mac.zip", "latest-mac.yml", "provenance.json"];
  const entries = [];
  for (const fileName of fileNames) {
    const bytes = await fs.readFile(path.join(releaseDir, fileName));
    entries.push({
      fileName,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  return entries;
}
