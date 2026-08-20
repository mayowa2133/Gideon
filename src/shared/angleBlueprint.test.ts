import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAngleBrief, planBeats, validateAngleScript, type ScriptBeat } from "./angleBrief";
import { CONTAINER_ASPECT, compileAngleBlueprint } from "./angleBlueprint";
import { candidateTokens, selectClaims } from "./claimSelection";
import { buildFilmScenes } from "./creatorStoryFilm";
import { MIN_SCENE_FRAMES, SPEECH_RATE_BAND } from "./creatorStoryQuality";
import { validateCreativeBlueprint } from "./creativeBlueprint";
import { isResolved, resolveCrop, type ScreenInventory } from "./screenInventory";
import type { CreativeBlueprint } from "./types";

const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "..", "..", "fixtures", "creator-story", name), "utf8"));
const inventory = fixture("solomon-screen-inventory.json") as ScreenInventory;
const reference = fixture("solomon-v22.blueprint.json") as CreativeBlueprint;

const FILM_FRAMES = 1155;
const { claims } = selectClaims(inventory, { maxClaims: 4 });
const brief = buildAngleBrief({
  topic: "land a marketing internship",
  product: "Solomon",
  claims,
  filmFrames: FILM_FRAMES,
  speechRateBand: SPEECH_RATE_BAND,
  beats: [
    { id: "hook", purpose: "name the change", energy: "high", spoken: true },
    ...claims.map((claim, index) => ({ id: `proof${index}`, purpose: "show it happening", energy: "medium" as const, spoken: index !== 1, claimId: claim.id })),
    { id: "cta", purpose: "one instruction", energy: "high", spoken: true }
  ]
});
// Stand-in for the agent's writing: the shape a script has, at the budgets the
// brief set. What is being tested is the compile, not the prose.
const script: ScriptBeat[] = brief.beats.map((slot) => ({
  id: slot.id,
  vo: slot.spoken
    ? [...Array.from({ length: slot.wordBudget[0] + (slot.claimId ? 0 : 1) }, () => "solomon"),
       ...(slot.claimId ? [claims.find(({ id }) => id === slot.claimId)!.requiredReadableText[0]!] : [])].join(" ")
    : "",
  claimId: slot.claimId
}));

describe("angle blueprint", () => {
  const { blueprint, issues } = compileAngleBlueprint({ brief, script, claims, inventory, reference });

  it("compiles a script the brief accepts into a blueprint the validator accepts", () => {
    expect(validateAngleScript(brief, script).filter(({ reason }) => reason !== "film_word_budget")).toEqual([]);
    expect(issues.filter(({ reason }) => reason !== "too_few_beats_for_pace" && reason !== "claim_illegible_at_crop")).toEqual([]);
    expect(validateCreativeBlueprint(blueprint).filter(({ severity }) => severity === "blocking")).toEqual([]);
  });

  it("spends exactly the film's frames, with no scene below the floor", () => {
    const film = buildFilmScenes(blueprint);
    expect(film.at(-1)!.to).toBe(FILM_FRAMES);
    expect(film[0]!.from).toBe(0);
    for (const [index, scene] of film.entries()) {
      expect(scene.from, scene.id).toBe(index === 0 ? 0 : film[index - 1]!.to);
      expect(scene.to - scene.from, scene.id).toBeGreaterThanOrEqual(MIN_SCENE_FRAMES);
    }
  });

  // Time follows speech, but not only speech. Allocating purely by word count
  // gave the one silent proof beat the shortest scene in the film -- one second
  // to read the region it exists to show -- so a claim earns reading time first
  // and shares in the rest after.
  it("holds a claim long enough to read it, silent or not", () => {
    const span = (scene: (typeof blueprint.scenes)[number]) => scene.endMs - scene.startMs;
    const dwell = reference.scenes[0]!.minimumReadableDwellMs;
    for (const scene of blueprint.scenes.filter(({ supportedClaimIds }) => supportedClaimIds.length)) {
      expect(span(scene), scene.id).toBeGreaterThanOrEqual((MIN_SCENE_FRAMES / 30) * 1000 + dwell);
    }
    // And among beats that do speak, the longer line still gets the longer scene.
    const spoken = blueprint.scenes.map((scene, index) => ({ scene, words: script[index]!.vo.split(/\s+/).filter(Boolean).length })).filter(({ words }) => words);
    const ranked = [...spoken].sort((left, right) => right.words - left.words);
    expect(span(ranked[0]!.scene)).toBeGreaterThanOrEqual(span(ranked.at(-1)!.scene));
  });

  it("never runs two backdrops of the same tier together", () => {
    for (const [index, scene] of blueprint.scenes.slice(1).entries()) {
      expect(scene.backdrop.tier, `${blueprint.scenes[index]!.id} -> ${scene.id}`).not.toBe(blueprint.scenes[index]!.backdrop.tier);
    }
  });

  // Every claim has a crop; not every crop has a claim. The reverse used to be
  // asserted here and it was the invariant that kept 13 of 18 scenes empty.
  it("resolves a crop for every claim-bearing scene", () => {
    for (const scene of blueprint.scenes) {
      if (scene.supportedClaimIds.length) expect(scene.productCrop, scene.id).toBeDefined();
      if (!scene.productCrop) continue;
      expect(scene.productCrop.assetId).toBe(scene.productAssetIds[0]);
      expect(scene.productCrop.width, scene.id).toBeGreaterThan(0);
      expect(scene.productCrop.height, scene.id).toBeGreaterThan(0);
    }
  });

  // An unreadable proof is not a weaker proof, it is a shot claiming to show
  // something the viewer cannot see. Three of the four claims the Solomon
  // inventory offers land between 7 and 19 pixels once their crop is drawn, so
  // they are reported and not rendered.
  //
  // Only the proof cut is held to this. Establishing shots are wide and are
  // asked to be recognised rather than read, and they are covered by the test
  // below.
  it("does not draw a claim it cannot draw legibly", () => {
    const paced = buildAngleBrief({
      topic: "paced", product: "Solomon", claims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: planBeats({ beatCount: 18, claimIds: claims.map(({ id }) => id) })
    });
    const written = paced.beats.map((slot) => ({
      id: slot.id,
      vo: slot.spoken
        ? [...Array.from({ length: slot.wordBudget[0] - (slot.claimId ? 1 : 0) }, () => "solomon"),
           ...(slot.claimId ? [claims.find(({ id }) => id === slot.claimId)!.requiredReadableText[0]!] : [])].join(" ")
        : "",
      claimId: slot.claimId
    }));
    const { blueprint: film } = compileAngleBlueprint({ brief: paced, script: written, claims, inventory, reference });

    // Claim-bearing scenes, not scenes with a picture. Those were the same thing
    // while claims were the only reason to show the product; they stopped being
    // the same thing when establishing shots came back, and counting pictures
    // would now pass while every claim was silently dropped.
    const shown = film.scenes.filter(({ supportedClaimIds }) => supportedClaimIds.length);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(claims.length);
    // A dropped picture drops its claim with it: a scene must never keep a claim
    // whose evidence it no longer shows. One direction only -- this was written
    // as an equivalence, which held while claims were the sole reason to draw
    // product and became false the moment establishing shots did too. A scene
    // with a picture and no claim is the wide; a scene with a claim and no
    // picture is the bug.
    for (const scene of film.scenes.filter(({ supportedClaimIds }) => supportedClaimIds.length)) {
      expect(scene.productCrop, scene.id).toBeDefined();
    }
    // And every drop is reported, never silent.
    const dropped = claims.length - shown.length;
    expect(compileAngleBlueprint({ brief: paced, script: written, claims, inventory, reference })
      .issues.filter(({ reason }) => reason === "claim_illegible_at_crop")).toHaveLength(dropped);

    // Wide then tight is a pair; wide, wide, tight is a still held across a cut.
    for (const [index, scene] of film.scenes.slice(1).entries()) {
      const previous = film.scenes[index]!;
      if (!scene.productCrop || !previous.productCrop) continue;
      expect(
        `${scene.productCrop.assetId}:${scene.productCrop.width}x${scene.productCrop.height}`,
        `${previous.id} -> ${scene.id}`
      ).not.toBe(`${previous.productCrop.assetId}:${previous.productCrop.width}x${previous.productCrop.height}`);
    }
  });

  // Which still to draw comes from the inventory that produced it. Reading the
  // reference film's trim pointed a generated film at another film's recording
  // -- the job-search footage angle-driven capture exists to replace -- and had
  // to be hand-patched after every compile.
  it("takes the still trim from the inventory, not the reference film", () => {
    const stamped: ScreenInventory = { ...inventory, screens: inventory.screens.map((screen) => ({ ...screen, trim: 777 })) };
    const { blueprint: film } = compileAngleBlueprint({ brief, script, claims, inventory: stamped, reference });
    const drawn = film.scenes.flatMap(({ productCrop }) => (productCrop ? [productCrop.trim] : []));
    expect(drawn.length).toBeGreaterThan(0);
    for (const trim of drawn) expect(trim).toBe(777);
    // And the reference really does carry a different trim, so this is a choice.
    expect(reference.scenes.some((scene) => (scene.productCrop?.trim ?? 0) !== 777)).toBe(true);
  });

  it("never inherits the reference film's copy", () => {
    // Words on screen that no line in this script supports are the same defect
    // as a caption nobody speaks. The reference scene's arrangement transfers;
    // its chips and headlines do not.
    for (const scene of blueprint.scenes) {
      for (const key of ["labels", "pills", "headline", "lines"]) {
        expect(scene.contentOptions, `${scene.id}.${key}`).not.toHaveProperty(key);
      }
    }
    // The reference does carry that copy, so this is a real subtraction.
    expect(reference.scenes.some(({ contentOptions }) => "labels" in contentOptions || "pills" in contentOptions)).toBe(true);
  });

  // The shot a film about a product cannot do without, and the one the pipeline
  // had no way to make. Every crop it drew had to clear the 20px proof floor,
  // which at Solomon's type sizes is three to four times magnification, which is
  // a slice of one card -- so a viewer could take in every claim and still not
  // know what the application looks like. The establishing shot is the route's
  // own page, held to a recognition floor instead.
  it("shows the product as a product, not only as evidence", () => {
    const paced = buildAngleBrief({
      topic: "wide", product: "Solomon", claims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: planBeats({ beatCount: 18, claimIds: claims.map(({ id }) => id) })
    });
    const written = paced.beats.map((slot) => ({
      id: slot.id,
      vo: slot.spoken
        ? [...Array.from({ length: slot.wordBudget[0] - (slot.claimId ? 1 : 0) }, () => "solomon"),
           ...(slot.claimId ? [claims.find(({ id }) => id === slot.claimId)!.requiredReadableText[0]!] : [])].join(" ")
        : "",
      claimId: slot.claimId
    }));
    const { blueprint: film } = compileAngleBlueprint({ brief: paced, script: written, claims, inventory, reference });

    const establishing = film.scenes.filter((scene) => scene.contentPattern === "product_screen");
    expect(establishing.length, "a film with claims should establish their screens").toBeGreaterThan(0);
    for (const scene of establishing) {
      // Wide: several times the area of any proof band on the same screen, or it
      // is not establishing anything.
      expect(scene.productCrop!.width, scene.id).toBeGreaterThan(700);
      // And never evidence. A shot at recognition size that carries a claim is a
      // claim a viewer is asked to take on trust.
      expect(scene.supportedClaimIds, scene.id).toEqual([]);
    }
    // The proof cuts stay tight, so the pair still means something.
    for (const scene of film.scenes.filter(({ supportedClaimIds }) => supportedClaimIds.length)) {
      expect(scene.productCrop!.width, scene.id).toBeLessThan(700);
    }

    // A film that proves several things off one page establishes that page
    // several times, and the crop is a function of the page alone -- so it drew
    // the identical rect three times, which reads as going back to a screenshot
    // it already showed. The screenshot is wider and taller than the crop, so
    // the second and third framings were captured and going unused.
    // Two claims off one page, which is the case that produced the repeat: the
    // marketing film proved three things off Solomon's dashboard. Built by hand
    // because `selectClaims` deliberately spreads one claim per screen before
    // taking a second from any -- a capture plan has no such rule, and this is
    // the shape a plan produces.
    const contact = inventory.screens.find(({ asset }) => asset === "contact")!;
    const shared = contact.elements
      .filter((element) => element.provenance === "approved" && candidateTokens(element.text).length >= 2)
      .slice(0, 2)
      .map((element) => ({
        id: `contact-${element.id}`, assetId: "contact", elementId: element.id,
        requiredReadableText: candidateTokens(element.text).slice(0, 2),
        renderedTextPx: element.renderedTextPx ?? 0, evidenceText: element.text
      }));
    expect(shared.length, "the fixture should offer two claims on one screen").toBeGreaterThan(1);
    const sharedBrief = buildAngleBrief({
      topic: "one page", product: "Solomon", claims: shared, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: planBeats({ beatCount: 18, claimIds: shared.map(({ id }) => id) })
    });
    const sharedScript = sharedBrief.beats.map((slot) => ({
      id: slot.id,
      vo: [...Array.from({ length: slot.wordBudget[0] - (slot.claimId ? 1 : 0) }, () => "solomon"),
           ...(slot.claimId ? [shared.find(({ id }) => id === slot.claimId)!.requiredReadableText[0]!] : [])].join(" "),
      claimId: slot.claimId
    }));
    const repeats = compileAngleBlueprint({ brief: sharedBrief, script: sharedScript, claims: shared, inventory, reference })
      .blueprint.scenes.filter((scene) => scene.contentPattern === "product_screen").map(({ productCrop }) => productCrop!);
    const framings = repeats.map((crop) => `${crop.assetId} ${crop.x},${crop.y} ${crop.width}x${crop.height}`);
    expect(framings.length).toBeGreaterThan(1);
    expect(new Set(framings).size, `${framings.length} establishing shots from ${new Set(framings).size} framing(s)`).toBe(framings.length);

    // And no horizontal edge lands on a line of type. A vertical edge cutting a
    // panel reads as the page continuing off screen; a horizontal one bisects
    // every glyph in the line at once and reads as broken.
    // The left edge is held to the same rule, and it is the one that bit: a
    // left-aligned page keeps its identity on the left, so panning sideways cut
    // "Application Tracker" down to "Tracker" -- a shot whose entire job is to
    // say what the product is, failing to say it.
    // Checked over the repeated framings too, and that is where it bites: the
    // first look at a page is the page's own box, which by construction starts
    // left of everything on it. Only the second and third are moved.
    for (const crop of [...establishing.map(({ productCrop }) => productCrop!), ...repeats]) {
      const words = inventory.screens.find(({ asset }) => asset === crop.assetId)!.elements.flatMap(({ words: each }) => each);
      const overlaps = (word: { x: number; y: number; width: number; height: number }) =>
        word.x < crop.x + crop.width && word.x + word.width > crop.x
        && word.y < crop.y + crop.height && word.y + word.height > crop.y;
      const cuts = (edge: number, start: (word: { x: number; y: number; width: number; height: number }) => number, span: (word: { x: number; y: number; width: number; height: number }) => number) =>
        words.filter((word) => overlaps(word) && start(word) < edge && start(word) + span(word) > edge).map(({ text }) => text);
      const where = `${crop.assetId} ${crop.x},${crop.y} ${crop.width}x${crop.height}`;
      expect(cuts(crop.y, (word) => word.y, (word) => word.height), `${where} cuts a line of type at its top`).toEqual([]);
      expect(cuts(crop.y + crop.height, (word) => word.y, (word) => word.height), `${where} cuts a line of type at its bottom`).toEqual([]);
      expect(cuts(crop.x, (word) => word.x, (word) => word.width), `${where} cuts a word at its left edge`).toEqual([]);
    }
  });

  // Eighteen beats were resolving onto three patterns. `filmstrip`, `card_field`
  // and `state_swap` are all implemented and nothing ever selected them, so the
  // film had one idea about what a shot is -- which is most of the distance
  // between it and the reference, whose cut rate it already matches.
  //
  // The recap is the one worth having without inventing anything: its content is
  // the film's own proofs, in the order it made them, so it needs no copy, no
  // second capture and no arrangement nobody asked for.
  it("recaps its own evidence as a strip rather than repeating a pattern", () => {
    // Four screens, one claimable line each, well clear of its neighbours -- the
    // shipped fixture only ever yields one legible proof, and a film with one
    // proof has nothing to recap.
    const line = (asset: string, text: string) => ({
      asset, trim: 0, width: 1440, height: 900,
      elements: [{
        id: `${asset}Line`, provenance: "approved" as const, x: 112, y: 400, width: 300, height: 20, aspect: 15,
        text, textHeightPx: 10, renderedTextPx: 36, legibility: "ok" as const,
        words: text.split(" ").map((word, index) => ({ text: word, x: 112 + index * 70, y: 405, width: 60, height: 10 }))
      }, {
        // The page itself, which is what an establishing shot draws and what the
        // recap is made of.
        id: `${asset}Screen`, provenance: "screen" as const, x: 100, y: 60, width: 1216, height: 800, aspect: 1.52,
        text, textHeightPx: 16, renderedTextPx: 13, legibility: "ok" as const,
        words: text.split(" ").map((word, index) => ({ text: word, x: 112 + index * 70, y: 405, width: 60, height: 10 }))
      }]
    });
    const shelf: ScreenInventory = {
      schemaVersion: "1", product: "solomon", source: { width: 1440, height: 900 },
      screens: [
        line("tracker", "Growth Marketing Manager"), line("people", "Head of Marketing"),
        line("draft", "Message Avery Chen"), line("outreach", "Response Rate Counted")
      ]
    };
    const shelfClaims = shelf.screens.map(({ asset, elements }) => ({
      id: asset, assetId: asset, elementId: elements[0]!.id,
      requiredReadableText: candidateTokens(elements[0]!.text).slice(0, 2),
      renderedTextPx: 36, evidenceText: elements[0]!.text
    }));
    const paced = buildAngleBrief({
      topic: "recap", product: "Solomon", claims: shelfClaims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: planBeats({ beatCount: 18, claimIds: shelfClaims.map(({ id }) => id) })
    });
    const written = paced.beats.map((slot) => ({
      id: slot.id,
      vo: [...Array.from({ length: slot.wordBudget[0] - (slot.claimId ? 1 : 0) }, () => "solomon"),
           ...(slot.claimId ? [shelfClaims.find(({ id }) => id === slot.claimId)!.requiredReadableText[0]!] : [])].join(" "),
      claimId: slot.claimId
    }));
    const { blueprint: film } = compileAngleBlueprint({ brief: paced, script: written, claims: shelfClaims, inventory: shelf, reference });

    const strip = film.scenes.find((scene) => scene.contentPattern === "filmstrip");
    expect(strip, "a film with several proofs should recap them").toBeDefined();
    expect(strip!.productCrops!.length).toBeGreaterThanOrEqual(3);
    expect(strip!.productCrops!.length).toBeLessThanOrEqual(4);

    // Every card is a screen the film already showed, not a new crop, and no
    // screen appears twice -- a recap of the same page four times recaps nothing.
    const shown = film.scenes
      .filter(({ contentPattern }) => contentPattern === "product_screen")
      .map(({ productCrop }) => `${productCrop!.assetId}:${productCrop!.x},${productCrop!.y}`);
    for (const crop of strip!.productCrops!) {
      expect(shown, `${crop.assetId} is not a screen the film showed`).toContain(`${crop.assetId}:${crop.x},${crop.y}`);
    }
    expect(new Set(strip!.productCrops!.map(({ assetId }) => assetId)).size).toBe(strip!.productCrops!.length);

    // And no card gives up evidence to the strip's aspect clamp. The first try
    // recapped the proof bands, whose aspects run to 12:1; cover-fitting those
    // into a card drew "Growth Mark", "Resp" and two more cut words.
    for (const crop of strip!.productCrops!) {
      expect(crop.width / crop.height, `${crop.assetId} is too wide for a card`).toBeLessThanOrEqual(1.6);
    }
    // And it claims nothing: the evidence was already claimed on its own beat,
    // so counting it again here would count one proof twice.
    expect(strip!.supportedClaimIds).toEqual([]);
    // The film now draws more than the three patterns it used to.
    expect(new Set(film.scenes.map(({ contentPattern }) => contentPattern)).size).toBeGreaterThanOrEqual(4);
  });

  // A dense film still recaps.
  //
  // The recap used to require a beat that carried no claim AND drew nothing,
  // which held while most non-claim beats were ambient. Raising claim count to
  // ten turned every remaining beat into an establishing shot, so no beat was
  // empty, and the film lost its signature strip without a word being said.
  it("still recaps when every spare beat is already showing a screen", () => {
    const line = (asset: string, text: string) => ({
      asset, trim: 0, width: 1440, height: 900,
      elements: [{
        id: `${asset}Line`, provenance: "approved" as const, x: 112, y: 400, width: 300, height: 20, aspect: 15,
        text, textHeightPx: 10, renderedTextPx: 36, legibility: "ok" as const,
        words: text.split(" ").map((word, index) => ({ text: word, x: 112 + index * 70, y: 405, width: 60, height: 10 }))
      }, {
        id: `${asset}Screen`, provenance: "screen" as const, x: 100, y: 60, width: 1216, height: 800, aspect: 1.52,
        text, textHeightPx: 16, renderedTextPx: 13, legibility: "ok" as const,
        words: text.split(" ").map((word, index) => ({ text: word, x: 112 + index * 70, y: 405, width: 60, height: 10 }))
      }]
    });
    const names = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
    const dense: ScreenInventory = {
      schemaVersion: "1", product: "solomon", source: { width: 1440, height: 900 },
      screens: names.map((name, index) => line(name, `Region ${name} number ${index}`))
    };
    const denseClaims = dense.screens.map(({ asset, elements }) => ({
      id: asset, assetId: asset, elementId: elements[0]!.id,
      requiredReadableText: candidateTokens(elements[0]!.text).slice(0, 2),
      renderedTextPx: 36, evidenceText: elements[0]!.text
    }));
    const paced = buildAngleBrief({
      topic: "dense", product: "Solomon", claims: denseClaims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: planBeats({ beatCount: 18, claimIds: denseClaims.map(({ id }) => id) })
    });
    const written = paced.beats.map((slot) => ({
      id: slot.id,
      vo: [...Array.from({ length: slot.wordBudget[0] - (slot.claimId ? 1 : 0) }, () => "solomon"),
           ...(slot.claimId ? [denseClaims.find(({ id }) => id === slot.claimId)!.requiredReadableText[0]!] : [])].join(" "),
      claimId: slot.claimId
    }));
    const { blueprint: film } = compileAngleBlueprint({ brief: paced, script: written, claims: denseClaims, inventory: dense, reference });

    // The premise the recap has to survive: between hook and CTA -- the only
    // beats it may take -- no beat is drawing nothing.
    const spare = film.scenes.slice(1, -1)
      .filter((scene) => !scene.supportedClaimIds.length && scene.contentPattern !== "filmstrip" && !scene.productCrop)
      .map(({ id }) => id);
    expect(spare, "premise: a dense film has no empty middle beat left").toEqual([]);
    expect(film.scenes.find((scene) => scene.contentPattern === "filmstrip"), "a dense film still recaps").toBeDefined();
  });

  // The gap that made every other gate here meaningless: the compiler wrote one
  // crop, the renderer read a different field, and nothing compared them.
  it("hands the renderer the crop it resolved, not the reference film's", () => {
    for (const scene of blueprint.scenes) {
      const drawn = buildFilmScenes(blueprint).find((entry) => entry.id === scene.id)!.productCrops;
      expect(drawn.map(({ assetId }) => assetId), scene.id).toEqual(scene.productCrop ? [scene.productCrop.assetId] : []);
      if (scene.productCrop) expect(drawn[0], scene.id).toEqual(scene.productCrop);
    }
    // And the reference really does carry crops that would otherwise win.
    expect(reference.scenes.some((scene) => (scene.productCrops?.length ?? 0) > 1)).toBe(true);
  });

  // A film paced from too few beats is the quiet failure: nothing overflows,
  // every scene just gets longer, and it renders as a slideshow.
  it("reports a beat count that cannot reach the reference pace", () => {
    expect(issues.map(({ reason }) => reason)).toContain("too_few_beats_for_pace");
    const paced = buildAngleBrief({
      topic: "paced", product: "Solomon", claims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: Array.from({ length: 18 }, (_, index) => ({ id: `b${index}`, purpose: "x", energy: "medium" as const, spoken: true }))
    });
    const script18 = paced.beats.map((slot) => ({ id: slot.id, vo: Array.from({ length: slot.wordBudget[0] }, () => "solomon").join(" ") }));
    expect(compileAngleBlueprint({ brief: paced, script: script18, claims, inventory, reference }).issues).toEqual([]);
  });

  // The eighth pattern, and what it is actually for.
  //
  // A one-line field is the most legible region a product screen has and the
  // hardest to frame: every container narrower than the line's own aspect grows
  // the crop vertically, and vertical is where a line of text has neighbours.
  // The measured case is Solomon's dashboard promise -- 361x20, a padded aspect
  // of 8.1 -- which at 2.47 resolves to a 158px crop carrying two rows the claim
  // is not about, and at 5.5 to 71px carrying only itself.
  describe("wide_strip", () => {
    const line = (id: string, y: number, text: string, width: number) => ({
      id, provenance: "approved" as const, x: 112, y, width, height: 20, aspect: width / 20,
      text, renderedTextPx: Math.round(10 * (1080 / width)), legibility: "ok" as const,
      words: text.split(" ").map((word, index) => ({ text: word, x: 112 + index * 60, y: y + 5, width: 50, height: 10 }))
    });
    // Three rows of a panel. The neighbours sit 66px away, which is generous for
    // a product screen and still inside the reach of a 2.47 crop.
    const panel: ScreenInventory = {
      schemaVersion: "1", product: "solomon", source: { width: 1440, height: 900 },
      screens: [{
        asset: "panel", trim: 0, width: 1440, height: 900,
        elements: [
          line("above", 545, "Jobs Tracked Twelve", 300),
          line("promise", 611, "staged draft through every step", 361),
          line("below", 675, "Drafts Created Three", 300)
        ]
      }]
    };
    const tokens = ["through", "staged"];
    const foreignWords = (crop: { y: number; height: number }) => panel.screens[0]!.elements
      .filter(({ id }) => id !== "promise")
      .flatMap(({ words }) => words)
      .filter((word) => word.y >= crop.y && word.y + word.height <= crop.y + crop.height).length;

    it("frames the line that carries the claim instead of the rows around it", () => {
      const band = resolveCrop(panel, tokens, CONTAINER_ASPECT.evidence_band!, { assetId: "panel" });
      const strip = resolveCrop(panel, tokens, CONTAINER_ASPECT.wide_strip!, { assetId: "panel" });
      if (!isResolved(band) || !isResolved(strip)) throw new Error("both containers should resolve this region");

      // Same width, so this is not a legibility trade: the region is wider than
      // both containers, so neither grows sideways and the type lands at the same
      // size either way. What changes is how much of the panel comes with it.
      expect(strip.width).toBe(band.width);
      expect(strip.height).toBeLessThan(band.height / 2);
      expect(foreignWords(band), "the 2.47 band pulls in a neighbouring row").toBeGreaterThan(0);
      expect(foreignWords(strip), "the 5.5 strip carries only its own line").toBe(0);
      // And the claim's own words are still in frame, which is the property the
      // whole chain exists to guarantee.
      expect(strip.matchedTokens.sort()).toEqual([...tokens].sort());
    });

    // Legibility is a property of the crop that is drawn. The plan budgets one
    // container, `verify` measures the crop that container produces, and the
    // compiler has to draw that same container or the measurement was of a shot
    // nobody is watching.
    const wideClaims = [{
      id: "promise", assetId: "panel", elementId: "promise",
      requiredReadableText: tokens, renderedTextPx: 30,
      evidenceText: "staged draft through every step", contentPattern: "wide_strip" as const
    }];
    const wideBrief = buildAngleBrief({
      topic: "wide", product: "Solomon", claims: wideClaims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: planBeats({ beatCount: 18, claimIds: ["promise"] })
    });
    const wideScript = wideBrief.beats.map((slot) => ({
      id: slot.id,
      vo: [...Array.from({ length: slot.wordBudget[0] - (slot.claimId ? 1 : 0) }, () => "solomon"), ...(slot.claimId ? ["through"] : [])].join(" "),
      claimId: slot.claimId
    }));
    const compileWide = (shots?: Parameters<typeof compileAngleBlueprint>[0]["shots"]) =>
      compileAngleBlueprint({ brief: wideBrief, script: wideScript, claims: wideClaims, inventory: panel, reference, shots });

    it("draws a claim in the container it was verified against", () => {
      const { blueprint: film, issues } = compileWide();
      const proof = film.scenes.find(({ supportedClaimIds }) => supportedClaimIds.includes("promise"))!;
      expect(proof.contentPattern).toBe("wide_strip");
      expect(issues.filter(({ reason }) => reason === "claim_pattern_mismatch")).toEqual([]);
      // The reference film has no wide_strip scene, so the geometry cannot be
      // inherited. Falling through to scenes[0] gave the hook -- no product rect
      // at all -- and the template drew its band into a hardcoded default while
      // the collision audit checked a rect nothing corresponded to.
      const product = proof.layoutRects!.find(({ kind }) => kind === "product")!;
      const mascot = proof.layoutRects!.find(({ kind }) => kind === "mascot")!;
      expect(product).toBeDefined();
      expect(product.bottom).toBeLessThanOrEqual(mascot.top);
      expect(reference.scenes.some((scene) => scene.contentPattern === "wide_strip")).toBe(false);
    });

    // Run against the defect it exists for: force the scene to a container the
    // claim was never measured in and the compiler must say so.
    it("reports a scene drawn in a container its claim was not verified in", () => {
      const proofBeat = wideBrief.beats.find(({ claimId }) => claimId)!.id;
      const { issues } = compileWide({ [proofBeat]: { shotType: "split_presenter_product", contentPattern: "evidence_band" } });
      expect(issues.filter(({ reason }) => reason === "claim_pattern_mismatch"))
        .toEqual([{ sceneId: proofBeat, reason: "claim_pattern_mismatch", detail: "verified as wide_strip, drawn as evidence_band" }]);
    });
  });

  it("reports rather than truncates when the beats cannot fit the running time", () => {
    const crowded = buildAngleBrief({
      topic: "too much film", product: "Solomon", claims, filmFrames: MIN_SCENE_FRAMES * 3,
      speechRateBand: SPEECH_RATE_BAND,
      beats: brief.beats.map(({ id, purpose, energy, spoken, claimId }) => ({ id, purpose, energy, spoken, claimId }))
    });
    const result = compileAngleBlueprint({ brief: crowded, script, claims, inventory, reference });
    expect(result.issues.map(({ reason }) => reason)).toContain("too_many_beats_for_duration");
  });
});
