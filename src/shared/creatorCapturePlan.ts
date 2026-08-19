import { INJECTION_SHAPES, planBeats } from "./angleBrief";
import { CONTAINER_ASPECT, CONTAINER_PX, READABLE_PX, defaultShot, renderedTextPxOnCrop, sourceTextPxOf } from "./angleBlueprint";
import { candidateTokens, type SelectableClaim } from "./claimSelection";
import { CROP_MARGIN, cropWidthForRegion, isResolved, resolveCrop, type ScreenInventory } from "./screenInventory";
import type { SceneContentPattern } from "./types";

// Turns an angle into the capture run that would prove it.
//
// This inverts the first stage. The screen inventory was a library built once
// from a previous film's capture run and consulted by every angle afterwards,
// and both of its failure modes shipped in the same render:
//
//   Wrong data. A film about a marketing internship showed "Product Engineer at
//   Northstar Labs" in the tracker and "Senior Technical Recruiter" in the
//   contact card, because that is what was on screen when somebody recorded a
//   different video about a job search.
//
//   Wrong framing. Those regions were hand-picked to be shown as tight bands in
//   that film. Put through generic crop resolution they do not survive: three of
//   the four claims the inventory offers land at 7px, 10px and 19px against a
//   20px floor, and the compiler drops them. One legible product shot in 47
//   seconds.
//
// The second one is the more interesting failure, because it is a capture-time
// problem that was only ever discovered at render time. So the plan states, per
// claim, the pixel budget the captured region has to fit inside for the crop
// that will be drawn from it to stay readable -- before a browser is opened.
//
// The plan does not call a model. Like the brief, it is a document the agent
// running the pipeline writes against: it says which of the product's paths to
// walk, what data must be seeded on each, which element carries the claim, and
// how tightly that element has to be framed.
export const CAPTURE_PLAN_VERSION = "creator-capture-plan-v1";

/** A value the product shows that an angle is allowed to choose. */
export interface SurfaceField {
  /** Dotted path into the product's demo-content seed, e.g. `contact.role`. */
  path: string;
  /** What a viewer sees it as, so a reviewer can tell the plan asks for the right thing. */
  shownAs: string;
}

export interface SurfaceRegion {
  /** Becomes the inventory element id, so the plan and the capture agree by name. */
  id: string;
  purpose: string;
  /**
   * How the capture run finds it: an accessible role and name, never a CSS path.
   * The run records this element's own box as the region, which is the framing
   * half of the fix -- a card rect drawn by hand around it is what put four
   * claims below the floor.
   */
  locator: { role: string; name: string; container?: string };
  /** Which declared fields' values appear inside this region. */
  fields: string[];
  /**
   * The type height, in source pixels, this region's text measures at the map's
   * capture viewport. Measured from OCR of the product, not chosen: Solomon's
   * body copy comes back at 9-10px and its headings at 12, and the whole framing
   * budget is arithmetic on this number.
   */
  sourceTextPx: number;
}

/** One thing the capture run does to the product, so there is something to film. */
export interface CaptureAction {
  kind: "click" | "type" | "select";
  locator: { role: string; name: string; container?: string };
  /** For `type`, entered a keystroke at a time so the product responds as it goes; for `select`, the option label. */
  text?: string;
}

/**
 * The interaction whose response is filmed as a motion sequence.
 *
 * A settled page is a photograph. Measured on Solomon: twelve screenshots of a
 * settled route differ by 0.000, page load only shows a spinner resolving into
 * content, and clicking a card moves 0.161 -- while typing into the contact
 * filter moves 1.161, because the list narrows as the letters land. This product
 * animates in response to being used and not otherwise, so a capture that only
 * navigates can only ever produce stills.
 *
 * `reach` stays prose: it describes how a person gets to the surface, and some of
 * it is not executable. This is the part a machine performs.
 */
export interface SurfaceMotion {
  /** What a viewer sees happen, for the plan document. */
  shows: string;
  actions: CaptureAction[];
}

export interface ProductSurface {
  /** Becomes the inventory asset id. */
  id: string;
  route: string;
  purpose: string;
  /** What the run must do after landing on the route before the screen is worth filming. */
  reach: string[];
  /** Optional: an interaction to perform and film once the route has settled. */
  motion?: SurfaceMotion;
  regions: SurfaceRegion[];
}

export interface ProductSurfaceMap {
  product: string;
  /** The viewport `sourceTextPx` was measured at. Framing budgets are only true at this size. */
  viewport: { width: number; height: number };
  fields: SurfaceField[];
  surfaces: ProductSurface[];
}

/** One thing the angle needs the product to prove, before any of it is captured. */
export interface CaptureRequirement {
  /** Stable id; becomes the claim id the brief and the blueprint carry. */
  id: string;
  surfaceId: string;
  regionId: string;
  /** What the beat showing this will assert, in the viewer's terms. */
  says: string;
  /** Field path -> the value this angle needs on screen. */
  fixture: Record<string, string>;
  /**
   * How this proof is drawn, when the default band is the wrong shape for it.
   *
   * Editorial, and it has to be stated before capture rather than after, because
   * the container's aspect is what sets the framing budget and what the crop is
   * resolved against. The case this exists for: a single line of product UI is
   * the most legible thing on a screen and the least croppable, since growing it
   * to a 2.47 band reaches into whatever sits above and below. `wide_strip` at
   * 5.5 asks for no vertical growth at all.
   */
  pattern?: SceneContentPattern;
}

export interface CaptureFraming {
  contentPattern: string;
  containerAspect: number;
  containerPx: number;
  readableFloorPx: number;
  sourceTextPx: number;
  /** The widest crop that still reads. Everything below follows from it. */
  maxCropWidthPx: number;
  maxRegionWidthPx: number;
  maxRegionHeightPx: number;
}

export interface CaptureShot {
  claimId: string;
  beatId: string;
  surfaceId: string;
  route: string;
  regionId: string;
  purpose: string;
  says: string;
  reach: string[];
  locator: { role: string; name: string; container?: string };
  /** The seed values that must be on screen, quoted as data. */
  fixture: Array<{ path: string; shownAs: string; value: string }>;
  framing: CaptureFraming;
  /** The interaction to film on this surface, if it has one. */
  motion?: SurfaceMotion;
}

export interface CapturePlanIssue { claimId?: string; reason: string; detail?: string }

export interface CapturePlan {
  planVersion: string;
  product: string;
  topic: string;
  viewport: { width: number; height: number };
  filmFrames: number;
  beatCount: number;
  shots: CaptureShot[];
  issues: CapturePlanIssue[];
}

// The framing budget, in source pixels, for one region and one template.
//
// Read the render arithmetic backwards. `renderedTextPxOnCrop` says the type
// lands at `sourceTextPx * containerPx / cropWidth`, so holding it at the floor
// caps the crop width; and `cropWidthForRegion` says the crop is the wider of
// the padded region and its padded height stretched to the container's aspect,
// so capping the crop caps both sides of the region.
//
// Sufficient, not necessary. A region inside this box is guaranteed to read,
// because the real crop is never wider than the bound this inverts. A region
// outside it may still read -- `contactHeader` misses the budget by nine pixels
// and lands at 20.3 -- which is why the plan budgets and `verifyCapturePlan`
// judges. Predicting the verdict here would be the second representation of one
// fact that this pipeline keeps getting wrong.
export function framingFor(sourceTextPx: number, contentPattern: string, readableFloorPx = READABLE_PX): CaptureFraming {
  const containerAspect = CONTAINER_ASPECT[contentPattern] ?? 1.6;
  const containerPx = CONTAINER_PX[contentPattern] ?? 900;
  const maxCropWidthPx = (sourceTextPx * containerPx) / Math.max(1, readableFloorPx);
  return {
    contentPattern,
    containerAspect,
    containerPx,
    readableFloorPx,
    sourceTextPx,
    maxCropWidthPx: Math.floor(maxCropWidthPx),
    maxRegionWidthPx: Math.floor(maxCropWidthPx - CROP_MARGIN * 2),
    maxRegionHeightPx: Math.floor(maxCropWidthPx / containerAspect - CROP_MARGIN * 2)
  };
}

const quoted = (value: string) => value.replace(/\s+/g, " ").trim();

export function planCapture(input: {
  topic: string;
  surfaces: ProductSurfaceMap;
  requirements: readonly CaptureRequirement[];
  filmFrames: number;
  beatCount: number;
}): CapturePlan {
  const { topic, surfaces, requirements, filmFrames, beatCount } = input;
  const issues: CapturePlanIssue[] = [];
  const declared = new Map(surfaces.fields.map((field) => [field.path, field]));
  const surfaceById = new Map(surfaces.surfaces.map((surface) => [surface.id, surface]));

  // Beats first, because the beat decides the shot and the shot decides the
  // framing. Asking capture to frame for "a product screen" is how the last
  // inventory was built; asking it to frame for the evidence band beat nine will
  // draw is a number.
  const usable = requirements.filter((requirement) => {
    const surface = surfaceById.get(requirement.surfaceId);
    if (!surface) { issues.push({ claimId: requirement.id, reason: "unknown_surface", detail: requirement.surfaceId }); return false; }
    if (!surface.regions.some(({ id }) => id === requirement.regionId)) {
      issues.push({ claimId: requirement.id, reason: "unknown_region", detail: requirement.regionId });
      return false;
    }
    return true;
  });
  if (new Set(usable.map(({ id }) => id)).size !== usable.length) {
    issues.push({ reason: "duplicate_requirement_id" });
  }
  const beats = planBeats({ beatCount, claimIds: usable.map(({ id }) => id) });
  const beatFor = new Map(beats.flatMap((beat, index) => (beat.claimId ? [[beat.claimId, { beat, index }] as const] : [])));
  // A claim with nowhere to go is a screen captured for nothing. `planBeats`
  // only has `beatCount - 2` middle slots, so asking for more proofs than the
  // running time holds silently drops the tail unless it is said here.
  for (const requirement of usable) {
    if (!beatFor.has(requirement.id)) issues.push({ claimId: requirement.id, reason: "no_beat_for_claim", detail: `${beatCount} beats hold ${Math.max(0, beatCount - 2)} proofs` });
  }

  const shots: CaptureShot[] = [];
  for (const requirement of usable) {
    const placed = beatFor.get(requirement.id);
    if (!placed) continue;
    const surface = surfaceById.get(requirement.surfaceId)!;
    const region = surface.regions.find(({ id }) => id === requirement.regionId)!;

    // Every field the region shows has to be chosen by this angle. Leaving one
    // unstated is how "Product Engineer at Northstar Labs" reached a film about
    // a marketing internship: nothing asked for it, so the seed from the last
    // capture stayed where it was and the screen quietly kept answering an old
    // question.
    const fixture: CaptureShot["fixture"] = [];
    for (const path of region.fields) {
      const field = declared.get(path);
      if (!field) { issues.push({ claimId: requirement.id, reason: "undeclared_field", detail: path }); continue; }
      const value = quoted(requirement.fixture[path] ?? "");
      if (!value) { issues.push({ claimId: requirement.id, reason: "fixture_field_missing", detail: path }); continue; }
      // Seed values are authored, and an angle can be written from material
      // nobody vetted. A screen that says "ignore all previous instructions" is
      // a screen the film would then quote as evidence, so it never gets seeded.
      if (INJECTION_SHAPES.some((shape) => shape.test(value))) {
        issues.push({ claimId: requirement.id, reason: "fixture_instruction_shaped", detail: path });
        continue;
      }
      fixture.push({ path, shownAs: field.shownAs, value });
    }
    // A locator names the element by its accessible name, and half those names
    // are the angle's own data -- the tracker card is called "{opportunity.title}
    // {opportunity.company}". Substituting here is what makes the plan runnable:
    // a step that says "click the card" is a note, one that says which card is an
    // instruction.
    // Fills `{field.path}` from this requirement's own fixture.
    const fill = (template: string) => template.replace(/\{([^}]+)\}/g, (whole, path: string) => {
      const value = quoted(requirement.fixture[path] ?? "");
      if (!value) { issues.push({ claimId: requirement.id, reason: "locator_unresolved", detail: path }); return whole; }
      return value;
    });
    const placeholders = [...region.locator.name.matchAll(/\{([^}]+)\}/g)].map(([, path]) => path!);
    const locatorName = placeholders.reduce((name, path) => {
      const value = quoted(requirement.fixture[path] ?? "");
      if (!value) issues.push({ claimId: requirement.id, reason: "locator_unresolved", detail: path });
      return name.replace(`{${path}}`, value || `{${path}}`);
    }, region.locator.name);
    // A value the interaction types is part of this shot even when the region
    // does not display it: filtering the contact list by company is driven by
    // `contact.company`, and the region that carries the claim is the title.
    const driven = (surface.motion?.actions ?? []).flatMap((action) =>
      [...`${action.locator.name} ${action.text ?? ""}`.matchAll(/\{([^}]+)\}/g)].map(([, path]) => path!));
    for (const path of Object.keys(requirement.fixture)) {
      if (!region.fields.includes(path) && !placeholders.includes(path) && !driven.includes(path)) {
        issues.push({ claimId: requirement.id, reason: "fixture_not_shown_here", detail: path });
      }
    }

    const shot = defaultShot({ spoken: placed.beat.spoken, claimId: requirement.id }, false, false, requirement.pattern);
    if (requirement.pattern && !(requirement.pattern in CONTAINER_ASPECT)) {
      issues.push({ claimId: requirement.id, reason: "unknown_pattern", detail: requirement.pattern });
    }
    const framing = framingFor(region.sourceTextPx, shot.contentPattern ?? "");
    // One line of the product's own type has to fit inside the budget, or no
    // framing of this region can carry a claim in this template and the answer
    // is a different shot rather than a different crop.
    if (framing.maxRegionHeightPx < region.sourceTextPx) {
      issues.push({ claimId: requirement.id, reason: "region_cannot_be_framed", detail: `${region.sourceTextPx}px type needs ${framing.maxRegionHeightPx}px of height` });
    }

    shots.push({
      claimId: requirement.id,
      beatId: placed.beat.id,
      surfaceId: surface.id,
      route: surface.route,
      regionId: region.id,
      purpose: region.purpose,
      says: quoted(requirement.says),
      reach: surface.reach,
      locator: { role: region.locator.role, name: locatorName, ...(region.locator.container ? { container: region.locator.container } : {}) },
      fixture,
      framing,
      // Placeholders resolved here, like the region locator's, so the runner
      // receives a literal instruction rather than a template it has to fill.
      ...(surface.motion
        ? {
          motion: {
            shows: surface.motion.shows,
            actions: surface.motion.actions.map((action) => ({
              ...action,
              locator: { ...action.locator, name: fill(action.locator.name) },
              ...(action.text === undefined ? {} : { text: fill(action.text) })
            }))
          }
        }
        : {})
    });
  }

  return {
    planVersion: CAPTURE_PLAN_VERSION,
    product: surfaces.product,
    topic,
    viewport: surfaces.viewport,
    filmFrames,
    beatCount,
    shots,
    issues
  };
}

export interface CaptureShotVerdict {
  claimId: string;
  regionId: string;
  captured: boolean;
  /** Field paths whose seeded value is not on the captured screen. */
  missingFixture: string[];
  regionPx?: { width: number; height: number };
  cropWidthPx?: number;
  renderedTextPx?: number;
  withinBudget?: boolean;
  /**
   * Never optional. An uncaptured shot is not legible, and saying nothing let a
   * reader treat a missing answer as an absent problem -- the same shape as a
   * gate that cannot fail. A verdict answers every question it is asked.
   */
  legible: boolean;
  /** Why this shot could not be judged, when it could not be. */
  unjudged?: string;
}

export interface CapturePlanVerification {
  ok: boolean;
  shots: CaptureShotVerdict[];
  issues: CapturePlanIssue[];
}

// Checks a built inventory against the plan that asked for it.
//
// This is the gate that would have caught both of the render's failures before
// anybody watched it, and it deliberately re-runs the compiler's own path rather
// than a model of it: `resolveCrop` at the shot's container aspect, then
// `renderedTextPxOnCrop` on the width that came back. Any cheaper check here
// would be a fourth copy of the fact this pipeline keeps disagreeing with
// itself about.
export function verifyCapturePlan(plan: CapturePlan, inventory: ScreenInventory): CapturePlanVerification {
  const issues: CapturePlanIssue[] = [];
  const shots = plan.shots.map((shot) => {
    const verdict: CaptureShotVerdict = { claimId: shot.claimId, regionId: shot.regionId, captured: false, missingFixture: [], legible: false };
    const screen = inventory.screens.find(({ asset }) => asset === shot.surfaceId);
    if (!screen) { issues.push({ claimId: shot.claimId, reason: "surface_not_captured", detail: shot.surfaceId }); return { ...verdict, unjudged: "surface_not_captured" }; }
    const element = screen.elements.find(({ id }) => id === shot.regionId);
    if (!element) { issues.push({ claimId: shot.claimId, reason: "region_not_captured", detail: shot.regionId }); return { ...verdict, unjudged: "region_not_captured" }; }
    verdict.captured = true;
    verdict.regionPx = { width: element.width, height: element.height };

    // OCR of the user's own screens, treated as data throughout -- the same rule
    // the brief states about evidence. A region whose text reads like a direction
    // is not usable as proof no matter how legible it is.
    const text = element.text.toLowerCase();
    if (INJECTION_SHAPES.some((shape) => shape.test(element.text))) {
      issues.push({ claimId: shot.claimId, reason: "evidence_instruction_shaped", detail: shot.regionId });
    }
    verdict.missingFixture = shot.fixture.filter(({ value }) => !text.includes(value.toLowerCase())).map(({ path }) => path);
    for (const path of verdict.missingFixture) {
      issues.push({ claimId: shot.claimId, reason: "fixture_absent", detail: path });
    }

    const claimTokens = candidateTokens(element.text).slice(0, 3);
    const resolved = resolveCrop(inventory, claimTokens, shot.framing.containerAspect, { assetId: shot.surfaceId });
    if (!isResolved(resolved)) { issues.push({ claimId: shot.claimId, reason: "crop_unresolved", detail: resolved.reason }); return verdict; }
    verdict.cropWidthPx = resolved.width;
    verdict.renderedTextPx = Math.round(renderedTextPxOnCrop(sourceTextPxOf(element, claimTokens), resolved.width, shot.framing.contentPattern) * 10) / 10;
    verdict.withinBudget = cropWidthForRegion(element, shot.framing.containerAspect) <= shot.framing.maxCropWidthPx;
    verdict.legible = verdict.renderedTextPx >= shot.framing.readableFloorPx;
    if (!verdict.legible) {
      issues.push({ claimId: shot.claimId, reason: "illegible_at_crop", detail: `${verdict.renderedTextPx}px on a ${resolved.width}px crop, floor is ${shot.framing.readableFloorPx}` });
    }
    return verdict;
  });
  return { ok: issues.length === 0, shots, issues };
}

// The claims a verified plan yields, for the brief to write against.
//
// This is where the inversion lands: the brief's claims stop being whatever the
// library happened to hold and become the ones this film went and captured. Only
// verified shots are offered, so a claim can only exist if its screen was
// captured, carries the angle's own data, and reads at the crop the film draws.
export function claimsFromPlan(plan: CapturePlan, inventory: ScreenInventory, options: { tokensPerClaim?: number } = {}) {
  const { tokensPerClaim = 3 } = options;
  const verification = verifyCapturePlan(plan, inventory);
  const verdicts = new Map(verification.shots.map((shot) => [shot.claimId, shot]));
  const claims: SelectableClaim[] = [];
  const issues: CapturePlanIssue[] = [...verification.issues];

  for (const shot of plan.shots) {
    const verdict = verdicts.get(shot.claimId);
    if (!verdict?.captured || !verdict.legible || verdict.missingFixture.length) continue;
    const element = inventory.screens.find(({ asset }) => asset === shot.surfaceId)?.elements.find(({ id }) => id === shot.regionId)!;
    const tokens = candidateTokens(element.text).slice(0, tokensPerClaim);
    // A region that reads perfectly and offers two usable words cannot be found
    // again by the resolver, which matches on tokens. Better to say so than to
    // hand the brief a claim whose crop will not resolve.
    if (tokens.length < tokensPerClaim) { issues.push({ claimId: shot.claimId, reason: "too_few_distinct_words" }); continue; }
    claims.push({
      id: shot.claimId,
      assetId: shot.surfaceId,
      elementId: shot.regionId,
      requiredReadableText: tokens,
      renderedTextPx: element.renderedTextPx ?? 0,
      evidenceText: element.text,
      // The pattern travels with the claim rather than being re-derived by the
      // compiler. `verify` measured this region's type on the crop this
      // container produced; a compiler that picked its own container would be
      // drawing a shot nothing ever measured.
      contentPattern: shot.framing.contentPattern as SceneContentPattern
    });
  }
  return { claims, issues };
}
