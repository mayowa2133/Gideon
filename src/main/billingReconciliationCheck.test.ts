import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-billing-reconciliation.mjs");

describe("billing reconciliation check", () => {
  it("prints the reconciliation plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Billing reconciliation check dry-run:");
    expect(result.stdout).toContain("Require GIDEON_BILLING_PROVIDER=stripe");
    expect(result.stdout).toContain("Detect duplicate active subscriptions");
  });

  it("accepts a sanitized Stripe subscription fixture with mapped plans", async () => {
    const fixturePath = await writeFixture();

    const result = await runCheck(fixturePath);

    expect(result.stdout).toContain("Billing reconciliation check passed for 2 subscriptions");
  });

  it("rejects subscriptions without Gideon workspace metadata", async () => {
    const fixturePath = await writeFixture({
      subscriptions: [
        {
          id: "sub_missing_workspace",
          customer: "cus_1",
          status: "active",
          current_period_end: 1_777_000_000,
          metadata: {},
          items: { data: [{ price: { id: "price_team" } }] }
        }
      ]
    });

    await expect(runCheck(fixturePath)).rejects.toMatchObject({
      stderr: expect.stringContaining("metadata must include gideonWorkspaceId or workspaceId")
    });
  });

  it("rejects duplicate non-terminal subscriptions for one workspace", async () => {
    const fixturePath = await writeFixture({
      subscriptions: [
        subscriptionFixture({ id: "sub_1", workspaceId: "workspace-1" }),
        subscriptionFixture({ id: "sub_2", workspaceId: "workspace-1" })
      ]
    });

    await expect(runCheck(fixturePath)).rejects.toMatchObject({
      stderr: expect.stringContaining("multiple non-terminal Stripe subscriptions")
    });
  });
});

async function runCheck(fixturePath: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [scriptPath, "--fixture-path", fixturePath], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH ?? "",
      GIDEON_BILLING_PROVIDER: "stripe",
      STRIPE_WEBHOOK_SECRET: "whsec_fixture",
      GIDEON_STRIPE_STARTER_PRICE_ID: "price_starter",
      GIDEON_STRIPE_TEAM_PRICE_ID: "price_team",
      GIDEON_STRIPE_ENTERPRISE_PRICE_ID: "price_enterprise"
    }
  });
}

async function writeFixture(input: { subscriptions?: unknown[] } = {}): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-billing-reconciliation-"));
  const fixturePath = path.join(tempDir, "subscriptions.json");
  await fs.writeFile(
    fixturePath,
    `${JSON.stringify({ subscriptions: input.subscriptions ?? [subscriptionFixture(), subscriptionFixture({ id: "sub_2", workspaceId: "workspace-2", priceId: "price_starter" })] }, null, 2)}\n`
  );
  return fixturePath;
}

function subscriptionFixture(
  input: { id?: string; workspaceId?: string; priceId?: string; status?: string } = {}
) {
  return {
    id: input.id ?? "sub_1",
    customer: "cus_1",
    status: input.status ?? "active",
    current_period_end: 1_777_000_000,
    metadata: { gideonWorkspaceId: input.workspaceId ?? "workspace-1" },
    items: { data: [{ price: { id: input.priceId ?? "price_team" } }] }
  };
}
