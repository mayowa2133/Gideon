import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { candidateTokens, selectClaims } from "./claimSelection";
import { resolveCrop, type ScreenInventory } from "./screenInventory";

const inventory = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "fixtures", "creator-story", "solomon-screen-inventory.json"), "utf8")
) as ScreenInventory;

const elementFor = (assetId: string, elementId: string) =>
  inventory.screens.find((screen) => screen.asset === assetId)!.elements.find((element) => element.id === elementId)!;

describe("claim selection", () => {
  const { claims, issues } = selectClaims(inventory);

  it("selects claims the product can actually prove", () => {
    expect(claims.length).toBeGreaterThan(0);
    // The property that matters, checked through the consumer rather than
    // restated: every claim resolves to a crop of the screen it names. This is
    // the whole point of selecting claims from evidence -- in the reference film
    // four of six written-first claims could not do this, and the OCR gate
    // missed all four because the film printed the words itself.
    for (const claim of claims) {
      const resolved = resolveCrop(inventory, claim.requiredReadableText, 1.6, { assetId: claim.assetId });
      expect(resolved, `${claim.id}: ${JSON.stringify(claim.requiredReadableText)}`).not.toHaveProperty("reason");
    }
  });

  it("never carries a claim on text too small to read", () => {
    for (const claim of claims) {
      expect(elementFor(claim.assetId, claim.elementId).legibility, claim.id).not.toBe("poor");
      // 20px is the marginal floor; below it the arithmetic says no crop helps.
      expect(claim.renderedTextPx, claim.id).toBeGreaterThanOrEqual(20);
    }
    // And illegible regions are reported rather than silently dropped, so a
    // writer can see why a screen contributed nothing.
    expect(issues.some(({ reason }) => reason.startsWith("legibility_"))).toBe(true);
  });

  it("spreads claims across screens before doubling up on one", () => {
    const perAsset = new Map<string, number>();
    for (const claim of claims) perAsset.set(claim.assetId, (perAsset.get(claim.assetId) ?? 0) + 1);
    expect(Math.max(...perAsset.values()) - Math.min(...perAsset.values())).toBeLessThanOrEqual(1);
  });

  it("does not make one region's evidence into two claims", () => {
    for (const claim of claims) {
      const box = elementFor(claim.assetId, claim.elementId);
      for (const other of claims.filter((candidate) => candidate !== claim && candidate.assetId === claim.assetId)) {
        const rect = elementFor(other.assetId, other.elementId);
        const width = Math.max(0, Math.min(box.x + box.width, rect.x + rect.width) - Math.max(box.x, rect.x));
        const height = Math.max(0, Math.min(box.y + box.height, rect.y + rect.height) - Math.max(box.y, rect.y));
        const shared = (width * height) / Math.min(box.width * box.height, rect.width * rect.height);
        expect(shared, `${claim.elementId} vs ${other.elementId}`).toBeLessThanOrEqual(.6);
      }
    }
  });

  it("prefers proper nouns over interface chrome", () => {
    // Reading order gave "Select batch email" -- a checkbox label above a
    // contact card -- and let a tesseract misread of "email" through as
    // "emall". Capitalised words are both more meaningful and more reliably
    // recognised, so at least two of three tokens must be one.
    for (const claim of claims) {
      const capitalised = claim.requiredReadableText.filter((token) => /^[A-Z]/.test(token));
      expect(capitalised.length, `${claim.id}: ${JSON.stringify(claim.requiredReadableText)}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns nothing rather than something unprovable when no region qualifies", () => {
    const poor: ScreenInventory = {
      ...inventory,
      screens: inventory.screens.map((screen) => ({
        ...screen,
        elements: screen.elements.map((element) => ({ ...element, legibility: "poor" as const }))
      }))
    };
    expect(selectClaims(poor).claims).toEqual([]);
  });

  // A claim must survive OCR reading the same screen differently.
  //
  // Tokens used to be chosen from the OCR text, so a run that rendered "Outlook"
  // as "Qutiook" issued a claim requiring "Qutiook" -- and the NEXT capture,
  // reading the same unchanged screen correctly, dropped the claim for not
  // containing it. The same run lost "carried" from another region and dropped
  // that claim too. A pipeline where improving the input breaks the output is
  // inverted, so tokens come from the DOM and OCR keeps only the two jobs it is
  // the sole witness for: legibility, and where each word sits.
  it("chooses claim tokens from the product's words, not from OCR's reading of them", () => {
    const misread = (ocr: string): ScreenInventory => ({
      schemaVersion: "1", product: "solomon", source: { width: 1440, height: 900 },
      screens: [{
        asset: "path", trim: 0, width: 1440, height: 900,
        elements: [{
          id: "note", provenance: "approved", x: 300, y: 400, width: 420, height: 32, aspect: 13.1,
          text: ocr, sourceText: "Review before it reaches Gmail or Outlook",
          textHeightPx: 12, renderedTextPx: 40, legibility: "ok",
          words: ocr.split(" ").map((word, index) => ({ text: word, x: 300 + index * 60, y: 405, width: 52, height: 12 }))
        }]
      }]
    });

    // Two runs of one screen: one where Tesseract slips, one where it does not.
    const slipped = selectClaims(misread("Review before it reaches Gmall or Qutiook")).claims[0]!;
    const clean = selectClaims(misread("Review before it reaches Gmail or Outlook")).claims[0]!;
    expect(slipped.requiredReadableText, "the slip must not reach the claim").toEqual(clean.requiredReadableText);
    expect(slipped.requiredReadableText.join(" ")).not.toContain("Qutiook");

    // And the claim issued from the slipped run still resolves against the clean
    // one, which is the round trip that was broken: recapturing dropped it.
    const resolved = resolveCrop(misread("Review before it reaches Gmail or Outlook"), slipped.requiredReadableText, 5.5, { assetId: "path" });
    expect("reason" in resolved ? resolved.reason : "resolved", `claim tokens ${JSON.stringify(slipped.requiredReadableText)} did not survive a better capture`).toBe("resolved");
  });

  // A measurement's value is the part that makes it evidence.
  //
  // The film claimed "it tracks your response rate" over a band reading
  // "Response Rate" and no rate: the tokens came out ["Response", "Rate"], the
  // resolver was free to frame the label alone, and every gate passed because
  // the words it was asked to make legible were legible. The claim asked for
  // less than it asserted.
  it("requires a measurement's value, not just its name", () => {
    const tokens = candidateTokens("0% Response Rate");
    expect(tokens, "the number is the evidence and must be required").toContain("0");
    expect(tokens[0], "and it is the most distinctive part, so it is asked for first").toBe("0");

    // Through the resolver, which is what the film actually depends on: a crop
    // of the label alone must no longer satisfy the claim.
    const tile: ScreenInventory = {
      schemaVersion: "1", product: "solomon", source: { width: 1440, height: 900 },
      screens: [{
        asset: "queue", trim: 0, width: 1440, height: 900,
        elements: [{
          id: "label", provenance: "approved", x: 347, y: 580, width: 223, height: 20, aspect: 11.15,
          text: "Response Rate", textHeightPx: 12, renderedTextPx: 54, legibility: "ok",
          words: [{ text: "Response", x: 348, y: 585, width: 61, height: 12 }, { text: "Rate", x: 414, y: 585, width: 30, height: 12 }]
        }, {
          id: "tile", provenance: "approved", x: 347, y: 548, width: 223, height: 52, aspect: 4.29,
          text: "0% Response Rate", textHeightPx: 12, renderedTextPx: 54, legibility: "ok",
          words: [{ text: "0%", x: 348, y: 552, width: 40, height: 24 }, { text: "Response", x: 348, y: 585, width: 61, height: 12 }, { text: "Rate", x: 414, y: 585, width: 30, height: 12 }]
        }]
      }]
    };
    const resolved = resolveCrop(tile, tokens, 5.5, { assetId: "queue" });
    expect("elementId" in resolved ? resolved.elementId : resolved).toBe("tile");
  });
});
