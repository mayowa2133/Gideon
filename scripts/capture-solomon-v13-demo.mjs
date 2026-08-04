import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { compileSolomonV13DemoContent } = require("../dist/main/shared/solomonDemoContentV13.js");
const fixture = compileSolomonV13DemoContent();
const output = path.join(root, "tmp", "solomon-creator-story-v13-performance", "capture");
const productRoot = process.env.SOLOMON_V13_PRODUCT_ROOT ?? path.join(root, "tmp", "solomon-v13-demo-product");
const baseUrl = process.env.SOLOMON_DEMO_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.SOLOMON_DEMO_API_URL ?? "http://127.0.0.1:8000";
const viewport = { width: 1440, height: 900 };
const banned = ["seeded fixture", "no model was called", "synthetic proof attached", "demo draft", "placeholder", "conceptual connection"];

await fs.mkdir(output, { recursive: true, mode: 0o700 });
await assertHealthy();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromium.executablePath()
});

const jobs = await apiJson("/api/jobs");
const productEngineer = jobs.items.find((item) => item.title === fixture.opportunity.title && item.company_name === fixture.opportunity.company);
const implementation = jobs.items.find((item) => item.title === "Implementation Specialist");
if (!productEngineer) throw new Error("V13 capture requires the Product Engineer / Northstar Labs fixture.");

const captures = [];
try {
  await setStage(productEngineer.id, "applied");
  if (implementation) await setStage(implementation.id, "interested");

  captures.push(await capture("tracker_before", async (page, evidence) => {
    await page.goto(`${baseUrl}/tracker`);
    await page.getByRole("heading", { name: /Application Tracker/i }).waitFor();
    await hold(page, 900);
    const card = page.getByRole("button", { name: /Product Engineer Northstar Labs/i });
    await recordEvidence(evidence, "opportunity-before", card, "button", { beforeState: "Applied" });
    await card.hover();
    await hold(page, 900);
    await card.click();
    await hold(page, 1800);
    await recordEvidence(evidence, "applied-control", page.getByRole("button", { name: "Applied", exact: true }).last(), "button", { beforeState: "Applied" });
    await hold(page, 3500);
  }));

  await setStage(productEngineer.id, "applied");
  captures.push(await capture("tracker_after", async (page, evidence) => {
    await page.goto(`${baseUrl}/tracker`);
    await page.getByRole("heading", { name: /Application Tracker/i }).waitFor();
    await hold(page, 800);
    const card = page.getByRole("button", { name: /Product Engineer Northstar Labs/i });
    await recordEvidence(evidence, "opportunity-trigger", card, "button", { beforeState: "Applied" });
    await card.click();
    await hold(page, 900);
    const target = page.getByRole("button", { name: "Interviewing", exact: true }).last();
    const click = await center(target);
    await recordEvidence(evidence, "interviewing-control", target, "button", { beforeState: "Applied", afterState: "Interviewing", click });
    await target.hover();
    await hold(page, 700);
    await target.click();
    await hold(page, 1800);
    const result = page.getByRole("button", { name: /Product Engineer Northstar Labs/i });
    await recordEvidence(evidence, "interviewing-result", result, "button", { afterState: "Interviewing" });
    await hold(page, 3200);
  }));

  captures.push(await capture("opportunity", async (page, evidence) => {
    await page.goto(`${baseUrl}/jobs`);
    await page.getByRole("heading", { name: "Jobs" }).waitFor();
    await hold(page, 900);
    const title = page.getByText(fixture.opportunity.title, { exact: true }).first();
    await recordEvidence(evidence, "opportunity-card", title, "text", { afterState: fixture.opportunity.resultStage });
    await title.hover();
    await hold(page, 800);
    await title.click();
    await hold(page, 1800);
    await recordEvidence(evidence, "opportunity-title", page.getByRole("heading", { name: fixture.opportunity.title, exact: true }).first(), "heading");
    await recordEvidence(evidence, "opportunity-company", page.getByText(fixture.opportunity.company, { exact: true }).last(), "text");
    await page.mouse.wheel(0, 220);
    await hold(page, 3300);
  }));

  captures.push(await capture("contact", async (page, evidence) => {
    await page.goto(`${baseUrl}/people`);
    await page.getByRole("heading", { name: "People" }).waitFor();
    const filter = page.getByRole("textbox", { name: "Filter saved contacts by company" });
    await filter.fill(fixture.contact.company);
    await hold(page, 900);
    const name = page.getByText(fixture.contact.name, { exact: true }).first();
    await name.scrollIntoViewIfNeeded();
    await recordEvidence(evidence, "contact-name", name, "text");
    await recordEvidence(evidence, "contact-role", page.getByText(fixture.contact.role, { exact: true }).first(), "text");
    await recordEvidence(evidence, "contact-company", page.getByRole("heading", { name: fixture.contact.company }).last(), "heading");
    await recordEvidence(evidence, "contact-reason-role", page.getByText("Recruiting title at the target company.", { exact: true }).first(), "definition");
    await recordEvidence(evidence, "contact-reason-company", page.getByText("Current role at Northstar Labs.", { exact: true }).first(), "definition");
    await name.hover();
    await hold(page, 1400);
    await page.mouse.wheel(0, 240);
    await hold(page, 3700);
  }));

  captures.push(await capture("outreach_blank", async (page, evidence) => {
    await page.goto(`${baseUrl}/messages`);
    await page.getByRole("heading", { name: "Messages" }).waitFor();
    await hold(page, 900);
    await recordEvidence(evidence, "blank-person", page.getByRole("combobox", { name: "Person" }), "combobox", { beforeState: "Select a person" });
    await recordEvidence(evidence, "blank-job", page.getByRole("combobox", { name: "Target Job (Optional)" }), "combobox", { beforeState: "No saved job context" });
    await recordEvidence(evidence, "blank-generate", page.getByRole("button", { name: "Generate Draft" }), "button", { beforeState: "disabled" });
    await page.getByRole("combobox", { name: "Person" }).hover();
    await hold(page, 5100);
  }));

  captures.push(await capture("outreach_complete", async (page, evidence) => {
    await page.goto(`${baseUrl}/messages`);
    await page.getByRole("heading", { name: "Messages" }).waitFor();
    await hold(page, 700);
    await page.getByText(fixture.contact.name, { exact: true }).last().click();
    await hold(page, 900);
    await recordEvidence(evidence, "draft-status", page.getByText("DRAFT — NOT SENT", { exact: true }), "status", { afterState: "unsent" });
    await recordEvidence(evidence, "draft-subject", page.getByText(fixture.message.subject, { exact: true }).last(), "text");
    await recordEvidence(evidence, "draft-message", page.getByText(/Hi Avery — I’m reaching out about the Product Engineer role/, { exact: false }).first(), "text");
    const edit = page.getByRole("button", { name: "Edit", exact: true });
    await edit.hover();
    await hold(page, 500);
    await edit.click();
    await hold(page, 700);
    const textarea = page.locator("textarea").last();
    const original = await textarea.inputValue();
    const start = original.indexOf("perspective");
    if (start < 0) throw new Error("Grounded message does not contain the expected editable word.");
    await textarea.evaluate((element, range) => element.setSelectionRange(range.start, range.end), { start, end: start + "perspective".length });
    await textarea.type("insight", { delay: 95 });
    await hold(page, 900);
    const save = page.getByRole("button", { name: "Save Edit", exact: true });
    const click = await center(save);
    await recordEvidence(evidence, "save-edit", save, "button", { beforeState: "editing", afterState: "saved and unsent", click });
    await recordEvidence(evidence, "cancel", page.getByRole("button", { name: "Cancel", exact: true }), "button");
    await save.click();
    await hold(page, 3000);
    await recordEvidence(evidence, "draft-result", page.getByText(/I’d value your insight/, { exact: false }).first(), "text", { afterState: "saved and unsent" });
  }));
} finally {
  await browser.close();
}

const sourceRevision = execFileSync("git", ["-C", productRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const fixtureFileHashes = Object.fromEntries(await Promise.all([
  "backend/scripts/demo_reset.py",
  "frontend/src/components/AppLayout.tsx"
].map(async (relativePath) => [relativePath, await sha256(path.join(productRoot, relativePath))])));
const receipt = {
  schemaVersion: "10.1",
  environment: "fail_closed_fictional_solomon_v13",
  product: "Solomon",
  sourceRevision,
  fixtureVersion: fixture.version,
  fixtureFileHashes,
  publicReleaseApproved: false,
  externalProvidersDisabled: true,
  syntheticIdentitiesOnly: true,
  realPeopleUsed: false,
  externalActionsPerformed: false,
  disclosure: fixture.disclosure,
  viewport,
  captures
};
if (captures.some(({ failure, bannedPrimaryMatches, disclosureCount }) => failure || bannedPrimaryMatches.length > 0 || disclosureCount !== 1)) {
  throw new Error(`V13 capture failed closed: ${JSON.stringify(receipt, null, 2)}`);
}
await fs.writeFile(path.join(output, "capture-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);

async function capture(id, perform) {
  const context = await browser.newContext({ viewport, recordVideo: { dir: output, size: viewport }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.addStyleTag({ content: "*{scroll-behavior:smooth!important} body{cursor:default!important}" });
  const video = page.video();
  const domEvidence = [];
  let failure;
  try { await perform(page, domEvidence); } catch (error) { failure = error instanceof Error ? error.message : String(error); }
  const finalUrl = page.url();
  const visibleText = (await page.locator("body").innerText().catch(() => "")).slice(0, 30_000);
  await page.screenshot({ path: path.join(output, `${id}-final.png`), fullPage: false });
  await context.close();
  const rawPath = await video.path();
  const destination = path.join(output, `${id}.webm`);
  await fs.rename(rawPath, destination);
  const normalized = visibleText.toLowerCase();
  return {
    id,
    path: destination,
    sha256: await sha256(destination),
    finalUrl,
    failure: failure ?? null,
    domEvidence,
    visibleText,
    bannedPrimaryMatches: banned.filter((value) => normalized.includes(value)),
    disclosureCount: visibleText.match(/demo\s+data/gi)?.length ?? 0,
    requiredTextObserved: requiredText(id).filter((value) => normalized.includes(value.toLowerCase()))
  };
}

async function recordEvidence(collection, elementId, locator, role, extra = {}) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Missing DOM box for ${elementId}.`);
  const text = ((await locator.innerText().catch(() => "")) || (await locator.getAttribute("aria-label")) || "").trim();
  collection.push({ elementId, role, text, box: roundBox(box), ...extra });
}

function roundBox(box) { return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100])); }
async function center(locator) { const box = await locator.boundingBox(); if (!box) throw new Error("Click target has no box."); return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }; }
async function setStage(id, stage) { await apiJson(`/api/jobs/${id}/stage`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage }) }); }
async function apiJson(route, options) { const response = await fetch(`${apiUrl}${route}`, options); if (!response.ok) throw new Error(`${route} failed with ${response.status}`); return response.json(); }
async function assertHealthy() { await apiJson("/api/health"); const response = await fetch(baseUrl); if (!response.ok) throw new Error(`Solomon demo frontend failed with ${response.status}`); }
function hold(page, milliseconds) { return page.waitForTimeout(milliseconds); }
function requiredText(id) {
  if (id === "tracker_before") return ["Product Engineer", "Northstar Labs", "Applied"];
  if (id === "tracker_after") return ["Product Engineer", "Northstar Labs", "Interviewing"];
  if (id === "opportunity") return ["Product Engineer", "Northstar Labs"];
  if (id === "contact") return ["Avery Chen", "Senior Technical Recruiter", "Northstar Labs", "Recruiting title at the target company", "Current role at Northstar Labs"];
  if (id === "outreach_blank") return ["New Draft", "Person", "Target Job"];
  return ["Avery Chen", "Product Engineer at Northstar Labs", "DRAFT — NOT SENT", "technical hiring", "insight"];
}
async function sha256(target) { return createHash("sha256").update(await fs.readFile(target)).digest("hex"); }
