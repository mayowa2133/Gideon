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

  // The rule the `control` claim paid four renders to learn: a region whose text
  // cannot survive the frame is not evidence, however well it OCRs on a desktop
  // screenshot. Knowable before anything renders -- at best a region fills the
  // frame width, so its type lands at height * 1080 / width.
  it("grades whether each region's text can survive the frame", () => {
    for (const screen of inventory.screens) {
      for (const element of screen.elements) {
        expect(element.legibility, `${screen.asset}/${element.id}`).toMatch(/^(ok|marginal|poor)$/);
        const expected = Math.round((element.textHeightPx ?? 0) * (1080 / element.width));
        expect(element.renderedTextPx, `${screen.asset}/${element.id}`).toBe(expected);
      }
    }
    const all = inventory.screens.flatMap(({ elements }) => elements);
    // Both ends of the grade are represented, or the rule is not discriminating.
    expect(all.some(({ legibility }) => legibility === "ok")).toBe(true);
    expect(all.some(({ legibility }) => legibility === "poor")).toBe(true);
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

  // The page is a third thing, and it must never answer a claim.
  //
  // It spans the whole route, so it contains every word on it and would satisfy
  // any tokens asked of it -- including tokens whose words sit in chrome nobody
  // approved. Opting into candidates is the case that matters: that path relaxes
  // the provenance filter, and relaxing it far enough to reach the page turns
  // "this claim is unprovable" into "here is the entire screen".
  it("never answers a claim with the whole page", () => {
    const pages = inventory.screens.flatMap(({ elements }) => elements).filter(({ provenance }) => provenance === "screen");
    expect(pages.length, "the fixture should carry page regions at all").toBeGreaterThan(0);
    for (const page of pages) expect(page.width).toBeGreaterThan(1000);

    // "Dashboard" and "Resumes" are nav-rail labels: they appear inside the page
    // region and inside no approved or candidate region on any screen. That is
    // the shape that reaches the page -- the resolver takes the smallest match,
    // so the page only ever wins when it is the only one.
    for (const options of [{}, { allowCandidates: true }]) {
      for (const tokens of [["Dashboard", "Resumes"], ["saved", "contacts", "grouped"], ["Avery", "Chen"], ["Northstar", "Labs"]]) {
        const result = resolve(tokens, 1.6, options);
        if (!isResolved(result)) continue;
        expect(result.elementId, `${JSON.stringify(tokens)} resolved to a page`).not.toMatch(/Screen$/);
      }
    }
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

  // Two properties that "does not cut a word in half" does not cover, both of
  // which reached a rendered frame.
  describe("what the crop keeps and what it leaves behind", () => {
    // A row of three lines with no gutters between them. Snapping the top edge
    // to exactly the bottom of the row above leaves that row's last pixels
    // inside the card -- three grey stubs along the top edge of a rendered
    // strip. A word is either wholly in the shot with clearance, or wholly out
    // of it with clearance; flush against the edge is neither.
    const stacked: ScreenInventory = {
      schemaVersion: "1", product: "test", source: { width: 1440, height: 900 },
      screens: [{
        asset: "panel", trim: 0, width: 1440, height: 900,
        elements: [
          { id: "above", provenance: "approved", x: 300, y: 480, width: 200, height: 16, aspect: 12.5, text: "Ninety Percent", legibility: "ok", renderedTextPx: 54,
            words: [{ text: "Ninety", x: 302, y: 482, width: 60, height: 12 }, { text: "Percent", x: 368, y: 482, width: 66, height: 12 }] },
          { id: "claim", provenance: "approved", x: 300, y: 500, width: 200, height: 16, aspect: 12.5, text: "Response Rate", legibility: "ok", renderedTextPx: 54,
            words: [{ text: "Response", x: 302, y: 503, width: 78, height: 11 }, { text: "Rate", x: 386, y: 503, width: 38, height: 11 }] },
          { id: "below", provenance: "approved", x: 300, y: 522, width: 200, height: 16, aspect: 12.5, text: "Total Entries", legibility: "ok", renderedTextPx: 54,
            words: [{ text: "Total", x: 302, y: 525, width: 44, height: 12 }, { text: "Entries", x: 352, y: 525, width: 62, height: 12 }] }
        ]
      }]
    };

    it("leaves no sliver of the row it snapped away from", () => {
      const result = resolveCrop(stacked, ["Response", "Rate"], 5.5, { assetId: "panel" });
      expect(isResolved(result)).toBe(true);
      if (!isResolved(result)) return;
      // Grown by the guard, a word is either wholly in the shot or wholly out of
      // it. Testing the ungrown box is what makes this vacuous: a word snapped to
      // exactly the edge does not "intersect" the crop by any strict comparison,
      // and it is the case the guard exists for.
      for (const word of stacked.screens[0]!.elements.flatMap(({ words }) => words)) {
        const grown = { x: word.x - 4, y: word.y - 4, width: word.width + 8, height: word.height + 8 };
        const inside = grown.x >= result.x && grown.y >= result.y
          && grown.x + grown.width <= result.x + result.width && grown.y + grown.height <= result.y + result.height;
        const clear = !(grown.x < result.x + result.width && grown.x + grown.width > result.x
          && grown.y < result.y + result.height && grown.y + grown.height > result.y);
        expect(inside || clear, `"${word.text}" is neither clear of the crop edge nor clear inside it`).toBe(true);
      }
    });

    // The hole underneath every legibility number in this pipeline. Snapping
    // takes the cheapest edge, and the cheapest edge is sometimes the one that
    // steps over the claim's own words: the crop ends up beside the evidence,
    // `bisected` is satisfied because those words are now entirely outside, and
    // `renderedTextPxOnCrop` still grades the element's type as though it were
    // in the shot. A claim measured at 40px, drawn, and absent.
    it("never resolves a crop the claim's words are outside of", () => {
      // One tall OCR box overlapping the claim from just above it. Tesseract
      // produces these on real product chrome -- a checkbox glyph came back as
      // 10x30 and a divider as 3x32 on Solomon's contact card -- and the cheapest
      // way to clear one is to pull the bottom edge up above where it starts,
      // which lands the whole crop above the claim. Nothing downstream notices:
      // the words are outside rather than cut, so `bisected` is satisfied, and
      // the legibility grade is still computed from the element's own type.
      const stepover: ScreenInventory = {
        ...stacked,
        screens: [{
          ...stacked.screens[0]!,
          elements: [
            stacked.screens[0]!.elements.find(({ id }) => id === "claim")!,
            {
              id: "chrome", provenance: "candidate" as const, x: 300, y: 498, width: 220, height: 122,
              aspect: 1.8, text: "", legibility: "poor" as const, renderedTextPx: 0,
              words: [{ text: "chrome", x: 300, y: 498, width: 220, height: 122 }]
            }
          ]
        }]
      };
      const result = resolveCrop(stepover, ["Response", "Rate"], 5.5, { assetId: "panel" });
      // Refusing is a fine answer. Returning a crop the evidence is not in is not.
      for (const word of stepover.screens[0]!.elements.find(({ id }) => id === "claim")!.words) {
        if (!isResolved(result)) break;
        expect(word.x >= result.x && word.x + word.width <= result.x + result.width, `drops "${word.text}" sideways`).toBe(true);
        expect(word.y >= result.y && word.y + word.height <= result.y + result.height, `drops "${word.text}" vertically`).toBe(true);
      }
    });
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
    { id: "relevance", assetIds: ["contact"], requiredReadableText: ["target company", "Current role at Northstar Labs"] },
    { id: "role", assetIds: ["tracker_after"], requiredReadableText: ["Product Engineer", "Northstar Labs"] },
    { id: "draft", assetIds: ["outreach_complete"], requiredReadableText: ["Product Engineer", "Northstar Labs", "technical hiring"] },
    { id: "control", assetIds: ["outreach_complete"], requiredReadableText: ["draft"] }
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

  // How the ungrounded claims were caught, kept as a live check rather than a
  // story. `role` used to declare asset `opportunity` and require "Product
  // Engineer" and "Northstar Labs" -- words that appear nowhere on the Jobs
  // page. It passed the film's OCR gate anyway, because the film prints those
  // words itself as proof labels, which means requiredOcr at 1.00 was saying
  // "these words were on screen", not "the product showed them". The claim now
  // names the tracker, where the role and company really do sit together.
  it("refuses a claim whose words are not on the asset it names", () => {
    const ungrounded = [{ id: "role", assetIds: ["opportunity"], requiredReadableText: ["Product Engineer", "Northstar Labs"] }];
    const { issues } = resolveBlueprintCrops(blueprint, inventory, ungrounded);
    // Only the role claim is supplied, so other claimIds report unknown_claim;
    // the assertion is about how an ungrounded claim is refused, not about them.
    const roleIssues = issues.filter((issue) => issue.claimId === "role");
    expect(roleIssues.length).toBeGreaterThan(0);
    for (const issue of roleIssues) expect(issue.reason).toBe("no_element_contains_tokens");
    const opportunity = inventory.screens.find((screen) => screen.asset === "opportunity")!;
    const words = opportunity.elements.map(({ text }) => text).join(" ").toLowerCase();
    expect(words).not.toContain("product engineer");
    expect(words).not.toContain("northstar labs");
  });

  // And the film's real claims now resolve. One refusal survives and it is
  // geometry, not grounding: the control assurance is a 444x63 strip, and
  // `payoff`'s near-square card cannot show it without pulling in the lines
  // above and below. That scene proves itself through its other five claims.
  it("grounds every claim the film ships", () => {
    const { issues } = resolveBlueprintCrops(blueprint, inventory, claims);
    expect(issues.filter((issue) => issue.reason === "no_element_contains_tokens")).toEqual([]);
    expect(issues.length).toBeLessThanOrEqual(1);
  });
});
