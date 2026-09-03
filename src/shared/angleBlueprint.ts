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
  product_screen: 1.52,
  // Same reasoning as wide_strip and for the same kind of region -- one line of
  // product text -- but tighter, because this pattern draws that line across the
  // whole frame rather than as a band with content above and below it. 4.0 still
  // clears the 3.0 floor where the resolver starts growing a crop vertically, so
  // the line above and below it are still not cut; it just carries less air,
  // which is what lets the type land larger for the same region.
  big_number: 4,
  // A feed card as the feed draws it. Wider than tall and close to the card's
  // own proportion, because the column is the shot: a crop grown to some other
  // aspect stops looking like a row in a list and starts looking like a panel.
  editorial_scroll: 3.1
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

// The story arc, as the presenter plays it.
//
// Every generated scene used to take its cue and its purpose from whichever V22
// reference scene supplied its template, so a sixteen-beat film ran one
// expression, one gesture pair and one narrative purpose from the hook to the
// CTA. `mascotFromCue` was never at fault: it reads a cue faithfully and already
// varies head, torso and limb timing by scene hash. It was being handed the same
// cue sixteen times, and no gate compares a scene's cue to its neighbour's.
//
// Positional, because the script is. A beat carrying no claim early in a film is
// stating the problem and the same beat late in it is banking the payoff; those
// are not the same performance, and the only thing that separates them is where
// they sit. The thresholds are the spec's own arc -- problem, then mechanism,
// then payoff -- rather than tuned numbers.
function beatPerformance(index: number, total: number, pattern: SceneContentPattern | undefined, hasClaim: boolean) {
  const position = total > 1 ? index / (total - 1) : 0;
  if (index === 0) return { purpose: "hook" as const, cue: { layout: "close_up" as const, expression: "excited" as const, gestureIntent: "open_hand" as const, eyeline: "camera" as const } };
  if (index === total - 1) return { purpose: "cta" as const, cue: { layout: "close_up" as const, expression: "confident" as const, gestureIntent: "emphasis" as const, eyeline: "camera" as const } };
  if (hasClaim) {
    // A reveal has no mascot rect by construction, so the presenter is not
    // merely unhelpful there, it has nowhere to stand.
    if (pattern === "big_number") return { purpose: "proof" as const, cue: { visible: false } };
    // Alternated so two proofs in a row are not the same picture, and the
    // eyeline follows the side the presenter is standing on.
    const right = index % 2 === 1;
    return {
      purpose: "proof" as const,
      cue: {
        layout: right ? ("split_right" as const) : ("split_left" as const),
        expression: "explanatory" as const, gestureIntent: "point" as const,
        eyeline: right ? ("product_left" as const) : ("product_right" as const)
      }
    };
  }
  // Alternated inside each section, because a section is several beats long and
  // holding one framing across all of them is the flat film this function exists
  // to fix -- the first cut of it played four consecutive problem beats as the
  // same close-up with both hands at rest. The emotion is what the section is
  // for and it stays; the framing and the hands are what stop it reading as one
  // held shot. `close_up` and `medium` resolve to different mascot roles, so the
  // alternation changes the composition and not just the pose.
  const alternate = index % 2 === 0;
  // `neutral` is what `mascotFromCue` turns into a concerned face, but only
  // where the purpose is `problem` -- which is why the early beats ask for
  // neutral and the late ones do not.
  if (position < .35) return {
    purpose: "problem" as const,
    cue: {
      layout: alternate ? ("close_up" as const) : ("medium" as const),
      expression: "neutral" as const,
      // An open palm on a concerned beat reads as "and what am I meant to do
      // with that", which is the question the section is asking.
      gestureIntent: alternate ? ("none" as const) : ("open_hand" as const),
      eyeline: "camera" as const
    }
  };
  if (position < .7) return {
    purpose: "demo" as const,
    cue: {
      layout: alternate ? ("medium" as const) : ("close_up" as const),
      expression: "explanatory" as const,
      gestureIntent: alternate ? ("open_hand" as const) : ("point" as const),
      eyeline: "camera" as const
    }
  };
  return {
    purpose: "payoff" as const,
    cue: {
      layout: alternate ? ("close_up" as const) : ("medium" as const),
      expression: "confident" as const,
      gestureIntent: alternate ? ("emphasis" as const) : ("open_hand" as const),
      eyeline: "camera" as const
    }
  };
}

// Which ground each kind of beat stands on.
//
// The film darkens into its reveals and lifts out of them: a problem beat sits
// on a mid tone, the proof it leads to is the darkest frame in the film, and the
// payoff comes back up. `deep` on a proof is what made the age reveal land in
// film 06 -- the same crop on a bright backdrop reads as a caption with a card
// under it.
// Ordered, not single, because the ground still has to change at every cut.
//
// Two adjacent scenes on one tier is a backdrop that does not move when the shot
// does, which reads as one long take and is the exact fault this change exists
// to remove -- so a purpose states a preference and yields when the beat before
// it already took that tier. Consecutive proofs are the common case: the first
// gets the dark frame the reveal wants, the second takes mid rather than
// flattening the pair.
const TIER_BY_PURPOSE: Record<string, readonly string[]> = {
  hook: ["bright", "mid"], problem: ["mid", "deep"], demo: ["bright", "mid"],
  proof: ["deep", "mid"], payoff: ["bright", "mid"], cta: ["bright", "mid"]
};

// Where the presenter stands, from what it is doing in the beat.
//
// The rect used to come from the content pattern alone, which meant two boxes
// did the whole film: one for scenes with a product and one for scenes without.
// Role varied -- hero_close, host, cameo_left -- and changed nothing on screen,
// because `mascotBoxForScene` reads the declared rect and the declared rect
// never asked. A sixteen-beat film drew the presenter at one of two sizes in one
// of two places, which is most of the frame holding still while the words moved.
//
// Scale is a consequence of the rect, not a field: the rig is fitted inside it
// and bottom-aligned, so a taller box is a bigger presenter. The rig's own
// aspect is about 0.69, and a rect matching it fits exactly in both directions
// and wastes nothing.
//
// Product scenes get less range than ambient ones and that is arithmetic rather
// than choice. The band under a product rect is ~0.41 of the canvas, which caps
// the fit at 0.89 whatever the width, so widening a hero there buys nothing --
// only the smaller sided variants actually differ.
const MASCOT_RECT: Record<string, { free: SceneLayoutRect; band: SceneLayoutRect }> = {
  // Dominant and high. 1.50x, the largest the frame takes without cropping.
  close_up: {
    free: { id: "mascot", kind: "mascot", left: .07, top: .135, right: .93, bottom: .838 },
    band: { id: "mascot", kind: "mascot", left: .18, top: .56, right: .82, bottom: .975 }
  },
  // Mid shot, standing on the floor of the frame.
  medium: {
    free: { id: "mascot", kind: "mascot", left: .213, top: .501, right: .787, bottom: .97 },
    band: { id: "mascot", kind: "mascot", left: .23, top: .56, right: .77, bottom: .975 }
  },
  // Small and pushed aside, leaving the rest of the frame to what it is looking at.
  split_left: {
    free: { id: "mascot", kind: "mascot", left: .03, top: .684, right: .386, bottom: .975 },
    band: { id: "mascot", kind: "mascot", left: .04, top: .70, right: .38, bottom: .975 }
  },
  split_right: {
    free: { id: "mascot", kind: "mascot", left: .614, top: .684, right: .97, bottom: .975 },
    band: { id: "mascot", kind: "mascot", left: .62, top: .70, right: .96, bottom: .975 }
  }
};

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
// The reveal's geometry. The crop sits across the middle third and there is no
// mascot rect, which is the one place in this map that is a statement rather
// than a measurement: the pattern exists so the frame can hold one value and
// nothing else, and a rect is an invitation to put a presenter in it. A scene
// that wants Solomon in shot with its number wants `wide_strip`.
//
// The band is centred rather than pushed up under the caption because this is
// the only pattern with nothing beneath it -- leaving the lower half empty and
// the number high reads as a layout that lost its presenter.
// The headline and provenance a `big_number` scene draws.
//
// The headline is the tail of the captured line, not the whole of it. A feed
// renders "mercury · 1 week ago" as one cell, and the half that carries the
// claim is the age: setting the employer at reveal scale would put a company
// name in 200px type on a beat that is not about the company. Split on the
// product's own separator, keep what follows it, and fall back to the whole
// string when there is nothing to split -- a region that is only a value, like
// a count, is already the thing to show.
function bigNumberOptions(inventory: ScreenInventory, claim?: { assetId: string; elementId: string }) {
  if (!claim) return {};
  const element = inventory.screens.find(({ asset }) => asset === claim.assetId)?.elements.find(({ id }) => id === claim.elementId);
  const captured = element?.sourceText ?? element?.text;
  if (!captured) return {};
  const tail = captured.split(/\s[·|]\s/).pop()!.trim();
  return { headline: (tail || captured).trim() };
}

// What a scene is allowed to say about where its evidence came from.
//
// Applied to every claim rather than only to the reveal, because the reveal was
// never the only frame making an assertion -- it was just the loudest. A band
// showing a captured count is the same kind of statement at a smaller size, and
// the date is what the statement is actually good for.
function evidenceProvenance(inventory: ScreenInventory, relation: "same" | "different" | undefined, claim?: { assetId: string }) {
  if (!claim) return {};
  return {
    // Date only. The capture's timestamp is to the millisecond and a viewer
    // reading a frame needs the day, which is the unit the claim is good for.
    ...(inventory.capturedAt ? { capturedOn: inventory.capturedAt.slice(0, 10) } : {}),
    ...(relation ? { captureRelation: relation } : {})
  };
}


export const BIG_NUMBER_LAYOUT: SceneLayoutRect[] = [
  { id: "big-number-product", kind: "product", left: .06, top: .38, right: .94, bottom: .60 },
  { id: "big-number-caption", kind: "caption", left: .05, top: .04, right: .95, bottom: .16 }
];
// The column runs the height of the frame under the caption. No mascot rect:
// the feed is the subject here and a presenter standing in front of a moving
// list is a presenter standing in front of the shot.
export const EDITORIAL_SCROLL_LAYOUT: SceneLayoutRect[] = [
  { id: "scroll-product", kind: "product", left: .04, top: .19, right: .96, bottom: .93 },
  { id: "scroll-caption", kind: "caption", left: .05, top: .04, right: .95, bottom: .16 }
];
const PATTERN_LAYOUT: Partial<Record<SceneContentPattern, SceneLayoutRect[]>> = {
  editorial_scroll: EDITORIAL_SCROLL_LAYOUT,
  wide_strip: WIDE_STRIP_LAYOUT,
  product_screen: PRODUCT_SCREEN_LAYOUT,
  big_number: BIG_NUMBER_LAYOUT
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
  wide_strip: 1000, product_screen: 1010,
  // The widest of any pattern, and the point of it: the same region that lands
  // at 1000px as a band lands ~1.9x larger here, because the crop is tighter
  // (aspect 4 against 5.5) and drawn wider. That ratio is what makes a 12px
  // product line read at reveal scale without the film retypesetting it.
  big_number: 1900,
  // Near the frame's full width. The cards are stacked in one column and read at
  // the size a phone would show them, which is the whole point of the format.
  editorial_scroll: 940
};
// The floor a region's text must clear once it is drawn. `marginal` in the
// inventory is 20px and that is the same floor here, because it is the same
// question asked at the only moment that counts.
export const READABLE_PX = 20;

// Where a filmed sequence's stills are numbered from. Far clear of any real
// capture trim, so `still-<asset>-<trim>.png` for a sequence can never collide
// with the single still the same screen's proof shots draw.
export const MOTION_TRIM_BASE = 1000;
// The screen as it was before its interaction, on a trim of its own.
//
// It cannot share the sequence's base. Stills are published under
// `<asset>-<trim>`, the sequence publishes frame i at MOTION_TRIM_BASE + i*step,
// and a crop asking for MOTION_TRIM_BASE without motion loses the key to the one
// with it -- so a "before" addressed there was overwritten by burst frame 00,
// which on the marketing feed is a blank cell mid-reload. Below the base and
// clear of every published frame.
export const RESTING_TRIM = 900;

// How many proofs a recap needs before it reads as a row rather than a mistake.
// Two cards with a marker travelling between them is not a strip, it is a pair
// with a dot.
const FILMSTRIP_MINIMUM = 3;
// How many cards the row holds before they stop being legible as proofs.
const FILMSTRIP_CARDS = 4;
// The proof grid's size, and the reason it can hold what the strip could not.
//
// `card_field`'s grid sizes every card from its crop's own aspect and never
// cover-fits, so a 12:1 band lands as a short wide card with all of its words --
// which is exactly the crop the filmstrip had to give up on. Four in two columns
// of a 1000px box leaves each card 487 wide, magnifying a band rather than
// shrinking it.
// A column reads as a list at three cards and not at two, which is a pair.
const SCROLL_MINIMUM = 3;
const CARD_FIELD_MINIMUM = 3;
const CARD_FIELD_CARDS = 4;

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
  // The last asset each pattern drew from, filled in as the scenes are built.
  //
  // Compared per pattern rather than against the film's first claim, because the
  // confusion this guards against is specific: two ages set in the same
  // treatment, one after the other, read as one listing being refreshed. A count
  // or a sort control drawn from a second search invites no such reading, and
  // flagging those was noise that also weakened the one frame where the
  // disclosure carries weight -- the first cut marked three scenes and the
  // comparison itself was only one of them.
  const lastAssetByPattern = new Map<string, string>();
  // How many beats have already drawn on each tier, so a run of one purpose
  // still moves through that tier's palette.
  const tierSeen = new Map<string, number>();
  let previousTier: string | undefined;
  const scenes: SceneComposition[] = script.map((beat, index) => {
    const slot = brief.beats[index]!;
    const claim = beat.claimId ? claimById.get(beat.claimId) : undefined;
    // The screen this beat is heading towards, if a proof is close enough that
    // showing it now reads as setting up rather than as wandering.
    // The hook is never an establishing shot.
    //
    // It became one by accident: a beat with no claim becomes establishing when
    // the next beat has one, and at ten claims the beat after the hook always
    // does -- so the film opened cold on a screenshot of the application. The
    // hook is the one beat that is not about the product. It names the change in
    // the viewer's terms and it is where a viewer decides whether to stay, so it
    // is the presenter and nothing else.
    const establishing = claim || index === 0 ? undefined : script.slice(index + 1, index + 1 + ESTABLISH_LEAD)
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
    const patternRects: SceneLayoutRect[] = PATTERN_LAYOUT[shot.contentPattern!] ?? template.layoutRects ?? [];
    const performance = beatPerformance(index, script.length, shot.contentPattern, Boolean(claim));
    // Tier from what the beat is doing, not from its position in the film.
    //
    // It was `cadence[index % 3]`, which changed the ground every beat and meant
    // nothing by it: a reveal could land on the brightest backdrop in the
    // palette and a payoff on the darkest, purely by parity. Purpose reads the
    // other way round -- the film darkens into its reveals and lifts out of
    // them -- which is the difference between a background that rotates and one
    // that is doing something.
    //
    // Rotation is kept inside the tier rather than lost. Several beats in a row
    // share a purpose (four problem beats is normal), so the option advances per
    // occurrence of the tier and consecutive beats still change colour.
    // Replaced rather than added, and only where the pattern declared one: a
    // pattern with no mascot rect (the reveal) is stating that the presenter has
    // nowhere to stand, which is a decision this must not overturn.
    const roleRect = performance.cue.layout ? MASCOT_RECT[performance.cue.layout] : undefined;
    const hasProduct = patternRects.some(({ kind }) => kind === "product");
    const layoutRects = roleRect && patternRects.some(({ kind }) => kind === "mascot")
      ? patternRects.map((rect) => (rect.kind === "mascot" ? (hasProduct ? roleRect.band : roleRect.free) : rect))
      : patternRects;

    const preferred = TIER_BY_PURPOSE[performance.purpose] ?? ["mid", "bright"];
    const tier = preferred.find((candidate) => candidate !== previousTier) ?? preferred[0]!;
    previousTier = tier;
    const options = byTier(tier);
    const seen = tierSeen.get(tier) ?? 0;
    tierSeen.set(tier, seen + 1);
    const backdrop = options[seen % Math.max(1, options.length)] ?? template.backdrop!;

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
          trim: trimFor(establishing.assetId),
          // The filmed interaction plays here and only here.
          //
          // The crop rect is measured on the settled page, and the motion frames
          // are that page mid-interaction -- content sits at a different offset
          // in them. A whole-page shot absorbs that: the drift *is* the product
          // working, a list narrowing inside a frame that holds still. A tight
          // proof band would instead slide off the words it exists to show, so
          // claims keep their frozen, aligned crop.
          // A sequence gets its own trim base so it cannot overwrite the still
          // the proof cuts to.
          //
          // Published at `trim + i * step` from trim 0, the sequence's first
          // frame lands on `still-<asset>-0.png` -- which is the canonical still
          // every other crop of that screen draws. The film verified its draft
          // claim at 20.3px and then rendered an empty white band, because the
          // still underneath it had been replaced by a photograph of the
          // composer before anybody had selected anything.
          ...(screen.motion
            ? {
              trim: MOTION_TRIM_BASE,
              motion: { frames: screen.motion.frames, step: screen.motion.step, hold: screen.motion.hold }
            }
            : {})
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

    // A claim asking for `state_swap` on a surface that was filmed becomes the
    // two ends of that interaction, held side by side rather than played.
    //
    // The footage is the same burst the establishing shots animate; what differs
    // is the reading. A sequence playing through shows that something changed
    // and is gone in four hundred milliseconds. Two frozen states under BEFORE
    // and AFTER let a viewer compare the counts either side of a filter, which
    // is the claim -- "narrowing the search changes what is in it" -- and a shot
    // nobody can pause is a poor place to make it.
    //
    // Both ends address plain trims, so neither crop carries `motion`: the burst
    // starts at MOTION_TRIM_BASE and the settled screenshot is trim 0. Pairing
    // the first burst frame with the settled still spans the whole interaction
    // rather than two arbitrary points inside it.
    const swapPair = shot.contentPattern === "state_swap" && productCrop
      && inventory.screens.find(({ asset }) => asset === productCrop!.assetId)?.motion
      ? [{ ...productCrop, trim: RESTING_TRIM, motion: undefined }, { ...productCrop, trim: 0, motion: undefined }]
      : undefined;
    const previousAsset = shot.contentPattern ? lastAssetByPattern.get(shot.contentPattern) : undefined;
    const captureRelation = claim && previousAsset ? (previousAsset === claim.assetId ? "same" as const : "different" as const) : undefined;
    if (claim && shot.contentPattern) lastAssetByPattern.set(shot.contentPattern, claim.assetId);
    const scene: SceneComposition = {
      ...template,
      id: beat.id,
      startMs,
      endMs,
      shotType: shot.shotType,
      contentPattern: shot.contentPattern,
      contentOptions: {
        ...layoutOnly((shot.contentPattern === template.contentPattern ? template.contentOptions : {}) as Record<string, unknown>),
        // A reveal sets the captured region's own words in type, with the crop
        // kept under it as the receipt. Read here rather than in the template
        // because this is where the inventory is in scope, and because a
        // headline the renderer invented would be exactly the thing the pattern
        // exists to avoid.
        ...evidenceProvenance(inventory, captureRelation, claim),
        ...(shot.contentPattern === "big_number" ? bigNumberOptions(inventory, claim) : {}),
        // Late enough in the scene that the before state is read before it is
        // replaced, and early enough that the after state is not a flash. The
        // pills name the two ends; StateSwapTemplate tracks which is live.
        ...(swapPair ? { swapAt: 0.55, pills: ["BEFORE", "AFTER"] as [string, string] } : {})
      },
      purpose: performance.purpose,
      // The template still supplies crop, scale, disclosure and provenance --
      // everything about how the presenter is composited. What is overridden is
      // only what it is doing, which is the half the template cannot know.
      presenter: {
        ...template.presenter,
        visible: shot.shotType !== "product_fullscreen",
        ...performance.cue
      },
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
      productCrops: swapPair ?? (productCrop ? [productCrop] : [])
    };
    startMs = endMs;
    return scene;
  });

  // The recap: every piece of evidence the film just showed, in a row, with the
  // marker travelling between them.
  //
  // This is the reference film's signature shot and the generated one had never
  // drawn it -- `filmstrip`, `card_field` and `state_swap` are all implemented
  // and `defaultShot` reaches for none of them, so eighteen beats resolve onto
  // three patterns and the film has one idea about what a shot is. The strip is
  // the one worth having without inventing anything: it needs no copy, no second
  // capture and no arrangement nobody asked for, because its content is the
  // film's own proofs in the order it made them.
  //
  // It carries no `supportedClaimIds`. Each of these crops already proved its
  // claim on its own beat; claiming them again here would count one piece of
  // evidence twice.
  // Four, like the reference, and for the same reason: the strip is sized from a
  // shared height inside a 1000px budget, so six proofs are 160px cards and the
  // row stops reading as evidence. One per screen where possible, so the recap
  // is four different places in the product rather than one page four times.
  // The recap is built from the page shots, not the proof bands.
  //
  // Proof bands were the obvious choice and they render wrong: the strip sizes
  // cards from a shared height and cover-fits them, so a 12:1 band drawn into a
  // near-square card discards most of its width. Four cards came out reading
  // "Growth Mark", "Message to Aver", "Resp" and "First Win Pa" -- four cut
  // words, which is the one thing this pipeline refuses everywhere else.
  //
  // Honouring the bands' own aspects is no better: four of them at a shared
  // height need 27 times that height in width, so a 1000px row makes them 37px
  // tall. A page crop is about 1.5:1, four fit at a readable height, and the
  // recap says something truer anyway -- four places in the product rather than
  // four fragments of one.
  type Crop = NonNullable<SceneComposition["productCrop"]>;
  // A spare beat is one carrying no claim -- which at ten claims means an
  // establishing shot, not an empty one. The recap used to demand a beat drawing
  // nothing and silently vanished the moment claim count rose.
  // The three composed shots pick their beats in one pass.
  //
  // They used to search independently and apply as they went, and the recap --
  // which runs first and collects the page shots the film establishes -- kept a
  // screen that a later shot then took the beat of. The strip recapped a page
  // the film no longer showed. Allocate first, then apply, so every shot is
  // choosing against the same scene list.
  //
  // A beat drawing filmed motion is spent last: Solomon only moves when it is
  // used, so a moving shot is scarcer than any of these still compositions.
  const spareBeats = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene, index }) => index > 0 && index < scenes.length - 1 && !scene.supportedClaimIds.length)
    .filter(({ scene }) => !scene.productCrop?.motion)
    .map(({ index }) => index);
  // Swap and grid land mid-argument, in that order; the recap closes.
  // The scroll takes the first spare beat, ahead of the swap and the grid.
  //
  // It is the only one of the three that shows the surface rather than a claim
  // about it, so a film that can afford exactly one composed shot should spend
  // it here -- and unlike the others it degrades gracefully: with fewer than
  // three crops it simply does not appear.
  const scrolled = scenes.flatMap((scene) => (scene.supportedClaimIds.length && scene.productCrop ? [scene.productCrop] : []));
  const scrollIndex = scrolled.length >= SCROLL_MINIMUM ? (spareBeats[0] ?? -1) : -1;
  const swapIndex = spareBeats.find((index) => index !== scrollIndex) ?? -1;
  const fieldIndex = spareBeats.find((index) => index !== swapIndex && index !== scrollIndex) ?? -1;
  const recapIndex = [...spareBeats].reverse().find((index) => index !== swapIndex && index !== fieldIndex && index !== scrollIndex) ?? -1;

  // Every crop the film proved, stacked and travelled.
  //
  // Not deduplicated by asset, unlike the grid: two cards from one feed are two
  // openings, and collapsing them would turn the shot the format exists for --
  // a list with things in it -- back into one card per screen.
  //
  // Claims nothing. Each crop was proved on its own beat and the column asserts
  // no new fact; what it adds is that these are rows in a feed rather than
  // isolated findings.
  if (scrollIndex > 0) {
    scenes[scrollIndex] = {
      ...scenes[scrollIndex]!,
      shotType: "product_fullscreen",
      contentPattern: "editorial_scroll",
      layoutRects: EDITORIAL_SCROLL_LAYOUT,
      presenter: { ...scenes[scrollIndex]!.presenter, visible: false },
      productAssetIds: [...new Set(scrolled.map(({ assetId }) => assetId))],
      productCrop: scrolled[0],
      productCrops: scrolled
    };
  }
  // The film's proofs, all at once.
  //
  // `card_field` was implemented and nothing ever selected it, so eighteen beats
  // drew one proof at a time and then recapped the screens they came from. What
  // it adds is the argument seen whole: four bands the film has already earned,
  // side by side, each still readable because the grid honours each crop's
  // aspect instead of cover-fitting it.
  //
  // Claims nothing, for the reason the recap claims nothing: each of these was
  // proved on its own beat, and counting it here would count one proof twice.
  const perClaim = new Map<string, Crop>();
  for (const scene of scenes) {
    if (!scene.supportedClaimIds.length || !scene.productCrop) continue;
    if (!perClaim.has(scene.productCrop.assetId)) perClaim.set(scene.productCrop.assetId, scene.productCrop);
  }
  const earned = [...perClaim.values()].slice(0, CARD_FIELD_CARDS);
  // The first spare beat rather than the last, so the grid lands mid-argument
  // and the recap still closes -- and never the beat the recap took.
  //
  // That last guard cannot currently fire and is kept anyway. The recap needs
  // three page shots, three page shots mean three establishing beats, and an
  // establishing beat carries no claim -- so whenever a recap exists there are
  // at least three beats for the grid to choose from and it can never want the
  // recap's. Tried to write the test that fails without it: a film packed to a
  // single spare beat has no page shots either, so it has no recap to eat. The
  // guard is one comparison against a future where the recap's terms change.
  if (earned.length >= CARD_FIELD_MINIMUM && fieldIndex > 0) {
    // The reference's OWN grid, not just its first card_field.
    //
    // `card_field` covers three arrangements and they are different pictures:
    // `friction` flanks the presenter, `collapse` converges on one result, and
    // only `five` lays out a grid. Matching on pattern alone took `friction`'s
    // rects -- a mascot box and no product box -- so the grid was drawn into a
    // default rect with the presenter on top of it, and the bottom two cards
    // came out behind a robot's head. The pattern is not the shot; the pair is.
    const template = reference.scenes.find((scene) =>
      scene.contentPattern === "card_field" && scene.contentOptions?.arrangement === "grid");
    scenes[fieldIndex] = {
      ...scenes[fieldIndex]!,
      // Fullscreen, as the reference draws its grid. A grid needs the whole
      // band: split with the presenter, the second row lands on the mascot.
      shotType: "product_fullscreen",
      contentPattern: "card_field",
      layoutRects: template?.layoutRects ?? scenes[fieldIndex]!.layoutRects,
      // Grid, not the reference's flank or converge: those crowd the presenter
      // or collapse onto a single result, and this shot's job is to let four
      // proofs be read together.
      contentOptions: { ...scenes[fieldIndex]!.contentOptions, arrangement: "grid", placeholders: 0 },
      productAssetIds: [...new Set(earned.map(({ assetId }) => assetId))],
      productCrop: earned[0],
      productCrops: earned
    };
  }

  // The composer before and after, as one shot.
  //
  // `state_swap` was the last implemented pattern nothing selected. The film
  // could say Solomon writes the message and could show the written message;
  // what it could not show was the change -- and cause and effect is the whole
  // point of the pattern, which is why the reference spends a beat on it.
  //
  // The pair comes from `becomes`, declared on the surface, because nothing a
  // capture records can infer it: both states carry the same route, and this
  // film draws the after on beat 2 and the before on beat 13.
  //
  // No pills and no cursor. The reference names its two states either side of
  // an arrow -- APPLIED, INTERVIEWING -- and that text is the reference's, not
  // this product's. The crops already say what they are.
  const states = new Map<string, Crop>();
  for (const scene of scenes) {
    if (!scene.supportedClaimIds.length || !scene.productCrop) continue;
    if (!states.has(scene.productCrop.assetId)) states.set(scene.productCrop.assetId, scene.productCrop);
  }
  const becomesOf = new Map(inventory.screens.map((screen) => [screen.asset, screen.becomes]));
  const pair = [...states.entries()]
    .map(([assetId, crop]) => {
      const after = becomesOf.get(assetId);
      const next = after ? states.get(after) : undefined;
      return next ? ([crop, next] as const) : undefined;
    })
    .find(Boolean);
  if (pair && swapIndex > 0) {
    const template = reference.scenes.find((scene) => scene.contentPattern === "state_swap");
    scenes[swapIndex] = {
      ...scenes[swapIndex]!,
      shotType: "split_presenter_product",
      contentPattern: "state_swap",
      layoutRects: template?.layoutRects ?? scenes[swapIndex]!.layoutRects,
      contentOptions: { ...scenes[swapIndex]!.contentOptions, arrangement: "row", swapAt: 0.45 },
      productAssetIds: pair.map(({ assetId }) => assetId),
      productCrop: pair[0],
      productCrops: [...pair]
    };
  }

  // The recap goes last, so it recaps the film as it finally stands.
  //
  // It draws the page shots the film establishes, and the swap and the grid each
  // take an establishing beat -- so collecting before they ran left the strip
  // holding a card for a screen the film no longer showed.
  const perScreen = new Map<string, Crop>();
  for (const [index, scene] of scenes.entries()) {
    // Not the beat the recap is about to take. That beat is an establishing shot
    // right up until this replaces it, and a strip that recaps the screen whose
    // place it took is recapping something the finished film never shows.
    //
    // Measured on the real film: every recap card was a screen the film still
    // established after this, and one was not before it. Not covered by a test
    // -- in the fixture used here the recap's beat is not an establishing shot,
    // so an assertion written against it passes with this line removed.
    if (index === recapIndex) continue;
    if (scene.contentPattern !== "product_screen" || !scene.productCrop) continue;
    if (!perScreen.has(scene.productCrop.assetId)) perScreen.set(scene.productCrop.assetId, scene.productCrop);
  }
  const proved = [...perScreen.values()].slice(0, FILMSTRIP_CARDS);
  if (proved.length >= FILMSTRIP_MINIMUM && recapIndex > 0) {
    const template = reference.scenes.find((scene) => scene.contentPattern === "filmstrip");
    // Each card says which screen it is, in the product's own words.
    //
    // The reference labels its four cards and the labels carry the meaning,
    // because a card at this size is a token rather than something anybody
    // reads. This film had no source of short screen names it could use without
    // inventing copy -- `tracker_after` is the capture's vocabulary, not the
    // application's -- so its strip said nothing. The route is the name the
    // product already uses, and a viewer could type it.
    //
    // A card whose screen has no route carries no label rather than a made-up
    // one, and the template skips those.
    const routeOf = new Map(inventory.screens.map((screen) => [screen.asset, screen.route]));
    const labels = proved.map(({ assetId }) => routeOf.get(assetId) ?? "");
    scenes[recapIndex] = {
      ...scenes[recapIndex]!,
      shotType: "split_presenter_product",
      contentPattern: "filmstrip",
      layoutRects: template?.layoutRects ?? scenes[recapIndex]!.layoutRects,
      contentOptions: { ...scenes[recapIndex]!.contentOptions, ...(labels.some(Boolean) ? { labels } : {}) },
      productAssetIds: [...new Set(proved.map(({ assetId }) => assetId))],
      productCrop: proved[0],
      productCrops: proved
    };
  }

  // The CTA says the handle it was given, or draws none.
  //
  // `CommentCardTemplate` falls back to "@" plus the product name when no label
  // is supplied, which put `@SOLOMON` on the last frame of a film made to be
  // posted -- a handle nobody had supplied, presented as the brand's. The
  // keyword typed into the comment box is the product's name, which the film
  // does know; the handle is not derivable from it and is only drawn when the
  // brief carries one.
  if (brief.handle) {
    const cta = scenes.at(-1);
    if (cta?.contentPattern === "comment_card") {
      scenes[scenes.length - 1] = {
        ...cta,
        contentOptions: { ...cta.contentOptions, labels: [brief.product.toUpperCase(), brief.handle] }
      };
    }
  }

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
