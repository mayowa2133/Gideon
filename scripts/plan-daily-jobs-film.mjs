#!/usr/bin/env node
// Write today's requirements for a job-feed film, read off the page it will shoot.
//
// Every other film in this repo claims things about seeded demo content, so its
// requirements can be written by hand and stay true. A daily film cannot: the
// roles it names are whatever the overnight ingest pulled in, and they are
// different tomorrow.
//
// The obvious way to fill them in is to ask the API what the top posting is.
// That is the defect this repo keeps finding -- two representations of one fact
// with nothing comparing them. The Jobs page asks the API only for a sort order
// and a set of occupations and then applies remote, startup, level and stage
// filtering in the browser, so the API's idea of "first" and the feed's idea of
// "first" are different questions, and a requirements file built from the first
// would name a role that is on screen somewhere, or nowhere, but not at the top.
//
// So this drives the real page: the same `prepare` the capture writes, the same
// interaction the capture films, and then reads the first card the feed drew.
// There is one representation, and it is the rendered one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { locate, perform } from "./lib/playwright-locate.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = (name) => path.join(ROOT, "dist", "main", "shared", name);
const { SOLOMON_SURFACES } = await import(dist("solomonCaptureSurfaces.js"));

const arg = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
};

const surfaceId = arg("--surface");
const outDir = arg("--out");
const baseUrl = process.env.SOLOMON_DEMO_URL ?? "http://localhost:5173";
if (!surfaceId || !outDir) {
  console.error("usage: plan-daily-jobs-film.mjs --surface <id> --out <dir>");
  process.exit(1);
}

const surface = SOLOMON_SURFACES.surfaces.find((entry) => entry.id === surfaceId);
if (!surface) {
  console.error(`no surface ${surfaceId}`);
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
});
const context = await browser.newContext({
  viewport: SOLOMON_SURFACES.viewport,
  deviceScaleFactor: 1,
  reducedMotion: "no-preference"
});
const page = await context.newPage();

const entries = (surface.prepare?.localStorage ?? []).map((entry) => ({
  key: entry.key,
  value: typeof entry.isoHoursAgo === "number"
    ? new Date(Date.now() - entry.isoHoursAgo * 3600 * 1000).toISOString()
    : entry.value
}));

if (entries.length) {
  await page.goto(`${baseUrl}${surface.route}`, { waitUntil: "domcontentloaded" });
  await page.evaluate((written) => {
    for (const entry of written) window.localStorage.setItem(entry.key, entry.value);
  }, entries);
}
await page.goto(`${baseUrl}${surface.route}`, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);

for (const action of surface.motion?.actions ?? []) {
  await perform(page, action);
  await page.waitForTimeout(4000);
}
await page.waitForTimeout(6000);

// The first card the feed drew, and the header it drew above it.
const feed = await page.evaluate(() => {
  const column = [...document.querySelectorAll("div")]
    .find((node) => node.className.toString().includes("col-span-2"));
  const card = column?.children?.[0];
  const title = card?.querySelector("div.font-medium.text-sm.truncate")?.textContent?.trim() ?? null;
  // First non-empty match: the card has more than one node with these classes
  // and the earlier ones can be empty, so `querySelector` alone returns "".
  const company = card
    ? ([...card.querySelectorAll("div.text-xs.text-muted-foreground")]
        .map((node) => node.textContent?.trim() ?? "")
        .find((text) => text.length > 0) ?? null)
    : null;
  const header = [...document.querySelectorAll("span.ml-auto")]
    .map((node) => node.textContent?.trim() ?? "")
    .find((text) => /\d+\s+jobs/.test(text)) ?? null;
  const badges = card ? [...card.querySelectorAll('span[data-slot="badge"]')].map((b) => b.textContent.trim()) : [];

  // The top few cards, not just the first. A listicle film claims several roles
  // and each one needs its own locator text, so the whole shortlist has to come
  // off the same render the capture will shoot.
  const top = [...(column?.children ?? [])].slice(0, 6).map((node) => {
    const roleTitle = node.querySelector("div.font-medium.text-sm.truncate")?.textContent?.trim() ?? null;
    const companyCell = [...node.querySelectorAll("div.text-xs.text-muted-foreground")]
      .map((inner) => inner.textContent?.trim() ?? "")
      .find((text) => text.length > 0) ?? "";
    const place = node.querySelector("span.text-xs.text-muted-foreground")?.textContent?.trim() ?? null;
    return { title: roleTitle, company: companyCell.split("\u00b7")[0].trim(), location: place };
  }).filter((entry) => entry.title);

  // The first card that shows how old the posting is.
  //
  // Not every card has one -- the company cell reads "replit · 2 days ago" when
  // the source gave a date and just "WarpBuild" when it did not. A film that
  // claims these roles are recent has to point at a card where the product says
  // so, and a one-word cell cannot carry a claim anyway: two distinct readable
  // tokens are the floor, and "WarpBuild" is one.
  let dated = null;
  for (const node of [...(column?.children ?? [])]) {
    const cell = [...node.querySelectorAll("div.text-xs.text-muted-foreground")]
      .map((inner) => inner.textContent?.trim() ?? "")
      .find((text) => /·.*(ago|Today|Just now)/.test(text));
    if (cell) {
      dated = { text: cell, company: cell.split("·")[0].trim(), age: cell.split("·").slice(1).join("·").trim() };
      break;
    }
  }
  return { title, company, header, badges, dated, top, cards: column ? column.children.length : 0 };
});

await browser.close();

if (!feed.title || !feed.header) {
  console.error(`the feed drew nothing to film: ${JSON.stringify(feed)}`);
  process.exit(1);
}

// The company cell carries the posted-ago suffix ("replit · 2 days ago"); the
// claim wants the company, so keep what precedes the separator.
const company = (feed.company ?? "").split("·")[0].trim();
const counts = feed.header.match(/(\d+)\s+jobs(?:\s*\((\d+)\s+new\))?/);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "feed-today.json"),
  `${JSON.stringify({ surfaceId, capturedAt: new Date().toISOString(), ...feed, company, matched: counts?.[1] ?? null, fresh: counts?.[2] ?? null }, null, 2)}\n`
);

console.log(JSON.stringify({ surfaceId, title: feed.title, company, header: feed.header, badges: feed.badges, cards: feed.cards }, null, 2));
