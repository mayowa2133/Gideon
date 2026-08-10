import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildFilmScenes } from "../../shared/creatorStoryFilm";
import type { CreativeBlueprint } from "../../shared/types";
import { AmbientTemplate, CardFieldTemplate, ComposedBoardTemplate, CommentCardTemplate, EvidenceBandTemplate, FilmstripTemplate, StateSwapTemplate } from "./templates";

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
const TEMPLATES = {
  ambient: AmbientTemplate, evidence_band: EvidenceBandTemplate, state_swap: StateSwapTemplate,
  card_field: CardFieldTemplate, filmstrip: FilmstripTemplate, composed_board: ComposedBoardTemplate,
  comment_card: CommentCardTemplate
} as const;

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
