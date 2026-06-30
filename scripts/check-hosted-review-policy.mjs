#!/usr/bin/env node

import fs from "node:fs";

const errors = [];

const packageJson = read("package.json");
const hostedApi = read("src/main/hostedApi.ts");
const hostedApiTests = read("src/main/hostedApi.test.ts");
const mcpServer = read("src/mcp/server.ts");
const mcpTests = read("src/mcp/server.test.ts");
const apiContract = read("docs/api-contract.md");
const mcpDocs = read("docs/mcp-agent-control.md");

requireContains(packageJson, '"hosted:review:check": "node scripts/check-hosted-review-policy.mjs"', "package.json must expose hosted:review:check.");

requireContains(hostedApi, "requiredRevisionPrecondition", "Hosted script/moment edits must require a revision precondition.");
requireContains(hostedApi, '"precondition_required"', "Hosted edit API must return a typed missing-precondition error.");
requireContains(hostedApi, '"revision_conflict"', "Hosted edit API must return a typed revision-conflict error.");
requireContains(hostedApi, "revision: script.updatedAt", "Hosted MCP context must expose script revisions.");
requireContains(hostedApi, "revision: project.updatedAt", "Hosted MCP context must expose project/moment revisions.");

requireContains(hostedApiTests, "precondition_required", "Hosted API tests must cover missing edit preconditions.");
requireContains(hostedApiTests, "revision_conflict", "Hosted API tests must cover stale edit conflicts.");

requireContains(mcpServer, "shouldRetryHostedResponse", "Hosted MCP client must centralize transient response retry policy.");
requireContains(mcpServer, "status === 429", "Hosted MCP retry policy must retry rate-limit responses.");
requireContains(mcpServer, "status === 503", "Hosted MCP retry policy must retry service-unavailable responses.");
requireContains(mcpServer, "!/csrf|forbidden|unauthorized|revision|precondition|required|validation|not found/i", "Hosted MCP retry policy must not retry auth, validation, precondition, or revision errors.");
requireContains(mcpServer, "hostedRetryDelayMs", "Hosted MCP retry policy must support bounded retry delay tuning.");

requireContains(mcpTests, "retries transient hosted API failures only", "MCP tests must prove transient hosted retry behavior.");
requireContains(mcpTests, "does not retry hosted revision conflicts", "MCP tests must prove stale edit conflicts are not retried.");

requireContains(apiContract, "GET `/projects/{projectId}/mcp-context`", "API contract must document hosted MCP context.");
requireContains(apiContract, "`If-Match` or body `revision` is required", "API contract must document hosted edit revision preconditions.");
requireContains(apiContract, "428 missing precondition", "API contract must document missing-precondition errors.");
requireContains(mcpDocs, "Stale edits fail with `409 revision_conflict`", "MCP docs must explain stale hosted edit behavior.");

if (errors.length > 0) {
  console.error("Hosted review policy check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Hosted review policy check passed.");

function read(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    errors.push(`Could not read ${filePath}: ${error instanceof Error ? error.message : "unknown error"}.`);
    return "";
  }
}

function requireContains(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    errors.push(message);
  }
}
