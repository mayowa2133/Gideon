import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isResolved, resolveBlueprintCrops, resolveCrop, type ScreenInventory } from "./screenInventory";

// Exercised against the real inventory, not a fixture of convenience: the whole
// question is whether the resolver picks good regions of an actual product's UI,
// and a hand-made inventory would answer a question nobody asked.
const inventory = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "fixtures", "creator-story", "solomon-screen-inventory.json"), "utf8")
) as ScreenInventory;

const resolve = (tokens: string[], aspect: number, options = {}) => resolveCrop(inventory, tokens, aspect, options);

describe("screen inventory", () => {
  it("attaches words to every element it offers", () => {
    for (const screen of inventory.screens) {
      expect(screen.elements.length, screen.asset).toBeGreaterThan(0);
      for (const element of screen.elements) {
        expect(element.words.length, `${screen.asset}/${element.id}`).toBeGreaterThan(0);
        // Every word box must lie inside the element that claims it, or the
        // resolver's cut-detection is reasoning about the wrong geometry.
        for (const word of element.words) {
          expect(word.x, `${element.id}/${word.text}`).toBeGreaterThanOrEqual(element.x);
          expect(word.x + word.width).toBeLessThanOrEqual(element.x + element.width);
          expect(word.y).toBeGreaterThanOrEqual(element.y);
          expect(word.y + word.height).toBeLessThanOrEqual(element.y + element.height);
        }
      }
    }
  });

  it("keeps approved and proposed regions distinct", () => {
    const all = inventory.screens.flatMap(({ elements }) => elements);
    expect(all.filter(({ provenance }) => provenance === "approved").length).toBeGreaterThan(10);
    expect(all.filter(({ provenance }) => provenance === "candidate").length).toBeGreaterThan(10);
    // Candidates are not usable without opting in: an unapproved region has not
    // been looked at by anyone, and shipping one is how a film shows the wrong
    // part of a product.
    const strict = resolve(["saved", "contacts", "grouped"], 1.6);
    expect(isResolved(strict)).toBe(false);
    expect(isResolved(resolve(["saved", "contacts", "grouped"], 1.6, { allowCandidates: true }))).toBe(true);
  });
});

describe("crop resolution", () => {
  it("finds the region that proves a claim", () => {
    const result = resolve(["Avery", "Chen", "Senior", "Technical", "Recruiter"], 2.4);
    expect(isResolved(result)).toBe(true);
    if (!isResolved(result)) return;
    expect(result.assetId).toBe("contact");
    expect(result.matchedTokens).toHaveLength(5);
  });

  // The rule that mattered most: a message panel is mostly empty box, and
  // showing the part carrying the claim is what moved edge density when every
  // framing lever had failed.
  it("prefers the smallest region containing the tokens", () => {
    const result = resolve(["Avery", "Chen"], 2.4);
    expect(isResolved(result)).toBe(true);
    if (!isResolved(result)) return;
    const contact = inventory.screens.find((screen) => screen.asset === "contact")!;
    const chosen = contact.elements.find((element) => element.id === result.elementId)!;
    const alsoMatching = contact.elements.filter((element) =>
      element.provenance === "approved" && element.text.toLowerCase().includes("avery") && element.text.toLowerCase().includes("chen"));
    for (const other of alsoMatching) {
      expect(chosen.width * chosen.height, `${chosen.id} should be no larger than ${other.id}`).toBeLessThanOrEqual(other.width * other.height);
    }
  });

  it("never returns a crop that cuts a word in half", () => {
    // The failure this prevents is "Senior Technical Recruite".
    for (const aspect of [0.6, 1, 1.3, 1.6, 2, 2.5, 3.2, 5.5]) {
      const result = resolve(["Avery", "Chen"], aspect);
      if (!isResolved(result)) continue;
      const screen = inventory.screens.find((candidate) => candidate.asset === result.assetId)!;
      for (const word of screen.elements.flatMap(({ words }) => words)) {
        const intersects = word.x < result.x + result.width && word.x + word.width > result.x && word.y < result.y + result.height && word.y + word.height > result.y;
        if (!intersects) continue;
        const contained = word.x >= result.x && word.y >= result.y && word.x + word.width <= result.x + result.width && word.y + word.height <= result.y + result.height;
        expect(contained, `aspect ${aspect} clips "${word.text}"`).toBe(true);
      }
    }
  });

  it("leaves margin around the words it frames", () => {
    // A crop flush to an element edge gets clipped by the composition's 1.02
    // focus scale. That is exactly how the "J" came off "Jobs".
    const result = resolve(["Avery", "Chen"], 1.3);
    expect(isResolved(result)).toBe(true);
    if (!isResolved(result)) return;
    const screen = inventory.screens.find((candidate) => candidate.asset === result.assetId)!;
    const inside = screen.elements.flatMap(({ words }) => words)
      .filter((word) => word.x >= result.x && word.y >= result.y && word.x + word.width <= result.x + result.width && word.y + word.height <= result.y + result.height);
    const nearestLeft = Math.min(...inside.map((word) => word.x - result.x));
    const nearestTop = Math.min(...inside.map((word) => word.y - result.y));
    expect(nearestLeft).toBeGreaterThanOrEqual(8);
    expect(nearestTop).toBeGreaterThanOrEqual(8);
  });

  it("reports honestly when nothing proves the claim", () => {
    const result = resolve(["quarterly", "revenue", "forecast"], 1.6, { allowCandidates: true });
    expect(isResolved(result)).toBe(false);
    if (isResolved(result)) return;
    expect(result.reason).toBe("no_element_contains_tokens");
    // A generated film must fail loudly here rather than showing an arbitrary
    // region: an unprovable claim over unrelated product pixels is the exact
    // failure the evidence gates exist to prevent.
    expect(result.considered.length).toBeGreaterThan(10);
  });

  it("serves every container shape the templates use", () => {
    // The aspects the seven templates actually request, from the parity film.
    for (const aspect of [6.38, 2.47, 2.33, 1.99, 1.6, 1.35, 1.1, 0.87]) {
      const result = resolve(["Avery", "Chen"], aspect);
      expect(isResolved(result), `aspect ${aspect}`).toBe(true);
    }
  });
});

describe("blueprint crop resolution", () => {
  const blueprint = JSON.parse(
    readFileSync(path.join(__dirname, "..", "..", "fixtures", "creator-story", "solomon-v22.blueprint.json"), "utf8")
  ) as { scenes: Array<Record<string, unknown>> };
  // The claims as the reference film declares them, including which asset each
  // says proves it.
  const claims = [
    { id: "status", assetIds: ["tracker_before", "tracker_after"], requiredReadableText: ["Product Engineer", "Applied", "Interviewing"] },
    { id: "contact", assetIds: ["contact"], requiredReadableText: ["Avery Chen", "Senior Technical Recruiter", "Northstar Labs"] },
    { id: "relevance", assetIds: ["contact"], requiredReadableText: ["Recruiting title at the target company", "Current role at Northstar Labs"] },
    { id: "role", assetIds: ["opportunity"], requiredReadableText: ["Product Engineer", "Northstar Labs"] },
    { id: "draft", assetIds: ["outreach_complete"], requiredReadableText: ["Product Engineer", "Northstar Labs", "technical hiring", "Save Edit"] },
    { id: "control", assetIds: ["outreach_complete"], requiredReadableText: ["Save Edit", "Cancel"] }
  ];

  it("fills a crop for every scene that draws product", () => {
    const { blueprint: filled } = resolveBlueprintCrops(blueprint, inventory, claims);
    const needsProduct = blueprint.scenes.filter((scene) => (scene.productCrops as unknown[] | undefined)?.length);
    const resolved = filled.scenes.filter((scene) => (scene.productCrops as unknown[] | undefined)?.length);
    expect(resolved).toHaveLength(needsProduct.length);
    for (const scene of resolved) {
      for (const crop of scene.productCrops as Array<{ width: number; height: number; trim: number }>) {
        expect(crop.width, String(scene.id)).toBeGreaterThan(80);
        expect(crop.height, String(scene.id)).toBeGreaterThan(60);
        expect(Number.isFinite(crop.trim)).toBe(true);
      }
    }
  });

  it("leaves presenter-only scenes without product", () => {
    const { blueprint: filled } = resolveBlueprintCrops(blueprint, inventory, claims);
    for (const scene of filled.scenes.filter((candidate) => candidate.contentPattern === "ambient" || candidate.contentPattern === "comment_card")) {
      expect((scene.productCrops as unknown[] | undefined) ?? [], String(scene.id)).toHaveLength(0);
    }
  });

  // The finding this pins, and it is about the film rather than the resolver:
  // `role` declares asset `opportunity`, and "Product Engineer" and "Northstar
  // Labs" appear nowhere on the Jobs page. That claim's OCR passed in the
  // reference film because the film draws those words itself as proof labels --
  // so requiredOcr at 1.00 meant "the words were on screen", not "the product
  // showed them". Refusing is the correct behaviour and this locks it.
  it("refuses a claim whose words are not on the asset it names", () => {
    const { issues } = resolveBlueprintCrops(blueprint, inventory, claims);
    const roleIssues = issues.filter((issue) => issue.claimId === "role");
    expect(roleIssues.length).toBeGreaterThan(0);
    for (const issue of roleIssues) expect(issue.reason).toBe("no_element_contains_tokens");
    const opportunity = inventory.screens.find((screen) => screen.asset === "opportunity")!;
    const words = opportunity.elements.map(({ text }) => text).join(" ").toLowerCase();
    expect(words).not.toContain("product engineer");
    expect(words).not.toContain("northstar labs");
  });
});
