import { type InventoryElement, type ScreenInventory } from "./screenInventory";
import type { SceneContentPattern } from "./types";

// Picks the claims a film is allowed to make, from what the product actually
// shows.
//
// This is inverted on purpose, and the inversion is the whole lesson of the
// crop resolver. The reference film wrote its claims first and checked them
// against pixels afterwards, and four of six turned out to be unprovable: `role`
// named a screen where its words do not appear, `control` demanded buttons the
// product does not have, `draft` asked for four strings no single region
// carries, and `relevance` quoted a phrase OCR cannot reproduce. Each passed the
// film's OCR gate anyway, because the film prints those words itself.
//
// A generated film cannot survive that. So claims are selected from approved,
// legible regions -- the evidence comes first and the sentence is written to fit
// it, which makes `requiredOcr` true by construction rather than by luck.
export interface SelectableClaim {
  id: string;
  assetId: string;
  elementId: string;
  requiredReadableText: string[];
  renderedTextPx: number;
  /** Words the region contains, for a writer to draw a sentence from. */
  evidenceText: string;
  /**
   * The container this claim's crop was resolved and measured against, when a
   * capture plan chose one. Legibility is a property of the crop that is drawn,
   * and the crop is a function of the container's aspect -- so a claim that
   * passed `verify` passed it for one pattern, and the compiler draws that one
   * or reports why it did not. Absent for claims picked straight out of an
   * inventory, which the compiler frames with its own default.
   */
  contentPattern?: SceneContentPattern;
}

export interface ClaimSelectionIssue { assetId: string; elementId: string; reason: string }

// A region must be legible before it can carry a claim. `poor` means its text
// cannot reach a readable size in a 1080-wide frame at any crop -- knowable
// before rendering, and the thing that cost four renders to learn on `control`.
// `marginal` is allowed but reported, because 25-26px dark-on-white reads and
// 23px light grey does not, and only a look settles which one a region is.
const USABLE = new Set(["ok", "marginal"]);

// Tokens a claim can require. Short words and stopwords are dropped: OCR
// reproduces "Recruiter" reliably and "at" unreliably, and a claim that hinges
// on a two-letter word fails on the reader rather than on the evidence.
const STOPWORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "with", "your", "you"]);
// Capitalised words first, then longer ones. Taking tokens in reading order gave
// "Select batch email" -- the checkbox above a contact card, which is chrome
// rather than evidence -- and let an OCR typo through as "Stage this emall".
// Proper nouns and UI labels are both capitalised and both survive OCR better
// than lowercase body text, so preferring them buys accuracy and meaning at once.
export function candidateTokens(text: string) {
  const seen = new Set<string>();
  // A number is a token however short it is, and in a short label it sorts
  // first.
  //
  // The four-character floor is there to drop noise words, and it dropped every
  // measurement: "0% Response Rate" yielded ["Response", "Rate"], so the claim
  // that Solomon counts replies required only the metric's NAME to be legible.
  // The resolver, free to exclude the rest, framed the label -- and the film
  // said "it tracks your response rate" over a band reading "Response Rate"
  // and no rate. A metric's value is the part that makes it evidence, so it is
  // the part that has to be required.
  //
  // Short tokens are safe to require because `tokensPresent` only prefix-matches
  // at four characters or more; below that it demands equality, so "0" matches
  // "0" and nothing else.
  //
  // Punctuation SPLITS a word here, as it does in the resolver's `normalise`.
  // It used to be deleted, which is the same fact represented two ways with no
  // check between them: "Applied: 8/3/2026" became the token "832026" while the
  // resolver read the same text as "8", "3", "2026", so a claim could be issued
  // carrying a token no crop could ever satisfy. Invisible until numbers were
  // allowed to rank, and then it dropped a claim outright.
  const hasDigit = (word: string) => /\d/.test(word);
  // A number leads only where the text is a label rather than a paragraph. On a
  // stat tile the value IS the claim; in a card's worth of prose a stray date is
  // the least distinctive thing on it.
  const isLabel = text.trim().split(/\s+/).length <= 4;
  const words = text.split(/[^A-Za-z0-9]+/)
    .filter((word) => (word.length >= 4 || hasDigit(word)) && !STOPWORDS.has(word.toLowerCase()))
    .filter((word) => { const key = word.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
  return words.sort((left, right) => {
    const capitalised = (word: string) => (/^[A-Z]/.test(word) ? 0 : 1);
    const numberFirst = (word: string) => (isLabel && hasDigit(word) ? 0 : 1);
    return numberFirst(left) - numberFirst(right)
      || capitalised(left) - capitalised(right)
      || right.length - left.length;
  });
}

// Two crops of the same card are one piece of evidence. `outreachBlank` and
// `outreachDraftCard` overlap almost entirely and produced identical tokens, so
// a film would have made the same claim twice and called it two.
function overlaps(left: InventoryElement, right: InventoryElement) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return (width * height) / Math.max(1, Math.min(left.width * left.height, right.width * right.height)) > .6;
}

// The tokens a claim may require of a region: words the product wrote AND the
// capture can see.
//
// Tokens come from the DOM because OCR misreads words ("Outlook" as "Qutiook")
// and a claim built on a misreading breaks the moment a later capture reads it
// correctly. But `innerText` returns text that never renders: a `<select>`
// carries every `<option>` in its text, so the empty composer's person picker
// claimed "Marketing" and "Engineering" while the frame showed nothing but
// "Select a person...". The film promised a marketing contact over an empty
// dropdown -- the same shape as the metric label with no metric, arrived at
// from the opposite direction.
//
// Each source answers only what it can witness. The DOM says what the words
// are; OCR says they are on screen. A token needs both.
// How many of a region's words a claim requires, and therefore how many the
// legibility grade is measured on.
//
// One number because it is one decision, and it was three: `selectClaims` took
// three, the film's brief asked for two, and the plan's verifier graded on
// three. The verifier rejected the draft heading at 13.6px because its third
// token was an 8px "DRAFT" chip that dragged the median down -- while the film
// would have drawn the shot on "Message" and "Interview" and read it at 20.3.
// Verifying one shot and shipping another is the failure this whole file is
// arranged to prevent.
export const CLAIM_TOKENS = 2;

export function claimableTokens(element: Pick<InventoryElement, "text" | "sourceText">) {
  if (!element.sourceText) return candidateTokens(element.text);
  const seen = candidateTokens(element.text).map((word) => word.toLowerCase());
  // The same prefix rule the resolver matches by, so a token that survives here
  // is a token that can be found there.
  const visible = (token: string) => {
    const needle = token.toLowerCase();
    return seen.some((word) => word === needle
      || (needle.length >= 4 && word.startsWith(needle.slice(0, 4)))
      || (word.length >= 4 && needle.startsWith(word.slice(0, 4))));
  };
  return candidateTokens(element.sourceText).filter(visible);
}

export function selectClaims(
  inventory: ScreenInventory,
  options: { maxClaims?: number; tokensPerClaim?: number; allowCandidates?: boolean } = {}
) {
  const { maxClaims = 6, tokensPerClaim = CLAIM_TOKENS, allowCandidates = false } = options;
  const issues: ClaimSelectionIssue[] = [];
  const claims: SelectableClaim[] = [];

  const usable: Array<{ assetId: string; element: InventoryElement }> = [];
  for (const screen of inventory.screens) {
    for (const element of screen.elements) {
      // The page is shown, never claimed: it contains every word on the route.
      if (element.provenance === "screen") continue;
      if (!allowCandidates && element.provenance !== "approved") continue;
      if (!USABLE.has(element.legibility ?? "poor")) {
        issues.push({ assetId: screen.asset, elementId: element.id, reason: `legibility_${element.legibility ?? "unknown"}` });
        continue;
      }
      if (claimableTokens(element).length < tokensPerClaim) {
        issues.push({ assetId: screen.asset, elementId: element.id, reason: "too_few_distinct_words" });
        continue;
      }
      usable.push({ assetId: screen.asset, element });
    }
  }

  // Most legible first, then smallest: a claim wants the clearest evidence it
  // can get, and among equals the tighter region magnifies better.
  usable.sort((left, right) =>
    (right.element.renderedTextPx ?? 0) - (left.element.renderedTextPx ?? 0)
    || left.element.width * left.element.height - right.element.width * right.element.height);

  // One claim per screen before a second from any: a film whose every claim
  // comes off one page is not showing a product, it is showing a screenshot.
  const perAsset = new Map<string, number>();
  for (const round of [0, 1, 2]) {
    for (const { assetId, element } of usable) {
      if (claims.length >= maxClaims) break;
      if ((perAsset.get(assetId) ?? 0) !== round) continue;
      if (claims.some((claim) => claim.elementId === element.id)) continue;
      if (claims.some((claim) => claim.assetId === assetId && overlaps(element, usable.find(({ element: other }) => other.id === claim.elementId)!.element))) continue;
      perAsset.set(assetId, round + 1);
      claims.push({
        id: `${assetId}-${element.id}`,
        assetId,
        elementId: element.id,
        // From the DOM where the capture recorded it. A claim that requires
        // OCR's reading of a word breaks when the next capture reads it better.
        requiredReadableText: claimableTokens(element).slice(0, tokensPerClaim),
        renderedTextPx: element.renderedTextPx ?? 0,
        evidenceText: element.sourceText ?? element.text
      });
    }
  }
  return { claims, issues, usableRegions: usable.length };
}
