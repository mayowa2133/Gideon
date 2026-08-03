import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "tmp", "solomon-creator-story-v9-mascot", "capture");
const baseUrl = process.env.SOLOMON_DEMO_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.SOLOMON_DEMO_API_URL ?? "http://127.0.0.1:8000";
const viewport = { width: 1440, height: 900 };
await fs.mkdir(output, { recursive: true, mode: 0o700 });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const captures = [];
try {
  captures.push(await capture("jobs", async (page) => {
    await page.goto(`${baseUrl}/jobs`);
    await page.getByRole("heading", { name: "Jobs" }).waitFor();
    await hold(page, 500);
    await page.getByText("Product Engineer", { exact: true }).first().hover();
    await hold(page, 500);
    await page.mouse.wheel(0, 360);
    await hold(page, 700);
    await page.mouse.wheel(0, -260);
    await hold(page, 500);
    await page.getByText("Product Engineer", { exact: true }).first().click();
    await hold(page, 1400);
  }));

  captures.push(await capture("tracker", async (page) => {
    const jobs = await (await page.request.get(`${apiUrl}/api/jobs`)).json();
    const job = jobs.items.find((item) => item.title === "Product Engineer");
    await page.request.put(`${apiUrl}/api/jobs/${job.id}/stage`, { data: { stage: "applied" } });
    await page.goto(`${baseUrl}/tracker`);
    await page.getByRole("heading", { name: /Application Tracker/i }).waitFor();
    await hold(page, 700);
    await page.getByText("Product Engineer", { exact: true }).first().click();
    await hold(page, 600);
    await page.getByRole("button", { name: "Interviewing", exact: true }).last().click();
    await hold(page, 1600);
  }));

  captures.push(await capture("contacts", async (page) => {
    await page.goto(`${baseUrl}/people`);
    await page.getByRole("heading", { name: "People" }).waitFor();
    await hold(page, 500);
    await page.getByText("Avery Chen", { exact: true }).first().hover();
    await hold(page, 450);
    await page.getByText("Avery Chen", { exact: true }).first().click();
    await hold(page, 900);
    await page.mouse.wheel(0, 380);
    await hold(page, 800);
  }));

  captures.push(await capture("outreach", async (page) => {
    await page.goto(`${baseUrl}/messages`);
    await page.getByRole("heading", { name: "Messages" }).waitFor();
    await hold(page, 700);
    const avery = page.getByText("Avery Chen", { exact: true }).first();
    if (await avery.isVisible()) await avery.click();
    await hold(page, 800);
    const edit = page.getByRole("button", { name: /edit/i }).first();
    if (await edit.isVisible()) await edit.click();
    await hold(page, 600);
    const editable = page.locator("textarea").last();
    if (await editable.isVisible()) {
      const original = await editable.inputValue();
      await editable.press("End");
      await editable.type(" I would value your perspective.", { delay: 35 });
      await hold(page, 600);
      await editable.fill(original);
    }
    await hold(page, 500);
  }));
} finally {
  await browser.close();
}

const receipt = {
  schemaVersion: "1",
  environment: "fail_closed_synthetic_solomon_demo",
  sourceRevision: "8f71348b",
  publicReleaseApproved: false,
  externalProvidersDisabled: true,
  syntheticIdentitiesOnly: true,
  viewport,
  captures
};
await fs.writeFile(path.join(output, "capture-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(receipt, null, 2));

async function capture(id, perform) {
  const context = await browser.newContext({ viewport, recordVideo: { dir: output, size: viewport }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.addStyleTag({ content: "*{scroll-behavior:smooth!important} body{cursor:default!important}" });
  const video = page.video();
  let failure;
  try {
    await perform(page);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  const finalUrl = page.url();
  const visibleText = (await page.locator("body").innerText()).slice(0, 10_000);
  await page.screenshot({ path: path.join(output, `${id}-final.png`), fullPage: false });
  await context.close();
  const rawPath = await video.path();
  const destination = path.join(output, `${id}.webm`);
  await fs.rename(rawPath, destination);
  const bytes = await fs.readFile(destination);
  return { id, path: destination, sha256: createHash("sha256").update(bytes).digest("hex"), finalUrl, failure: failure ?? null, requiredTextObserved: requiredText(id).filter((value) => visibleText.toLowerCase().includes(value.toLowerCase())) };
}

function hold(page, milliseconds) {
  return page.waitForTimeout(milliseconds);
}

function requiredText(id) {
  if (id === "jobs") return ["Product Engineer", "Northstar Labs", "91"];
  if (id === "tracker") return ["Product Engineer", "Interviewing"];
  if (id === "contacts") return ["Avery Chen", "Senior Technical Recruiter", "Northstar Labs"];
  return ["Avery Chen", "Learning about Northstar Labs", "synthetic, unsent demo draft"];
}
