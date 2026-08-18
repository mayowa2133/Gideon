import { type AngleBrief, type ScriptBeat } from "./angleBrief";
import { type SelectableClaim } from "./claimSelection";
import { MIN_SCENE_FRAMES, SCREEN_RECOGNISABLE_PX, SHOT_BANDS } from "./creatorStoryQuality";
import { GLYPH_GUARD as CROP_GUARD, resolveCrop, type InventoryElement, type ScreenInventory } from "./screenInventory";
import type { CreativeBlueprint, SceneComposition, SceneContentPattern, SceneLayoutRect } from "./types";

// Compiles a validated script into a blueprint the generic renderer can draw.
//
// The product-specific half -- brand kit, presenter rig, captured screens, the
// backdrop palette -- is taken from a reference blueprint rather than invented,
// because that is what "curated once, then any angle" means: the setup happened
// when the screens were captured and approved, and an angle costs nothing.
//
// What this decides is film structure: which shot each beat gets, what the
// screen behind it does, how long it holds, and which region of which screen
// proves it.

// Container aspects the templates draw into. These are not free numbers: the
// proof band's 2.47 came out of the edge-density work, where framing an
// editorial strip beat magnifying a whole card by every measure. A crop is
// resolved against the shape it will actually occupy, so cover-fit has nothing
// left to discard.
//
// Exported because the capture plan has to ask the same question with the same
// numbers. A plan that carried its own copy of the container geometry would be a
// second representation of one fact with no check between it and the film -- the
// shape of every legibility bug this file records.
export const CONTAINER_ASPECT: Record<string, number> = {
  evidence_band: 2.47, state_swap: 1.57, card_field: 1.6, composed_board: 1.55, filmstrip: 1.2, comment_card: 1.9, ambient: 1.6,
  // 5.5, and the number comes from the regions rather than from a preference.
  // A single line of product UI -- `contactRole` at 116x20, the most legible
  // region Solomon has -- is 3.0 once the crop margin is added, and every
  // container narrower than that grows the crop vertically to reach its aspect.
  // Vertical is the one direction a line of text has no room in: the name sits
  // above it and the chips below, `snapClearOfWords` refuses to cut either, and
  // the claim is dropped. Any aspect above 3.0 leaves the height alone; 5.5 is
  // far enough clear of it that a two-line region still fits, and near enough
  // that the band is not a hairline.
  wide_strip: 5.5,
  // The application's own shape. Solomon's content box is 1280x843 at the
  // capture viewport, which is 1.52. A page cropped far from its own aspect
  // stops looking like the page, which is the whole job of this shot.
  product_screen: 1.52
};

// A default shot for each kind of beat. Deliberately small: eight patterns are
// implemented and a generated film that reaches for all of them looks restless.
// An agent editing the blueprint can choose any implemented pair; this is what
// it gets without asking.
//
// `pattern` is the one the capture plan budgeted and `verify` measured for this
// claim, and it wins because the alternative is two answers to one question.
// The plan's framing budget, the crop the resolver returns and the card the
// template draws are all functions of the container aspect: pick a different
// pattern here and the shot on screen is not the shot that was proved legible.
export function defaultShot(
  beat: { spoken: boolean; claimId?: string },
  isLast: boolean,
  establishing: boolean,
  pattern?: SceneContentPattern
): Pick<SceneComposition, "shotType" | "contentPattern"> {
  if (isLast) return { shotType: "cta_end_card", contentPattern: "comment_card" };
  // Setting up a screen is the screen, at the size it really is -- the whole
  // page at once, so the tight cut that follows has somewhere to come from.
  if (establishing) return { shotType: "split_presenter_product", contentPattern: "product_screen" };
  if (!beat.claimId) return { shotType: "presenter_fullscreen", contentPattern: "ambient" };
  // A band is a band whether or not anyone speaks over it; what changes with
  // speech is whether the presenter is in the frame to say it.
  return beat.spoken
    ? { shotType: "split_presenter_product", contentPattern: pattern ?? "evidence_band" }
    : { shotType: "product_fullscreen", contentPattern: pattern ?? "evidence_band" };
}

// The geometry a pattern the reference film never drew has to be given.
//
// A generated scene inherits its rects from whichever reference scene draws the
// same pattern. That works for the seven V22 uses and cannot work for an eighth,
// and falling through to `scenes[0]` is worse than useless: the hook has no
// product rect at all, so the template would draw its band into a hardcoded
// default while the collision audit checked a rect nothing used.
//
// The numbers are the band's own. A 5.5 strip drawn across the 0.04-0.96 product
// column is 181px tall, so the rect is 211 -- the card plus air -- rather than
// the split's 710, which would leave a 500px hole beneath the strip. It sits at
// 0.30 rather than under the caption because the presenter is bottom-anchored at
// 1075px: centring the band in the space between the caption floor and the
// presenter's head is what keeps the frame from reading as empty at one end.
export const WIDE_STRIP_LAYOUT: SceneLayoutRect[] = [
  { id: "wide-strip-product", kind: "product", left: .04, top: .30, right: .96, bottom: .41 },
  { id: "wide-strip-mascot", kind: "mascot", left: .23, top: .56, right: .77, bottom: .975 },
  { id: "wide-strip-caption", kind: "caption", left: .05, top: .04, right: .95, bottom: .16 }
];
// The page gets the frame's whole upper two thirds and the presenter stands in
// front of its lower edge, which is the reference film's arrangement for the
// same shot: a 1010-wide page at 1.52 is 664 tall, so the rect is the card plus
// a little air, and the presenter's declared box starts below it.
export const PRODUCT_SCREEN_LAYOUT: SceneLayoutRect[] = [
  { id: "product-screen-product", kind: "product", left: .032, top: .175, right: .968, bottom: .545 },
  { id: "product-screen-mascot", kind: "mascot", left: .23, top: .56, right: .77, bottom: .975 },
  { id: "product-screen-caption", kind: "caption", left: .05, top: .04, right: .95, bottom: .16 }
];
const PATTERN_LAYOUT: Partial<Record<SceneContentPattern, SceneLayoutRect[]>> = {
  wide_strip: WIDE_STRIP_LAYOUT,
  product_screen: PRODUCT_SCREEN_LAYOUT
};

// How many beats ahead of a proof still show its screen. Claims are the only
// scenes that assert anything, but they are not the only scenes allowed to show
// the product: with four claims in an eighteen-beat film, binding product
// presence to claims alone left thirteen scenes as a presenter on a colour --
// 72% of the film with nothing in it. The reference stays on the product between
// proofs, wide, and cuts tight only when it has something to prove. That is
// ordinary film grammar and it costs no claim.
//
// One beat, not two. A lead of two put the same rect on two consecutive scenes,
// which is a still held across a cut no matter which template draws it -- the
// thing the composition-similarity gate exists to catch. Wide then tight is a
// pair; wide, wide, tight is a pause.
//
// This was zero, and the reasoning for zero was wrong in an instructive way. It
// said the screens have no pixels for an establishing shot, because 1.8x around
// a region that renders at 22px lands at 12. Both halves are true and the
// conclusion does not follow: 12px is a fine establishing shot. It is only a
// failure when measured with `READABLE_PX`, which is the floor for a band a
// viewer is asked to read a claim off. An establishing shot is asked to be
// recognised, not read, and the reference film's own widest product shots sit at
// 10-14px -- they would have failed that gate too.
//
// The other half of the mistake was framing. A 1.8x pull-back around a claim's
// region is an arbitrary zoom on a card; it looks like content and carries none,
// which is what the old comment correctly complained about. The establishing
// shot here is the route's own page, which looks like the product because it is.
const ESTABLISH_LEAD = 1;

// A template's options carry both how a scene is arranged and what it says. Only
// the first half transfers. Inheriting the reference scene's options wholesale
// put V22's chips -- "AVERY CHEN", "SENIOR TECHNICAL RECRUITER" -- on a
// generated film whose narration says no such thing, which is the same defect as
// a caption nobody speaks: words on screen that no line in this script supports.
const TEXT_OPTIONS = new Set(["labels", "pills", "headline", "lines", "caption", "title", "note"]);
function layoutOnly(options: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(options).filter(([key]) => !TEXT_OPTIONS.has(key)));
}

// Roughly how wide, in frame pixels, each template draws its product card. The
// numbers matter only as a ratio against the crop width, which is what decides
// how big the product's own type lands on screen.
export const CONTAINER_PX: Record<string, number> = {
  evidence_band: 1000, composed_board: 1000, card_field: 500, state_swap: 900, filmstrip: 320, comment_card: 900, ambient: 900,
  wide_strip: 1000, product_screen: 1010
};
// The floor a region's text must clear once it is drawn. `marginal` in the
// inventory is 20px and that is the same floor here, because it is the same
// question asked at the only moment that counts.
export const READABLE_PX = 20;

// What type of a given source size measures once a crop of a given width is
// drawn into a given template.
//
// The whole of the film's legibility is this one line, which is why the capture
// plan imports it rather than restating it. Note what is *not* in it: any term
// that scales with the capture's zoom. Magnifying the page grows the type and
// the crop together and the ratio does not move, so the only lever capture has
// is editorial -- frame the words that carry the claim and leave the card they
// sit in out of the shot.
export function renderedTextPxOnCrop(sourceTextPx: number, cropWidth: number, pattern: string) {
  return (sourceTextPx * (CONTAINER_PX[pattern] ?? 900)) / Math.max(1, cropWidth);
}

// A region's type height back in source pixels. The inventory stores the size it
// would reach at 1080 wide, which is a different number for every region width;
// undoing that is what makes two regions comparable.
export function sourceTextPxOf(element: InventoryElement, tokens: readonly string[] = []) {
  // Measured on the words that carry the claim, not on the median of everything
  // in the region.
  //
  // A contact card holds a large name and a row of small chips. The median lands
  // near the chips, so the card graded 4.8 source pixels and would have needed to
  // be drawn 1690px wide to clear the floor -- impossible in a 1080 frame at any
  // aspect, which made it look like the shot vocabulary was wrong when the metric
  // was. "Head of Marketing" is 10px in that same card and reads comfortably.
  //
  // A region is judged on whether its evidence can be read, and the evidence is
  // the tokens. Falls back to the median when nothing matches, because a claim
  // whose words cannot be found is a different failure and resolveCrop reports it.
  const matched = tokens.length
    ? element.words.filter(({ text }) => tokens.some((token) => text.toLowerCase().startsWith(token.toLowerCase().slice(0, 4))))
    : [];
  if (matched.length) {
    const heights = matched.map(({ height }) => height).sort((left, right) => left - right);
    return heights[Math.floor(heights.length / 2)]!;
  }
  // `textHeightPx` is this number, measured. Reconstructing it from
  // `renderedTextPx` -- which the inventory rounds to a whole pixel before
  // storing -- is a lossy round-trip of the same fact, and the loss is not
  // academic: a page whose type is 9.48 source pixels came back as 9.996 on a
  // crop budgeted to land it at exactly 10, so four establishing shots were
  // dropped for being a thousandth of a pixel under their floor.
  if (element.textHeightPx) return element.textHeightPx;
  return (element.renderedTextPx ?? 0) * (element.width / 1080);
}

// What the region's own type measures once this crop is drawn at this size.
//
// The inventory grades legibility on the region. The film draws a crop. Those
// are different rectangles and the grade does not survive the difference: the
// outreach board graded 22px, resolved to a full-width 1440px crop, and landed
// on screen at 7 -- a claim present and unreadable, which the grade exists to
// prevent and could not, because nothing re-asked the question after the crop
// was chosen.
function renderedOnCrop(element: InventoryElement, cropWidth: number, pattern: string, tokens: readonly string[] = []) {
  return renderedTextPxOnCrop(sourceTextPxOf(element, tokens), cropWidth, pattern);
}

// Every word the capture found on a screen, whichever region holds it. The page
// region carries them all, but a crop has to avoid words in regions it merely
// overlaps too.
function allWordsOn(inventory: ScreenInventory, assetId: string) {
  return inventory.screens.find(({ asset }) => asset === assetId)?.elements.flatMap(({ words }) => words) ?? [];
}

// Pull a screen crop's edges off any word they cut -- every edge but the right.
//
// Three of the four, and the exception is direction of reading. A page runs out
// of the right of the frame the way it runs out of the right of a browser
// window: the reference film's widest shot cuts five labels that way and it
// looks deliberate. Every other edge reads as damage. A horizontal edge through
// a line bisects every glyph in it at once -- the dashboard's four step labels
// came out sliced through their descenders. A left edge is worse still, because
// the left of a page is where its identity lives: panning the tracker sideways
// cut "Application Tracker" down to "Tracker", which is a shot whose whole job
// is to say what the product is, failing to say it.
//
// Same rule as `snapClearOfWords` without the token machinery that protects a
// claim this shot does not make. Iterated, because clearing one edge can bring a
// word on another into range, and every move shrinks the rect so it terminates.
function framedClearOfCutWords(
  crop: { x: number; y: number; width: number; height: number },
  words: readonly { x: number; y: number; width: number; height: number }[]
) {
  let current = { ...crop };
  for (let pass = 0; pass < 12; pass += 1) {
    const left = current.x, right = current.x + current.width;
    const top = current.y, bottom = current.y + current.height;
    const overlaps = (word: { x: number; y: number; width: number; height: number }) =>
      word.x - CROP_GUARD < right && word.x + word.width + CROP_GUARD > left
      && word.y - CROP_GUARD < bottom && word.y + word.height + CROP_GUARD > top;
    const cut = (edge: number, start: (word: { x: number; y: number; width: number; height: number }) => number, span: (word: { x: number; y: number; width: number; height: number }) => number) =>
      words.filter((word) => overlaps(word) && start(word) - CROP_GUARD < edge && start(word) + span(word) + CROP_GUARD > edge);
    const nextTop = cut(top, (word) => word.y, (word) => word.height).reduce((low, word) => Math.max(low, word.y + word.height + CROP_GUARD), top);
    const nextBottom = cut(bottom, (word) => word.y, (word) => word.height).reduce((high, word) => Math.min(high, word.y - CROP_GUARD), bottom);
    const nextLeft = cut(left, (word) => word.x, (word) => word.width).reduce((low, word) => Math.max(low, word.x + word.width + CROP_GUARD), left);
    if (nextTop === top && nextBottom === bottom && nextLeft === left) return current;
    current = { x: nextLeft, y: nextTop, width: Math.max(0, right - nextLeft), height: Math.max(0, nextBottom - nextTop) };
  }
  return current;
}

export interface AngleCompileIssue { sceneId?: string; reason: string; detail?: string }

export function compileAngleBlueprint(input: {
  brief: AngleBrief;
  script: readonly ScriptBeat[];
  claims: readonly SelectableClaim[];
  inventory: ScreenInventory;
  reference: CreativeBlueprint;
  shots?: Record<string, Pick<SceneComposition, "shotType" | "contentPattern">>;
}): { blueprint: CreativeBlueprint; issues: AngleCompileIssue[] } {
  const { brief, script, claims, inventory, reference } = input;
  const issues: AngleCompileIssue[] = [];
  const fps = 30;
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  // Which captured still to draw, taken from the inventory that produced it.
  //
  // This used to read the reference film's trim for the same asset, which is a
  // different film's frame of a different recording -- for a generated film it
  // pointed at V22's job-search footage, the exact thing angle-driven capture
  // exists to replace. It had to be hand-patched after every compile. The
  // inventory is built from the run that made the stills, so it is the only
  // thing that knows which frame they are.
  const trimFor = (assetId: string) => inventory.screens.find(({ asset }) => asset === assetId)?.trim
    ?? reference.scenes.find((scene) => scene.productCrop?.assetId === assetId)?.productCrop?.trim
    ?? 0;

  // Durations from speech, floored, then conserved. Settling every duration
  // before placing a single boundary is not a style choice: shifting boundaries
  // forward as you go cannot reclaim frames from a scene already behind you, and
  // that leak cost four frames of film the last time it was written the other way.
  const words = script.map((beat) => (beat.vo.trim() ? beat.vo.trim().split(/\s+/).length : 0));
  const spokenWords = words.reduce((sum, count) => sum + count, 0) || 1;
  // A scene carrying a claim needs time to be read, and reading time is not
  // speech time. Allocating purely by word count gave the one silent proof beat
  // the shortest scene in the film -- a second to take in the region it exists
  // to show. `minimumReadableDwellMs` is already on the scene for this; it just
  // has to reach the floor before the spare is shared out.
  const dwellFrames = Math.round((reference.scenes[0]!.minimumReadableDwellMs / 1000) * fps);
  const floors = script.map((beat) => MIN_SCENE_FRAMES + (beat.claimId ? dwellFrames : 0));
  const spare = brief.filmFrames - floors.reduce((sum, count) => sum + count, 0);
  if (spare < 0) {
    issues.push({ reason: "too_many_beats_for_duration", detail: `${script.length} beats need ${floors.reduce((sum, n) => sum + n, 0)} frames, film has ${brief.filmFrames}` });
  }
  // The failure that actually ships. Too many beats is loud -- the floors do not
  // fit and the arithmetic says so. Too few is silent: every scene simply gets
  // longer, nothing overflows, and the result is a slideshow. Six beats over
  // this film's running time is a mean shot of 6.4 seconds against a reference
  // band of 1.7 to 2.7, which no later gate can fix because the beats are gone
  // by then.
  const meanShotSeconds = brief.filmFrames / fps / Math.max(1, script.length);
  if (meanShotSeconds > SHOT_BANDS.meanShotSeconds[1]) {
    issues.push({ reason: "too_few_beats_for_pace", detail: `${script.length} beats hold ${meanShotSeconds.toFixed(1)}s each, band is ${SHOT_BANDS.meanShotSeconds.join("-")}s` });
  }
  const durations = words.map((count, index) => floors[index]! + Math.max(0, Math.round((spare * count) / spokenWords)));
  // Hand the rounding remainder to the longest scene, where a frame is invisible.
  const drift = brief.filmFrames - durations.reduce((sum, count) => sum + count, 0);
  const longest = durations.indexOf(Math.max(...durations));
  durations[longest] = (durations[longest] ?? 0) + drift;

  // Backdrop cadence: never twice in a row at the same tier. The gate that
  // checks this exists because a run of bright scenes reads as one long shot no
  // matter how the content changes.
  const palette = [...new Map(reference.scenes.flatMap((scene) => (scene.backdrop ? [[scene.backdrop.token, scene.backdrop] as const] : []))).values()];
  const byTier = (tier: string) => palette.filter((entry) => entry?.tier === tier);
  const cadence = ["bright", "mid", "deep"];

  let startMs = 0;
  // How many times each screen has already been established, so a film that
  // proves three things off one page does not show that page identically three
  // times.
  const established = new Map<string, number>();
  const scenes: SceneComposition[] = script.map((beat, index) => {
    const slot = brief.beats[index]!;
    const claim = beat.claimId ? claimById.get(beat.claimId) : undefined;
    // The screen this beat is heading towards, if a proof is close enough that
    // showing it now reads as setting up rather than as wandering.
    const establishing = claim ? undefined : script.slice(index + 1, index + 1 + ESTABLISH_LEAD)
      .map((ahead) => (ahead.claimId ? claimById.get(ahead.claimId) : undefined)).find(Boolean);
    const shot = input.shots?.[beat.id] ?? defaultShot(slot, index === script.length - 1, Boolean(establishing), claim?.contentPattern);
    // The claim was budgeted, cropped and measured at one container aspect. If
    // the scene ends up drawing a different one -- through an explicit `shots`
    // override, or a default that stopped agreeing with the plan -- then the
    // legibility this claim passed on belongs to a shot that is not on screen.
    // Two representations of one fact with no check between them is the shape of
    // every defect this file records, so the check is here.
    if (claim?.contentPattern && shot.contentPattern !== claim.contentPattern) {
      issues.push({ sceneId: beat.id, reason: "claim_pattern_mismatch", detail: `verified as ${claim.contentPattern}, drawn as ${shot.contentPattern}` });
    }
    const endMs = startMs + Math.round((durations[index]! / fps) * 1000);
    // Same pattern first, then same shot type, and `scenes[0]` only as a last
    // resort. A pattern the reference film does not draw used to land on the
    // hook -- presenter fullscreen, no product rect -- so the band was drawn
    // into a hardcoded default box while the collision audit checked a rect
    // nothing on screen corresponded to.
    const template = reference.scenes.find((scene) => scene.contentPattern === shot.contentPattern)
      ?? reference.scenes.find((scene) => scene.shotType === shot.shotType)
      ?? reference.scenes[0]!;
    const layoutRects = PATTERN_LAYOUT[shot.contentPattern!] ?? template.layoutRects;
    const tier = cadence[index % cadence.length]!;
    const options = byTier(tier);
    const backdrop = options[Math.floor(index / cadence.length) % Math.max(1, options.length)] ?? template.backdrop!;

    let productCrop: SceneComposition["productCrop"];
    if (!claim && establishing) {
      // The route's own page. Not a pull-back around the claim's card, which is
      // an arbitrary zoom that looks like content and carries none -- the page,
      // which looks like the product because it is the product.
      //
      // The crop is the screen region verbatim, narrowed only so the type lands
      // at the recognition floor. Nothing is resolved from tokens and nothing is
      // snapped clear of words: both exist to protect a claim's evidence, and
      // this shot has no claim to protect. What it must not do is silently
      // become unreadable, which is what the gate below is for -- and the gate
      // is `SCREEN_RECOGNISABLE_PX`, not `READABLE_PX`, because a shot asked to
      // be recognised and a shot asked to be read are not the same shot.
      const screen = inventory.screens.find(({ asset }) => asset === establishing.assetId);
      const page = screen?.elements.find(({ id }) => id === `${establishing.assetId}Screen`);
      if (screen && page) {
        const aspect = CONTAINER_ASPECT[shot.contentPattern ?? ""] ?? 1.52;
        const containerPx = CONTAINER_PX[shot.contentPattern ?? ""] ?? 1010;
        const sourceTextPx = sourceTextPxOf(page);
        // Widest crop whose type still reaches the floor, then the page's own
        // box clamped to it. The same inversion the proof budget does, against
        // the other floor.
        const widest = sourceTextPx > 0 ? (sourceTextPx * containerPx) / SCREEN_RECOGNISABLE_PX : page.width;
        let width = Math.min(page.width, Math.round(widest));
        let height = Math.min(page.height, Math.round(width / aspect));
        // A different framing each time the page is established.
        //
        // Three claims came off Solomon's dashboard, so the film established it
        // three times, and the crop is a function of the page alone -- the same
        // rect, three times, which reads as going back to a screenshot it already
        // showed.
        //
        // Closer, and lower down where the page is tall enough. Not sideways: a
        // left-aligned page keeps its identity on the left, and sliding the frame
        // right cut "Application Tracker" down to "Tracker" -- a shot whose whole
        // job is to say what the product is, failing to say it. Snapping the left
        // edge clear of the word instead only traded that for a narrower crop,
        // which is the fragment problem coming back. So the horizontal origin is
        // fixed at the content box's own left edge, where nothing starts before
        // it, and the variation is a push-in plus a scroll.
        const seen = established.get(establishing.assetId) ?? 0;
        established.set(establishing.assetId, seen + 1);
        const closer = [1, .78, .88][seen % 3]!;
        const drop = [0, 1, .5][seen % 3]!;
        width = Math.round(width * closer);
        height = Math.min(page.height, Math.round(width / aspect));
        const origin = { x: page.x, y: page.y + Math.round((page.height - height) * drop) };
        productCrop = {
          assetId: establishing.assetId,
          ...framedClearOfCutWords({ ...origin, width, height }, allWordsOn(inventory, establishing.assetId)),
          trim: trimFor(establishing.assetId)
        };
        const rendered = renderedTextPxOnCrop(sourceTextPx, width, shot.contentPattern ?? "");
        if (rendered < SCREEN_RECOGNISABLE_PX) {
          issues.push({ sceneId: beat.id, reason: "establishing_illegible", detail: `${Math.round(rendered)}px, floor is ${SCREEN_RECOGNISABLE_PX}` });
          productCrop = undefined;
        }
      } else if (screen) {
        // A surface captured before screens were recorded. Say so rather than
        // quietly drawing a presenter on a colour and calling it an establishing
        // shot.
        issues.push({ sceneId: beat.id, reason: "no_screen_region", detail: establishing.assetId });
      }
    }
    if (claim) {
      const aspect = CONTAINER_ASPECT[shot.contentPattern ?? ""] ?? 1.6;
      const resolved = resolveCrop(inventory, claim.requiredReadableText, aspect, { assetId: claim.assetId });
      if ("reason" in resolved) issues.push({ sceneId: beat.id, reason: "crop_unresolved", detail: resolved.reason });
      // `trim` names which captured still to show, and the wrong one is a blank
      // panel where the evidence should be -- a message not yet generated, a
      // tracker not yet updated. The recording moment is a property of the
      // screen, so it is carried over from wherever the reference film already
      // framed that asset rather than guessed at here.
      else {
        const element = inventory.screens.find(({ asset }) => asset === claim.assetId)?.elements.find(({ id }) => id === claim.elementId);
        const px = element ? renderedOnCrop(element, resolved.width, shot.contentPattern ?? "", claim.requiredReadableText) : READABLE_PX;
        // An unreadable proof is not a weaker proof, it is a shot claiming to
        // show something a viewer cannot see. Drop the picture and report it,
        // rather than render evidence nobody can read.
        if (px < READABLE_PX) {
          issues.push({ sceneId: beat.id, reason: "claim_illegible_at_crop", detail: `${claim.elementId} lands at ${Math.round(px)}px, floor is ${READABLE_PX}` });
        }
        else productCrop = {
        assetId: claim.assetId, x: resolved.x, y: resolved.y, width: resolved.width, height: resolved.height,
        trim: trimFor(claim.assetId)
        };
      }
    }

    const scene: SceneComposition = {
      ...template,
      id: beat.id,
      startMs,
      endMs,
      shotType: shot.shotType,
      contentPattern: shot.contentPattern,
      contentOptions: layoutOnly((shot.contentPattern === template.contentPattern ? template.contentOptions : {}) as Record<string, unknown>),
      presenter: { ...template.presenter, visible: shot.shotType !== "product_fullscreen" },
      productAssetIds: productCrop ? [productCrop.assetId] : [],
      supportedClaimIds: claim && productCrop ? [claim.id] : [],
      captions: [],
      typography: [],
      backdrop,
      background: { kind: backdrop.tier === "deep" ? "dark" : "light" },
      layoutRects,
      productCrop,
      // Both, and explicitly. The renderer prefers the plural array, so
      // spreading the reference scene carried its four crops straight past the
      // resolved one -- three of four proof beats drew the contact card no
      // matter which claim they were making. Every compile-time gate passed,
      // because they all read the blueprint and none read the film.
      productCrops: productCrop ? [productCrop] : []
    };
    startMs = endMs;
    return scene;
  });

  return {
    blueprint: {
      ...reference,
      id: `${reference.id}-${brief.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
      targetDurationMs: startMs,
      claimIds: claims.map((claim) => claim.id),
      scenes,
      compiledAt: new Date(0).toISOString()
    },
    issues
  };
}
