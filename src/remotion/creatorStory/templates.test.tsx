import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildFilmScenes } from "../../shared/creatorStoryFilm";
import type { CreativeBlueprint } from "../../shared/types";
import { WIDE_STRIP_LAYOUT } from "../../shared/angleBlueprint";
import { CardFieldTemplate, FIELD_MOTIFS, MOTIFS, STRIP_MOTIFS, TEMPLATES, WideStripTemplate, fieldMotifFor, motifFor, stripMotifFor } from "./templates";

// Every template exercised against the scenes it will actually draw, from the
// parity blueprint rather than from invented fixtures. This is the check that a
// render cannot give cheaply: a 25-minute render tells you the film is wrong,
// these tell you which template and why.
//
// Serialized by a local walker rather than react-dom/server, matching the mascot
// rig test: the templates are pure functions of their props and this keeps
// coverage independent of the DOM renderer.
const KEEP_CAMEL = new Set(["viewBox", "preserveAspectRatio", "stopColor", "stopOpacity", "textAnchor", "fontFamily", "fontWeight", "fontSize"]);
function attributeName(name: string) {
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  if (KEEP_CAMEL.has(name)) return name;
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
function renderToString(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderToString).join("");
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (typeof element.type === "function") return renderToString((element.type as (props: unknown) => React.ReactNode)(element.props));
  if (typeof element.type === "symbol") return renderToString((element.props as { children?: React.ReactNode }).children);
  const { children, style, ...rest } = element.props;
  const attributes = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${attributeName(key)}="${typeof value === "object" ? JSON.stringify(value) : String(value)}"`)
    .concat(style ? [`style="${Object.entries(style as Record<string, unknown>).map(([key, value]) => `${attributeName(key)}:${String(value)}`).join(";")}"`] : [])
    .join(" ");
  return `<${String(element.type)}${attributes ? ` ${attributes}` : ""}>${renderToString(children as React.ReactNode)}</${String(element.type)}>`;
}

const blueprint = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "..", "fixtures", "creator-story", "solomon-v22.blueprint.json"), "utf8")
) as CreativeBlueprint;
const film = buildFilmScenes(blueprint);
// TEMPLATES is imported above rather than redeclared here.
//
// This file used to declare its own copy listing every pattern, which is the
// same fact written twice with nothing comparing them -- and it drifted the
// moment `wide_strip` and `product_screen` were added to the real one. The
// broken typecheck was the visible half. The invisible half is worse: the case
// below asserting that every scene in the film has a template was asserting it
// about the copy, so the one check that would catch a pattern with no template
// could not see the map the renderer actually uses.

// Remotion's useCurrentFrame needs a composition context; the templates take the
// frame as a prop precisely so they can be driven without one.
const draw = (sceneId: string, frame: number) => {
  const scene = film.find((candidate) => candidate.id === sceneId)!;
  const Template = TEMPLATES[scene.contentPattern];
  return renderToString(Template({ scene, frame }) as React.ReactNode);
};

describe("creator story templates", () => {
  it("covers every scene in the film with a template", () => {
    for (const scene of film) expect(TEMPLATES[scene.contentPattern], scene.id).toBeDefined();
    expect(new Set(film.map((scene) => scene.contentPattern)).size).toBe(7);
  });

  it("draws every scene without throwing, at three points in its life", () => {
    for (const scene of film) {
      const duration = scene.to - scene.from;
      for (const frame of [0, Math.floor(duration * .5), duration - 1]) {
        expect(() => draw(scene.id, frame), `${scene.id}@${frame}`).not.toThrow();
      }
    }
  });

  it("puts a product still in every scene that declares crops", () => {
    for (const scene of film.filter((candidate) => candidate.productCrops.length)) {
      const markup = draw(scene.id, Math.floor((scene.to - scene.from) * .5));
      expect(markup, scene.id).toContain("data-cs-product");
      // Every crop must resolve to a still filename; a missing trim silently
      // rendered a broken image before `trim` was carried on the crop.
      expect(markup, scene.id).toMatch(/still-[a-z_]+-\d+\.png/);
    }
  });

  it("exchanges the state_swap crops around the swap point", () => {
    const scene = film.find((candidate) => candidate.contentPattern === "state_swap")!;
    const swapAt = Math.round((scene.to - scene.from) * (scene.contentOptions.swapAt ?? .31));
    const before = draw(scene.id, Math.max(0, swapAt - 2)), after = draw(scene.id, swapAt + 2);
    expect(before).not.toBe(after);
    // Asset, not exact trim: the after-crop carries a still sequence, so its
    // trim advances with the scene frame rather than from the swap. That is V22's
    // behaviour and parity keeps it -- pinning the trim would pin the motion.
    expect(before).toContain(`still-${scene.productCrops[0]!.assetId}-`);
    expect(after).toContain(`still-${scene.productCrops[1]!.assetId}-`);
  });

  // The generalisation that matters: V22 held five card positions as literals in
  // FiveSurfaces and five more in Friction. A field lays out however many it gets.
  it("lays out a card field of any size", () => {
    const scene = film.find((candidate) => candidate.contentOptions.arrangement === "grid")!;
    for (const count of [2, 3, 5, 7]) {
      const resized = { ...scene, productCrops: Array.from({ length: count }, (_, index) => scene.productCrops[index % scene.productCrops.length]!) };
      const markup = renderToString(CardFieldTemplate({ scene: resized, frame: 20 }) as React.ReactNode);
      expect((markup.match(/data-cs-product/g) ?? []).length, `${count} cards`).toBe(count);
    }
  });

  it("sizes filmstrip cards from their crops rather than a fixed slot", () => {
    const scene = film.find((candidate) => candidate.contentPattern === "filmstrip")!;
    const markup = draw(scene.id, 10);
    // React style numbers serialize unitless, and the cards are sized from their
    // crops so their heights differ too -- anchor on the row's shared top edge.
    const widths = [...markup.matchAll(/top:620;width:(\d+);height:\d+/g)].map((match) => Number(match[1]));
    expect(widths.length).toBeGreaterThan(1);
    expect(new Set(widths).size, "cards should differ in width").toBeGreaterThan(1);
  });

  // The class of bug EvidenceRegion exists to make unrepresentable. A crop given
  // a size that disagrees with the box it sits in makes cover-fit solve on the
  // wrong axis: one was passed 735 for a 530-tall box, threw away 54 source
  // pixels from each side, and clipped a RECRUITER badge down to "REC" in a
  // shipped film. No gate compares a prop to a style, so nothing caught it.
  it("sizes every crop from the box it is drawn in", () => {
    for (const scene of film.filter((candidate) => candidate.productCrops.length)) {
      const markup = draw(scene.id, Math.floor((scene.to - scene.from) * .4));
      // Each product image is wrapped by exactly one sized box; the image's own
      // geometry is solved from that box, so a mismatch cannot be expressed.
      const boxes = [...markup.matchAll(/width:(\d+);height:(\d+)[^"]*"><div style="position:absolute;inset:0;overflow:hidden;border-radius:32/g)];
      for (const box of boxes) {
        expect(Number(box[1]), `${scene.id} box width`).toBeGreaterThan(0);
        expect(Number(box[2]), `${scene.id} box height`).toBeGreaterThan(0);
      }
    }
    // And the primitive that could express one is no longer reachable from the
    // templates: they hand a box, not a width and a height.
    const source = readFileSync(path.join(__dirname, "templates.tsx"), "utf8");
    expect(source).not.toMatch(/<EvidenceCard\b/);
    expect(source).toMatch(/<EvidenceRegion\b/);
  });

  // The eighth pattern has no scene in the reference film, so it is drawn from
  // the layout the compiler synthesizes for it rather than one V22 supplies.
  describe("wide_strip", () => {
    const scene = {
      ...film.find((candidate) => candidate.contentPattern === "evidence_band" && candidate.productCrops.length)!,
      id: "strip", contentPattern: "wide_strip" as const, contentOptions: {},
      layout: WIDE_STRIP_LAYOUT.map((rect) => ({ ...rect })),
      // A one-line region at the aspect the container resolves to.
      productCrops: [{ assetId: "contact", x: 98, y: 586, width: 389, height: 71, trim: 0 }]
    };
    const markup = (frame: number) => renderToString(WideStripTemplate({ scene, frame }) as React.ReactNode);

    it("draws the band inside its own product rect, clear of the presenter", () => {
      const drawn = markup(30);
      expect(drawn).toContain("data-cs-product");
      const product = scene.layout.find(({ kind }) => kind === "product")!;
      const mascot = scene.layout.find(({ kind }) => kind === "mascot")!;
      const cards = [...drawn.matchAll(/left:(-?\d+(?:\.\d+)?);top:(-?\d+(?:\.\d+)?);width:(\d+);height:(\d+)/g)]
        .map((match) => ({ top: Number(match[2]), bottom: Number(match[2]) + Number(match[4]), left: Number(match[1]), right: Number(match[1]) + Number(match[3]) }));
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.top, "above the product rect").toBeGreaterThanOrEqual(product.top * 1920 - 1);
        expect(card.bottom, "below into the presenter").toBeLessThanOrEqual(mascot.top * 1920);
        expect(card.left).toBeGreaterThanOrEqual(product.left * 1080 - 1);
        expect(card.right).toBeLessThanOrEqual(product.right * 1080 + 1);
      }
    });

    // A still band on a two-second shot reads as a freeze. The sweep is the
    // beat's motion and it carries no words, because copy on a generated film
    // has to come from the script or not at all.
    it("moves across the shot without printing anything the script did not say", () => {
      expect(markup(9)).not.toBe(markup(38));
      for (const frame of [0, 20, 60]) expect(markup(frame)).not.toMatch(/>[A-Za-z]{3,}</);
    });

    it("draws nothing rather than an empty card when the crop is missing", () => {
      expect(renderToString(WideStripTemplate({ scene: { ...scene, productCrops: [] }, frame: 10 }) as React.ReactNode)).toBe("");
    });
  });

  it("never draws a card over the presenter", () => {
    // Overlap is two-dimensional. An earlier version of this compared only the
    // vertical edge and flagged `friction`, whose flank cards sit beside the
    // presenter at x=2 and x=888 -- deliberately crowding it from the edges,
    // which is what that beat means. Comparing rects is what distinguishes
    // "beside" from "over", and "over" is what dropped two claims in V22.
    //
    // Unitless too: matching `top:\d+px` never matches React's serialization, so
    // the first version could not fail at all.
    for (const scene of film.filter((candidate) => candidate.mascot.role !== "absent")) {
      const markup = draw(scene.id, Math.floor((scene.to - scene.from) * .6));
      const mascotRect = scene.layout.find(({ kind }) => kind === "mascot");
      if (!mascotRect) continue;
      const mascot = { left: mascotRect.left * 1080, right: mascotRect.right * 1080, top: mascotRect.top * 1920, bottom: mascotRect.bottom * 1920 };
      const cards = [...markup.matchAll(/left:(-?\d+(?:\.\d+)?);top:(\d+(?:\.\d+)?);width:(\d+);height:(\d+)/g)]
        .map((match) => ({ left: Number(match[1]), top: Number(match[2]), right: Number(match[1]) + Number(match[3]), bottom: Number(match[2]) + Number(match[4]) }));
      const over = cards.filter((card) => card.left < mascot.right && card.right > mascot.left && card.top < mascot.bottom && card.bottom > mascot.top);
      expect(over, `${scene.id} draws ${over.length} card(s) over the presenter`).toEqual([]);
    }
  });
});

describe("ambient motifs", () => {
  // A beat that carries the argument forward used to draw the presenter on a
  // flat colour for its whole window, and every such beat drew the identical
  // picture. These lock the two properties that fixes: a motif exists, and
  // neighbouring beats do not draw the same one.
  const ambientIds = (beats: string[]) => beats.filter((id) => id.startsWith("beat-"));

  it("gives the hook and the cta no motif", () => {
    expect(motifFor("hook")).toBeNull();
    expect(motifFor("cta")).toBeNull();
  });

  it("gives every mid-film beat a motif", () => {
    for (const id of ambientIds(["beat-0", "beat-2", "beat-11", "beat-18"])) {
      expect(MOTIFS, `${id} drew nothing`).toContain(motifFor(id));
    }
  });

  for (const [film, beats] of [
    ["overnight-46s", ["hook", "beat-0", "proof-careerpage-1", "beat-2", "beat-3", "beat-4", "proof-marketing-5", "beat-6", "beat-7", "beat-8", "proof-matched-9", "beat-10", "beat-11", "beat-12", "proof-sort-13", "beat-14", "beat-15", "beat-16", "proof-newest-17", "beat-18", "cta"]],
    ["fresh-31s", ["hook", "beat-0", "proof-careerpage-1", "beat-2", "proof-marketing-3", "beat-4", "beat-5", "proof-matched-6", "beat-7", "proof-sort-8", "beat-9", "proof-newest-10", "beat-11", "cta"]],
    ["different-way-34s", ["hook", "beat-0", "proof-careerpage-1", "beat-2", "proof-remote-3", "beat-4", "proof-company-5", "beat-6", "proof-role-7", "beat-8", "proof-fresh-9", "beat-10", "proof-centre-11", "beat-12", "cta"]]
  ] as [string, string[]][]) {
    it(`never draws the same motif twice running in ${film}`, () => {
      const drawn = ambientIds(beats).map((id) => ({ id, motif: motifFor(id) }));
      for (let i = 1; i < drawn.length; i += 1) {
        expect(drawn[i]!.motif, `${film}: ${drawn[i]!.id} repeats ${drawn[i - 1]!.id}`)
          .not.toBe(drawn[i - 1]!.motif);
      }
    });
  }

  it("uses more than one motif across a film", () => {
    const used = new Set(["beat-0", "beat-2", "beat-3", "beat-4", "beat-6"].map(motifFor));
    expect(used.size).toBeGreaterThan(2);
  });
});

describe("product-scene motifs", () => {
  // A daily is evidence-backed throughout, so `defaultShot` gives every one of
  // its beats a product pattern and none of them are ever ambient. These lock
  // the property that made the ambient path worth having, on the numbering a
  // daily actually produces -- 0, 2, 4 -- where a plain `% 2` returns one motif
  // forever and the films go back to drawing the identical picture every beat.
  it("draws a motif on every numbered product beat", () => {
    for (const id of ["beat-0", "beat-2", "beat-4"]) {
      expect(FIELD_MOTIFS, `${id} drew nothing`).toContain(fieldMotifFor(id));
    }
    for (const id of ["proof-matched-1", "proof-first-3"]) {
      expect(FIELD_MOTIFS, `${id} drew nothing`).toContain(fieldMotifFor(id));
      expect(STRIP_MOTIFS, `${id} drew nothing`).toContain(stripMotifFor(id));
    }
  });

  it("gives the hook and the cta no motif", () => {
    for (const pick of [fieldMotifFor, stripMotifFor]) {
      expect(pick("hook")).toBeNull();
      expect(pick("cta")).toBeNull();
    }
  });

  // The presenter stands in the middle of PRODUCT_FIELD, so a field scene may
  // only draw something still legible with its centre covered. Keeping the two
  // sets disjoint is also what makes the cross-pattern no-repeat check below
  // hold without either selector consulting the other.
  it("keeps the field and strip motif sets disjoint", () => {
    for (const kind of FIELD_MOTIFS) expect(STRIP_MOTIFS).not.toContain(kind);
    for (const kind of STRIP_MOTIFS) expect(FIELD_MOTIFS).not.toContain(kind);
  });

  // The real daily sequence, every scene of it. The earlier version of this
  // listed only beats 0, 2 and 4 because those were the only scenes that drew;
  // now the proof scenes draw too, the run is consecutive, and that is exactly
  // the case the old halving rule got wrong.
  for (const [film, scenes] of [
    ["daily-8-scene", [
      ["beat-0", "field"], ["proof-matched-1", "strip"], ["beat-2", "field"],
      ["proof-first-3", "field"], ["beat-4", "field"], ["proof-second-5", "field"]
    ]],
    ["long-form", [
      ["beat-0", "field"], ["proof-a-1", "strip"], ["beat-2", "field"],
      ["proof-b-3", "strip"], ["beat-4", "field"], ["proof-c-5", "field"], ["beat-6", "field"]
    ]]
  ] as [string, [string, "field" | "strip"][]][]) {
    it(`never draws the same motif twice running in ${film}`, () => {
      const drawn = scenes.map(([id, kind]) => ({
        id, motif: kind === "strip" ? stripMotifFor(id) : fieldMotifFor(id)
      }));
      for (let i = 1; i < drawn.length; i += 1) {
        expect(drawn[i]!.motif, `${film}: ${drawn[i]!.id} repeats ${drawn[i - 1]!.id}`)
          .not.toBe(drawn[i - 1]!.motif);
      }
    });
  }
});
