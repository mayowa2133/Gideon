// Picks the region of a product screen that proves a claim, and fits it to the
// card that will show it.
//
// This replaces the hardcoded `readableRegion` -- `{x:.08,y:.08,width:.84,
// height:.78}` on every product asset -- which was the single thing standing
// between a blueprint and a film. Crop choice is where the quality lives:
// everything done by hand to make the reference film legible was crop choice.
//
// Three rules, each earned:
//
// **Smallest region containing the words, not the largest clean element.** A
// message panel is two-thirds empty box below three lines of text; showing the
// part that carries the claim is what moved edge density where every framing
// lever had failed. Aspect-matching for its own sake made it 52% worse.
//
// **Margin is not decoration.** A crop flush to an element's edge gets clipped
// by the composition's 1.02 focus scale -- that is how the "J" came off "Jobs".
//
// **Never cut a word in half.** The earlier attempt at tighter crops produced
// "Senior Technical Recruite". A crop that intersects a word box without
// containing it is rejected, and the fit is retried the other way.
export interface InventoryWord { text: string; x: number; y: number; width: number; height: number }
export interface InventoryElement {
  id: string;
  /**
   * `approved` regions may carry a claim. `candidate` regions are clustered text
   * offered for angles nobody has framed yet, and must be opted into.
   *
   * `screen` is neither: it is the route's whole page, and it exists to be shown
   * rather than to prove anything. It is kept out of claim resolution on purpose.
   * Marked `approved` it did both of the things a full-page region should never
   * do -- it satisfied claims whose words live nowhere anybody vetted, which is
   * exactly what the approved/candidate split exists to prevent, and it covered
   * every clustered block so no candidate was ever offered again.
   */
  provenance: "approved" | "candidate" | "screen";
  x: number; y: number; width: number; height: number;
  aspect: number;
  trim?: number;
  text: string;
  words: InventoryWord[];
  // How well this region's text would survive a 1080-wide vertical frame.
  // Computed by the inventory builder, not here, because it is a property of the
  // capture rather than of any particular film.
  textHeightPx?: number;
  renderedTextPx?: number;
  legibility?: "ok" | "marginal" | "poor";
}
export interface InventoryScreen {
  asset: string;
  trim: number;
  width: number;
  height: number;
  elements: InventoryElement[];
  /**
   * The image these boxes were measured on, repo-relative.
   *
   * Carried here because it is the same fact as the geometry and had been
   * living somewhere else: the renderer loads `still-<asset>-<trim>.png` from a
   * shared public directory, capture writes `capture/<asset>.png`, and a person
   * copied between them. Two names for one picture with a hand in between is
   * how a film compiled against a fresh capture rendered the previous capture's
   * screens -- every crop correct, every pixel from another recording.
   */
  still?: string;
}
export interface ScreenInventory { schemaVersion: "1"; product: string; source: { width: number; height: number }; screens: InventoryScreen[] }

export interface ResolvedCrop {
  assetId: string;
  elementId: string;
  x: number; y: number; width: number; height: number;
  trim: number;
  discard: number;
  matchedTokens: string[];
}
export interface ResolveFailure { reason: "no_element_contains_tokens" | "no_fit_without_cutting_words"; tokens: string[]; considered: string[] }

// Margin around the words, in source pixels. Sized so the composition's 1.02
// focus scale cannot reach a glyph: at the widest region a source pixel is
// ~0.75 canvas pixels, and 1.02 pushes the edge out by ~1% of the region.
export const CROP_MARGIN = 14;
const MARGIN = CROP_MARGIN;

// Stopwords are dropped from claim tokens. A claim reads "Recruiting title at
// the target company", and requiring OCR to have produced "at" and "the" as
// separate confident words fails on phrasing rather than on evidence -- the
// resolver was rejecting regions that plainly contained the claim.
const STOPWORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "with", "your"]);
function normalise(text: string, dropStopwords = false) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  return dropStopwords ? words.filter((word) => !STOPWORDS.has(word)) : words;
}

// A token matches on word-prefix rather than equality: OCR renders "Recruiter"
// reliably but punctuation and case are noise, and a claim saying "recruiting"
// should find "Recruiting".
//
// Prefix matching is bounded at four characters in both directions. Unbounded,
// a two-letter OCR fragment satisfied any token starting with it -- "grouped"
// matched on a stray "g" and the resolver confidently returned a region of an
// unrelated screen. A claim matched by noise is worse than no match.
const MIN_PREFIX = 4;
function tokensPresent(haystack: string[], tokens: string[]) {
  return tokens.filter((token) => {
    const needle = token.toLowerCase();
    return haystack.some((word) =>
      word === needle
      || (needle.length >= MIN_PREFIX && word.startsWith(needle))
      || (word.length >= MIN_PREFIX && needle.startsWith(word)));
  });
}

// Words the crop neither shows whole nor leaves alone.
//
// Measured on the word grown by the guard, not on the word. A word wholly inside
// the rect by one pixel is "contained" by any strict comparison and still comes
// out shaved: the card has a border, the crop is drawn at three or four times
// source scale, and the composition's 1.02 focus push takes the rest. A rendered
// strip cut "Review before it reaches Gmail or Outlook" through the middle of
// its letterforms with the word's own box a pixel inside the crop, and nothing
// here objected -- the check said contained, the frame said clipped.
function bisected(rect: { x: number; y: number; width: number; height: number }, words: InventoryWord[]) {
  return words.filter((word) => {
    const left = word.x - GLYPH_GUARD, top = word.y - GLYPH_GUARD;
    const right = word.x + word.width + GLYPH_GUARD, bottom = word.y + word.height + GLYPH_GUARD;
    const intersects = left < rect.x + rect.width && right > rect.x && top < rect.y + rect.height && bottom > rect.y;
    const contained = left >= rect.x && top >= rect.y && right <= rect.x + rect.width && bottom <= rect.y + rect.height;
    return intersects && !contained;
  });
}

// Clearance, in source pixels, between a crop's edge and any word left outside
// it -- and between the edge and the words the crop exists to show.
//
// Snapping flush to a neighbour's OCR box is not clear of it. The box is tight
// to the ink tesseract found, glyph antialiasing runs a pixel or two past that,
// and the composition's 1.02 focus scale pushes the edge out again. A rendered
// strip carried three grey stubs along its top edge -- the descenders of the row
// above, snapped to exactly -- which is the "J off Jobs" defect from the other
// side: not a word cut in half, a word cut down to a smear.
export const GLYPH_GUARD = 4;

// A rect that holds every one of these words with the guard clear on all sides.
function holds(rect: { x: number; y: number; width: number; height: number }, words: readonly InventoryWord[]) {
  return words.every((word) =>
    word.x - GLYPH_GUARD >= rect.x && word.y - GLYPH_GUARD >= rect.y
    && word.x + word.width + GLYPH_GUARD <= rect.x + rect.width
    && word.y + word.height + GLYPH_GUARD <= rect.y + rect.height);
}

// Snap each edge past the words it bisects, rather than rejecting the crop.
//
// Rejecting was the first design and it does not survive contact with a real UI:
// checked against every word on the screen, almost any rect clips something at
// its border, so a five-token claim found no fit at all and a two-token one fell
// through to a region on a different screen. A dense product screen has no
// word-free gutters -- the crop has to be moved, not abandoned.
//
// Each edge only ever moves inward, past the word it was cutting. Picking the
// globally cheapest move -- in or out -- oscillated: clearing one word on the
// contact screen's 230 re-bisected another, and six passes ended where they
// began. Inward-only strictly shrinks the rect, so it terminates, and it can
// never grow into a word it had not already met.
//
// `keep` is what the crop is for. Without it the cheapest move is sometimes the
// one that steps over the claim's own words: the rect ends up beside the
// evidence rather than around it, `bisected` is satisfied because the words are
// now entirely outside, and every later measurement still grades the element's
// type as though it were on screen. So a move that would drop a kept word is
// passed over for the next-cheapest one that would not.
function snapClearOfWords(rect: { x: number; y: number; width: number; height: number }, words: InventoryWord[], keep: readonly InventoryWord[] = []) {
  // With words to hold, `holds` is the floor and a stricter one: the crop cannot
  // be smaller than the evidence plus its clearance. The absolute minimum is
  // only for a region OCR found nothing in, where there is nothing to measure
  // against and a sliver is the only thing left to guard against.
  const viable = (next: { x: number; y: number; width: number; height: number }) =>
    keep.length ? holds(next, keep) : next.width >= 40 && next.height >= 40;
  let current = { ...rect };
  for (let pass = 0; pass < 40; pass += 1) {
    const offenders = bisected(current, words);
    if (!offenders.length) return viable(current) ? current : null;
    const word = offenders[0]!;
    const left = current.x, right = current.x + current.width, top = current.y, bottom = current.y + current.height;
    const wordRight = word.x + word.width + GLYPH_GUARD, wordBottom = word.y + word.height + GLYPH_GUARD;
    const wordLeft = word.x - GLYPH_GUARD, wordTop = word.y - GLYPH_GUARD;
    const next = [
      { cost: wordRight - left, apply: () => ({ x: wordRight, y: top, width: right - wordRight, height: current.height }) },
      { cost: right - wordLeft, apply: () => ({ x: left, y: top, width: wordLeft - left, height: current.height }) },
      { cost: wordBottom - top, apply: () => ({ x: left, y: wordBottom, width: current.width, height: bottom - wordBottom }) },
      { cost: bottom - wordTop, apply: () => ({ x: left, y: top, width: current.width, height: wordTop - top }) }
    ].filter(({ cost }) => cost > 0).sort((a, b) => a.cost - b.cost)
      .map(({ apply }) => apply()).find(viable);
    if (!next) return null;
    current = next;
  }
  return bisected(current, words).length || !viable(current) ? null : current;
}

// Grow the region to the container's aspect. Growing rather than cropping is
// deliberate: cropping to fit is what cuts words, and the surrounding pixels are
// product UI, not emptiness, so a slightly larger window costs nothing.
function fitToAspect(region: { x: number; y: number; width: number; height: number }, aspect: number, bounds: { width: number; height: number }) {
  const current = region.width / region.height;
  let { x, y, width, height } = region;
  if (current < aspect) {
    const target = Math.min(bounds.width, height * aspect);
    x = Math.max(0, Math.min(bounds.width - target, x - (target - width) / 2));
    width = target;
  } else if (current > aspect) {
    const target = Math.min(bounds.height, width / aspect);
    y = Math.max(0, Math.min(bounds.height - target, y - (target - height) / 2));
    height = target;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

// The widest crop this region can produce for a given container.
//
// It is the width before `snapClearOfWords` runs, and snapping only ever moves
// an edge inward, so the real crop is never wider than this. That direction is
// the point: a capture plan budgeting against this number can promise that a
// region inside the budget will read, and never promise it about one that will
// not. Bounds clamping only narrows it further, so it is left out.
export function cropWidthForRegion(region: { width: number; height: number }, containerAspect: number) {
  const width = region.width + MARGIN * 2;
  const height = region.height + MARGIN * 2;
  return width / height < containerAspect ? height * containerAspect : width;
}

export function resolveCrop(
  inventory: ScreenInventory,
  claimTokens: string[],
  containerAspect: number,
  options: { assetId?: string; allowCandidates?: boolean } = {}
): ResolvedCrop | ResolveFailure {
  const tokens = claimTokens.flatMap((token) => normalise(token, true));
  const screens = options.assetId ? inventory.screens.filter((screen) => screen.asset === options.assetId) : inventory.screens;
  const considered: string[] = [];

  const scored = screens.flatMap((screen) => screen.elements
    // Never the page. A region spanning the whole route contains every word on
    // it, so it satisfies any claim asked of it and proves none of them.
    .filter((element) => element.provenance !== "screen")
    .filter((element) => options.allowCandidates || element.provenance === "approved")
    .map((element) => {
      considered.push(element.id);
      const matched = tokensPresent(normalise(element.text), tokens);
      return { screen, element, matched, area: element.width * element.height };
    }))
    .filter(({ matched }) => tokens.length === 0 || matched.length === tokens.length)
    // Smallest region that still contains every token. Ties break on the region
    // whose aspect is already closest to the container, which needs least growth.
    .sort((a, b) => a.area - b.area || Math.abs(a.element.aspect - containerAspect) - Math.abs(b.element.aspect - containerAspect));

  if (!scored.length) return { reason: "no_element_contains_tokens", tokens, considered };

  for (const { screen, element, matched } of scored) {
    const bounds = { width: screen.width, height: screen.height };
    const padded = {
      x: Math.max(0, element.x - MARGIN),
      y: Math.max(0, element.y - MARGIN),
      width: Math.min(bounds.width, element.width + MARGIN * 2),
      height: Math.min(bounds.height, element.height + MARGIN * 2)
    };
    // Every word on the screen, not only this element's: growing sideways can
    // reach into a neighbour and clip it.
    const allWords = screen.elements.flatMap(({ words }) => words);
    // The words that carry the claim are the ones the crop must still hold when
    // the snapping is done. Falling back to the element's own words when no
    // token matched keeps a tokenless resolve honest rather than unconstrained.
    const carries = matched.length
      ? element.words.filter(({ text }) => tokensPresent([...normalise(text)], matched).length)
      : element.words;
    const snapped = snapClearOfWords(fitToAspect(padded, containerAspect, bounds), allWords, carries);
    if (!snapped) continue;
    const fitted = { x: Math.round(snapped.x), y: Math.round(snapped.y), width: Math.round(snapped.width), height: Math.round(snapped.height) };
    if (bisected(fitted, allWords).length) continue;
    const shownScale = Math.max(containerAspect / (fitted.width / fitted.height), 1);
    return {
      assetId: screen.asset,
      elementId: element.id,
      ...fitted,
      trim: element.trim ?? screen.trim,
      discard: Number(Math.max(0, 1 - 1 / shownScale).toFixed(3)),
      matchedTokens: matched
    };
  }
  return { reason: "no_fit_without_cutting_words", tokens, considered };
}

export function isResolved(result: ResolvedCrop | ResolveFailure): result is ResolvedCrop {
  return "elementId" in result;
}

// Fills a blueprint's product crops by resolving each scene's claims against the
// inventory, in place of crops transcribed by hand.
//
// This is the join that makes a generated film possible: a scene says which
// claims it supports, the claim says which words prove it, and the inventory
// says where those words are. Nothing in the chain names a pixel rect.
//
// The container aspect comes from the scene's own declared product rect, so a
// crop is fitted to the card that will actually show it rather than to a guess.
// Patterns that draw several crops resolve one per claim and fall back to the
// claim's asset when a scene has fewer claims than card slots.
export interface CropResolutionIssue { sceneId: string; claimId?: string; reason: string; considered?: number }

export function resolveBlueprintCrops(
  blueprint: { scenes: Array<Record<string, unknown>> },
  inventory: ScreenInventory,
  claims: Array<{ id: string; assetIds?: string[]; requiredReadableText?: string[] }>,
  options: { allowCandidates?: boolean } = {}
) {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const issues: CropResolutionIssue[] = [];
  const scenes = blueprint.scenes.map((scene) => {
    const claimIds = (scene.supportedClaimIds as string[] | undefined) ?? [];
    const rects = (scene.layoutRects as SceneLayoutRectLike[] | undefined) ?? [];
    const product = rects.find(({ kind }) => kind === "product");
    // No product rect means the pattern draws no product -- `ambient` and the
    // CTA. Resolving a crop for those would put evidence where the beat wants
    // the presenter alone.
    if (!product || !claimIds.length) return scene;
    const aspect = ((product.right - product.left) * 1080) / ((product.bottom - product.top) * 1920);
    const resolved: Array<Record<string, unknown>> = [];
    for (const claimId of claimIds) {
      const claim = byId.get(claimId);
      if (!claim) { issues.push({ sceneId: String(scene.id), claimId, reason: "unknown_claim" }); continue; }
      for (const assetId of claim.assetIds?.length ? claim.assetIds : [undefined]) {
        const result = resolveCrop(inventory, claim.requiredReadableText ?? [], aspect, { assetId, allowCandidates: options.allowCandidates });
        if (!isResolved(result)) {
          issues.push({ sceneId: String(scene.id), claimId, reason: result.reason, considered: result.considered.length });
          continue;
        }
        if (resolved.some((crop) => crop.assetId === result.assetId && crop.x === result.x && crop.y === result.y)) continue;
        resolved.push({ assetId: result.assetId, x: result.x, y: result.y, width: result.width, height: result.height, trim: result.trim });
      }
    }
    if (!resolved.length) return scene;
    return { ...scene, productCrop: resolved[0], productCrops: resolved };
  });
  return { blueprint: { ...blueprint, scenes }, issues };
}

interface SceneLayoutRectLike { kind: string; left: number; top: number; right: number; bottom: number }
