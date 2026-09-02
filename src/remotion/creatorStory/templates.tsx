import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from "remotion";
import type { FilmScene } from "../../shared/creatorStoryFilm";
import type { SceneProductCrop } from "../../shared/types";
import { AMBER, Backdrop, CONTENT_FLOOR_BOTTOM, Cursor, EvidenceCrop, EvidenceRegion, GREEN, INK, MINT, ProofLabel, StatePill, WHITE, placeholderSurface } from "./primitives";

// Seven content patterns covering the eighteen scenes the reference film draws
// with fifteen bespoke components. The generalisation is arrangement math: where
// V22 held five card positions as literals inside FiveSurfaces and five more
// inside Friction, a `card_field` lays out however many crops it is given.
//
// The pair (shotType, contentPattern) is the key. shotType decides how much of
// the frame the product may use -- the presenter takes the rest -- and the
// pattern decides what happens inside it. Neither axis alone is enough:
// `split_presenter_product` covers a card swapping state under a cursor and a
// row of proof labels under a band, which are not the same picture.

export interface TemplateProps { scene: FilmScene; frame: number }

// The product band a shot type leaves free. Derived from the declared product
// rect rather than restated, so a template can never draw outside the rect the
// collision audit is checking.
function productBox(scene: FilmScene) {
  const rect = scene.layout.find(({ kind }) => kind === "product");
  if (!rect) return { left: 40, top: 300, width: 1000, height: 620 };
  return {
    left: Math.round(rect.left * 1080),
    top: Math.round(rect.top * 1920),
    width: Math.round((rect.right - rect.left) * 1080),
    height: Math.round((rect.bottom - rect.top) * 1920)
  };
}

// A card sized to its crop's aspect inside a width budget. Cover-fit discarding
// 40-77% of a region was measured to be a composition problem rather than an
// edge-density one, but it is still a composition problem: a card whose aspect
// matches its crop shows a whole element instead of a magnified slice.
function cardSize(crop: SceneProductCrop, maxWidth: number, maxHeight: number) {
  const aspect = crop.width / crop.height;
  const width = Math.min(maxWidth, maxHeight * aspect);
  return { width: Math.round(width), height: Math.round(width / aspect) };
}

// ---------------------------------------------------------------- ambient

// Where an ambient motif may draw, which is not one band but two.
//
// The presenter is opaque and centred, and its head occupies roughly x 200-880
// from y 560 down. A motif centred in the gap between caption and floor is
// therefore behind the mascot and invisible: the first cut of this drew a 340px
// clock face at the band's centre and the rendered frame showed the mascot on a
// bare gradient, exactly what the motif exists to replace.
//
// So geometry that must be seen whole goes in the strip ABOVE the head, and
// anything that can be read from its extremities is drawn large enough to pass
// either side of it. Captions run to about y 330 at two lines of 116px, which
// sets the ceiling.
//
// The floor is the antenna, not the head. The rig box starts at y 560 but the
// antenna bleeds ~48px above it (SOLOMON_MASCOT_V*_GEOMETRY.antennaClearancePx),
// so the real obstruction begins near y 512 and is a thin spike on the centre
// line -- invisible from this file, whose types and tests only know that some
// opaque presenter is composited later. A strip ending at 548 cleared the head
// and speared the antenna through `cards` and `sweep` alike. 464 keeps the same
// 48px of clearance the rig asks for.
const STRIP = { left: 90, right: 90, top: 340, height: 124 };
const FIELD = { left: 90, right: 90, top: 348, height: CONTENT_FLOOR_BOTTOM - 388 };

// Which motif a beat draws, from the slot in its id ("beat-7" -> 7).
//
// Slots are assigned by `planBeats` and ascend through the film, so taking them
// modulo the motif count means consecutive ambient beats never draw the same
// picture -- which is the whole point. Deriving it from the id rather than a
// counter keeps the template a pure function of its scene.
export const MOTIFS = ["cards", "rings", "night", "sweep", "rows"] as const;
type Motif = (typeof MOTIFS)[number];
export function motifFor(id: string): Motif | null {
  const match = /(\d+)$/.exec(id);
  // `hook` and `cta` keep the bare gradient they were tuned with.
  if (!match) return null;
  return MOTIFS[Number(match[1]) % MOTIFS.length]!;
}

// The same idea for a beat that carries a product screen, which in the daily
// films is every beat: `defaultShot` gives a pattern to any beat with a claimId,
// and a daily is evidence-backed throughout, so none of them are ever ambient.
// Without this a daily draws no motif at all.
//
// Only two of the five port. A product scene spends its frame: the caption runs
// to 307, the page occupies 336-1046 and the presenter stands at 1075-1872, so
// the horizontal gaps are 29px and the strip motifs have nowhere to be. What is
// left is the pair of gutters either side of the presenter -- x 0-248 and
// x 832-1080 below 1075 -- and `rings` and `night` are precisely the two that
// are read from their extremities rather than their centres, which is why they
// survive having their middle covered.
export const FIELD_MOTIFS = ["rings", "night"] as const;

// `wide_strip` is the one product pattern with room for geometry seen whole: its
// band is only 576-787, leaving full-width gaps of 269px and 288px where the
// others leave 29px. So it draws from the three the field cannot take, and the
// two sets being disjoint is what keeps the no-repeat rule true across patterns
// without either function knowing about the other -- a strip scene can never
// collide with the field scenes on both sides of it.
export const STRIP_MOTIFS = ["cards", "sweep", "rows"] as const;

// Plain `n`, not `n / 2`. When only `product_screen` drew, the motif-bearing
// beats were every other integer (0, 2, 4) and halving was what stopped `% 2`
// returning one motif forever. Now that the proof scenes draw too the run is
// 0, 1, 2, 3, 4, 5 -- consecutive -- and halving is exactly what would produce
// the adjacent repeats it was added to prevent. The rule follows the sequence,
// so it has to change when the sequence does.
export function fieldMotifFor(id: string): (typeof FIELD_MOTIFS)[number] | null {
  const match = /(\d+)$/.exec(id);
  if (!match) return null;
  return FIELD_MOTIFS[Number(match[1]) % FIELD_MOTIFS.length]!;
}

export function stripMotifFor(id: string): (typeof STRIP_MOTIFS)[number] | null {
  const match = /(\d+)$/.exec(id);
  if (!match) return null;
  return STRIP_MOTIFS[Number(match[1]) % STRIP_MOTIFS.length]!;
}

// Where a motif draws in a product scene: full width so the gutters carry it,
// and bounded to the presenter's own band so nothing rises into the page.
const PRODUCT_FIELD = { left: 40, right: 40, top: 1075, height: 797 };

// The lower of wide_strip's two gaps, and anchored from below rather than
// centred in it. The presenter's rect starts at 1075 but the antenna clears
// ~48px above that, so the real obstruction is at ~1027 -- centring a 124px band
// in 787-1075 would end at 993 and spear it the same way the ambient strip did
// before it was moved. Ending at 979 keeps the rig's own 48px.
const WIDE_STRIP_BAND = { left: 90, right: 90, top: 855, height: 124 };

// Ambient motion, drawn behind the presenter on beats that carry no product.
//
// Every value here is either an opacity or a whole-pixel offset. That is not
// fussiness: EditorialCamera used to translate and rescale each scene every
// frame, none of the values landed on whole pixels, and the continuous
// re-rasterisation is what made held content read as staticky -- while the
// motion metric, decimated 36x spatially, scored the churn as a point in the
// film's favour. Sub-pixel drift of a large block is the one thing this file
// must not reintroduce, so translations are rounded and the sweep ticks in
// whole degrees rather than sliding.
//
// Entrances are also spread over >=6 frames. A large block appearing in a single
// frame is scored as a cut by ffmpeg's scene detector, which is how a caption
// swap once produced a phantom nineteenth shot on no scene boundary at all.
const AmbientMotif: React.FC<{ kind: Motif; frame: number; tone: string; deep: boolean; fieldBand?: typeof FIELD; stripBand?: typeof STRIP }> = ({ kind, frame, tone, deep, fieldBand, stripBand }) => {
  const accent = deep ? MINT : GREEN;
  const line = deep ? "rgba(57,242,181,.30)" : "rgba(8,112,82,.22)";
  const fieldArea = fieldBand ?? FIELD;
  const stripArea = stripBand ?? STRIP;
  const strip: React.CSSProperties = { position: "absolute", left: stripArea.left, right: stripArea.right, top: stripArea.top, height: stripArea.height };
  const field: React.CSSProperties = { position: "absolute", left: fieldArea.left, right: fieldArea.right, top: fieldArea.top, height: fieldArea.height };

  if (kind === "cards") {
    // Two postings arriving, one after the other, in the strip above the head.
    return <div style={strip}>{[0, 1].map((i) => {
      const p = spring({ frame: Math.max(0, frame - i * 9), fps: 30, config: { damping: 18, stiffness: 150 }, durationInFrames: 14 });
      return <div key={i} style={{
        position: "absolute", left: 0, right: 0, top: Math.round(i * 68),
        height: 56, borderRadius: 14, border: `3px solid ${line}`,
        background: deep ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.55)",
        opacity: p, transform: `translateY(${Math.round((1 - p) * 30)}px)`
      }}>
        <div style={{ position: "absolute", left: 26, top: 16, width: Math.round(230 + i * 70), height: 11, borderRadius: 6, background: accent, opacity: .75 }} />
        <div style={{ position: "absolute", left: 26, top: 34, width: Math.round(130 + i * 34), height: 8, borderRadius: 4, background: tone, opacity: .28 }} />
      </div>;
    })}</div>;
  }

  if (kind === "rings") {
    // Something checking, over and over. Centred low and grown past the mascot,
    // so what reads is the arc either side of it rather than a hidden circle.
    return <div style={field}>{[0, 1, 2].map((i) => {
      const cycle = (frame + i * 16) % 48;
      const grow = cycle / 48;
      const size = Math.round(420 + grow * 620);
      return <div key={i} style={{
        position: "absolute", left: "50%", top: "72%", width: size, height: size,
        marginLeft: Math.round(-size / 2), marginTop: Math.round(-size / 2),
        borderRadius: 999, border: `3px solid ${accent}`, opacity: (1 - grow) * .38
      }} />;
    })}</div>;
  }

  if (kind === "night") {
    // Nothing moves; only brightness changes. The quietest motif, for the beats
    // that talk about being asleep.
    const dots = [[8, 22], [26, 9], [44, 34], [62, 14], [80, 28], [16, 58], [38, 70], [56, 52], [74, 66], [90, 44], [30, 40], [68, 84], [12, 82], [86, 76]];
    return <div style={field}>{dots.map(([x, y], i) => {
      const twinkle = .18 + .52 * (0.5 + 0.5 * Math.sin(frame / 17 + i * 1.7));
      const r = i % 3 === 0 ? 10 : 6;
      return <div key={i} style={{
        position: "absolute", left: `${x}%`, top: `${y}%`, width: r, height: r,
        borderRadius: 999, background: accent, opacity: twinkle
      }} />;
    })}</div>;
  }

  if (kind === "sweep") {
    // A clock hand, ticking in whole degrees. Continuous rotation of a ring this
    // size resamples every edge on every frame; a tick does not.
    const tick = Math.floor(frame / 5) * 30;
    const size = 116;
    return <div style={strip}><div style={{
      position: "absolute", left: "50%", top: 4, width: size, height: size,
      marginLeft: -size / 2, borderRadius: 999, border: `3px solid ${line}`
    }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 4, height: Math.round(size / 2 - 18), marginLeft: -2, background: accent, transformOrigin: "50% 0%", transform: `rotate(${tick}deg)` }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: 999, background: accent }} />
    </div></div>;
  }

  // rows -- a list filling in from the left, in the strip above the head.
  return <div style={strip}>{[0, 1, 2, 3].map((i) => {
    const p = spring({ frame: Math.max(0, frame - i * 7), fps: 30, config: { damping: 20, stiffness: 160 }, durationInFrames: 16 });
    const width = [78, 92, 64, 84][i]!;
    return <div key={i} style={{
      position: "absolute", left: 0, top: Math.round(i * 34), height: 18, borderRadius: 9,
      width: `${width}%`, background: i % 2 === 0 ? accent : tone,
      opacity: p * (i % 2 === 0 ? .55 : .20),
      transform: `translateX(${Math.round((1 - p) * -60)}px)`
    }} />;
  })}</div>;
};

// No product. The presenter, a light gesture, and -- on the mid-film beats -- a
// motif, because a beat that carries the argument forward used to be the
// presenter alone on a flat colour for its whole window. The hook's flash and
// the sting's glow are the same component at different intensities, which is
// what `purpose` decides.
export const AmbientTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const opening = scene.contentOptions.arrangement !== "converge" && scene.mascot.narrativePurpose === "emotion";
  const flash = opening
    ? interpolate(frame, [0, 5, 12, 20], [.2, 1, .55, .15], { extrapolateRight: "clamp" })
    : .10 + .10 * spring({ frame, fps: 30, config: { damping: 15, stiffness: 175 }, durationInFrames: 8 });
  const centre = opening ? "38%" : "62%";
  const motif = motifFor(scene.id);
  return <AbsoluteFill>
    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% ${centre},rgba(57,242,181,${flash * (opening ? .24 : 1)}),transparent ${opening ? 48 : 55}%)` }} />
    {motif && <AmbientMotif kind={motif} frame={frame} tone={scene.backdrop.foreground} deep={scene.backdrop.tier === "deep"} />}
  </AbsoluteFill>;
};

// ---------------------------------------------------------- evidence_band

// One crop, shown as the band that carries the claim, with its proof labels
// beneath. Seven of eighteen scenes are this shape. The band exists because a
// message panel is two-thirds empty box below three lines of text: showing the
// part that carries the claim took the film from 2.18% to 2.03% edge density,
// where every framing lever had failed.
export const EvidenceBandTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const box = productBox(scene);
  const crops = scene.productCrops;
  const options = scene.contentOptions;
  // A pattern with two crops swaps them at `swapAt`: the empty form becoming a
  // written message is the same shape as the band, not a separate pattern.
  const swapAt = options.swapAt ? Math.round((scene.to - scene.from) * options.swapAt) : 0;
  const swapped = crops.length > 1 && frame >= swapAt;
  const crop = (swapped ? crops[1] : crops[0])!;
  if (!crop) return null;
  const size = cardSize(crop, box.width, box.height);
  const complete = swapped || crops.length === 1;
  const reveal = interpolate(frame, [10, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const settle = spring({ frame: Math.max(0, frame - swapAt), fps: 30, config: { damping: 20, stiffness: 180 }, durationInFrames: 16 });
  // Same shape as product_screen -- the band runs 326-1037 and leaves no gap
  // wider than 29px -- so this takes a field motif in the gutters, not a strip.
  const motif = fieldMotifFor(scene.id);
  return <AbsoluteFill>
    {motif && <AmbientMotif kind={motif} frame={frame} tone={scene.backdrop.foreground} deep={scene.backdrop.tier === "deep"} fieldBand={PRODUCT_FIELD} />}
    <EvidenceRegion box={{ left: box.left + Math.round((box.width - size.width) / 2), top: box.top, width: size.width, height: size.height }} crop={crop} frame={frame} border={complete && options.highlight ? GREEN : undefined}>
      {options.highlight && <div style={{ position: "absolute", left: Math.round(size.width * .035), top: Math.round(size.height * .76), width: Math.round(size.width * .93) * reveal, height: Math.round(size.height * .2), borderRadius: 12, background: "rgba(57,242,181,.24)", borderBottom: `7px solid ${MINT}` }} />}
    </EvidenceRegion>
    {options.labels?.length ? (
      <div style={{ position: "absolute", left: box.left + 4, right: 1080 - box.left - box.width + 4, top: box.top + size.height + 34, display: "grid", gap: 10, justifyItems: "start" }}>
        {options.labels.map((text, index) => <ProofLabel key={text} text={text} primary={index === 0} delay={index * 7} frame={frame} />)}
      </div>
    ) : null}
    {options.pills && <div style={{ position: "absolute", left: 80, right: 80, bottom: CONTENT_FLOOR_BOTTOM, display: "flex", gap: 18, alignItems: "center", justifyContent: "center", fontSize: 29, fontWeight: 950 }}>
      <span style={{ padding: "14px 18px", borderRadius: 14, background: "#ffe2dc", color: MINT, textDecoration: "line-through" }}>{options.pills[0]}</span>
      <span style={{ fontSize: 52 }}>&#8594;</span>
      <span style={{ padding: "14px 18px", borderRadius: 14, background: MINT }}>{options.pills[1]}</span>
    </div>}
    {options.note && <div style={{ position: "absolute", left: box.left + 4, top: box.top + size.height + 34 + (options.labels?.length ?? 0) * 56, padding: "13px 19px", borderRadius: 14, background: INK, color: WHITE, fontSize: 29, fontWeight: 950, opacity: settle }}>{options.note}</div>}
    {options.cursor && <Cursor frame={frame} from={{ x: options.cursor.fromX, y: options.cursor.fromY }} to={{ x: options.cursor.toX, y: options.cursor.toY }} clickAt={options.cursor.clickAt} />}
  </AbsoluteFill>;
};

// --------------------------------------------------------- product_screen

// The route's own page, near the size it really is.
//
// The one shot the generated pipeline could not make, and the reason a viewer
// could watch the whole film and not know what Solomon is. Every other pattern
// draws a crop chosen to prove something, which means a crop magnified until its
// type clears the proof floor, which means a slice of one card. This draws the
// page: heading, panels, the shape of the application.
//
// No border and no highlight. A proof band is framed because the film is
// pointing at it; a screen is not being pointed at, it is being shown, and a
// green rule around it makes it look like evidence for a claim nobody made.
export const ProductScreenTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const box = productBox(scene);
  const crop = scene.productCrops[0];
  if (!crop) return null;
  const size = cardSize(crop, box.width, box.height);
  const enter = spring({ frame, fps: 30, config: { damping: 24, stiffness: 150 }, durationInFrames: 18 });
  // A slow drift rather than a push. The shot is long enough to read across and
  // a static full page reads as a screenshot pasted into a video; the camera
  // already handles the push, so this only has to not be still.
  const drift = interpolate(frame, [0, 90], [0, -10], { extrapolateRight: "clamp" });
  // Drawn first, so it is behind the page and the presenter both. A product
  // scene is the one place the motif is decoration rather than the subject.
  const motif = fieldMotifFor(scene.id);
  return <AbsoluteFill>
    {motif && <AmbientMotif kind={motif} frame={frame} tone={scene.backdrop.foreground} deep={scene.backdrop.tier === "deep"} fieldBand={PRODUCT_FIELD} />}
    <EvidenceRegion
      box={{
        left: box.left + Math.round((box.width - size.width) / 2),
        top: box.top + Math.round((box.height - size.height) / 2),
        width: size.width, height: size.height
      }}
      crop={crop} frame={frame}
      style={{ opacity: enter, transform: `translateY(${Math.round((1 - enter) * 26 + drift)}px)` }}
    />
  </AbsoluteFill>;
};

// ------------------------------------------------------------ big_number

// One value, as large as the frame allows, with nothing to compare it to.
//
// The scene the film stops for. Everything else here draws its crop as evidence
// beside something else; this draws it as the subject, which is why it takes the
// whole middle band and why `BIG_NUMBER_LAYOUT` gives it no mascot rect.
//
// The entrance is a scale, not a slide, and it settles rather than bounces: the
// beat this serves is usually bad news the film has just walked the viewer into
// ("posted two weeks ago"), and a number that springs cheerfully into place
// argues with its own narration. It also holds still afterwards -- no drift --
// because this is the one shot whose whole job is to be read.
export const BigNumberTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const box = productBox(scene);
  const crop = scene.productCrops[0];
  if (!crop) return null;
  const { headline } = scene.contentOptions;
  const deep = scene.backdrop.tier === "deep";
  // The receipt is drawn at a third of the band, not centred in it: the type is
  // the subject and the crop is the citation under it.
  const size = cardSize(crop, Math.round(box.width * .78), 150);
  // Ease-out on both, but opacity arrives first so the value is legible before
  // it has finished growing -- the reverse reads as the film withholding it.
  const grow = interpolate(frame, [0, 16], [.86, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const fade = interpolate(frame, [0, 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // A leading integer is set on its own line and very large; the words after it
  // carry the unit. "1 week ago" reads as the 1 with WEEK AGO under it, which is
  // the shape the reveal wants. A headline with no leading figure -- "Newest
  // First" -- simply sets whole, rather than being forced into a shape it has no
  // number for.
  const parsed = /^(\d[\d,]*)\s+(.*)$/.exec(headline ?? "");
  const figure = parsed?.[1], unit = (parsed?.[2] ?? headline ?? "").toUpperCase();
  return <AbsoluteFill>
    <div style={{
      position: "absolute", left: 60, right: 60, top: 470, textAlign: "center",
      opacity: fade, transform: `scale(${grow})`, transformOrigin: "50% 40%"
    }}>
      {figure && <div style={{
        fontFamily: '"Fraunces Variable", serif', fontWeight: 400, fontSize: 360, lineHeight: .9,
        color: deep ? AMBER : GREEN, letterSpacing: -8
      }}>{figure}</div>}
      <div style={{
        fontFamily: '"Manrope Variable", sans-serif', fontWeight: 950,
        fontSize: figure ? 96 : 128, lineHeight: 1.02, letterSpacing: -2,
        color: deep ? WHITE : INK, marginTop: figure ? 18 : 0
      }}>{unit}</div>
    </div>
    <EvidenceRegion
      box={{ left: Math.round((1080 - size.width) / 2), top: 1180, width: size.width, height: size.height }}
      crop={crop} frame={frame}
      style={{ opacity: interpolate(frame, [10, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}
    />
  </AbsoluteFill>;
};

// -------------------------------------------------------- editorial_scroll

// The feed as a feed: captured cards in one column, travelled past.
//
// The motion is the film's, not the product's, and the provenance line says so.
// What is real is every pixel inside every card -- these are the same crops the
// film proved on their own beats, at the same rects, unretouched. Stacking them
// is the whole transformation.
//
// Travel is linear and whole-pixel. A list moving at a constant rate is what a
// thumb produces and what a reader can follow; easing it turns a scroll into a
// swoop, and sub-pixel offsets on a column of high-contrast card edges is the
// one thing the render is known to score as churn rather than motion.
const SCROLL_GAP = 26;
export const EditorialScrollTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const box = productBox(scene);
  const crops = scene.productCrops;
  if (!crops.length) return null;
  const cards = crops.map((crop) => ({ crop, ...cardSize(crop, box.width, box.height) }));
  const column = cards.reduce((sum, card) => sum + card.height + SCROLL_GAP, -SCROLL_GAP);
  // Travel the column's overhang across the scene, and no further: a list that
  // runs off the top and leaves the frame empty has stopped being evidence.
  const overhang = Math.max(0, column - box.height);
  const span = Math.max(1, scene.to - scene.from);
  const travel = Math.round(overhang * Math.min(1, Math.max(0, frame / span)));
  const enter = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  let offset = 0;
  return <AbsoluteFill>
    <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: box.width, transform: `translateY(${-travel}px)` }}>
        {cards.map((card, index) => {
          const top = offset;
          offset += card.height + SCROLL_GAP;
          return <div key={`${card.crop.assetId}-${card.crop.trim}-${index}`} style={{
            position: "absolute", left: Math.round((box.width - card.width) / 2), top,
            width: card.width, height: card.height,
            opacity: enter, borderRadius: 18, overflow: "hidden",
            boxShadow: "0 10px 30px rgba(7,17,31,.13)"
          }}>
            <EvidenceCrop crop={card.crop} width={card.width} height={card.height} frame={frame} />
          </div>;
        })}
      </div>
    </div>
  </AbsoluteFill>;
};

// ------------------------------------------------------------- wide_strip

// One crop of a single line of product UI, drawn as a band across the frame.
//
// The pattern exists for a shape the other seven cannot frame. A one-line field
// is the most legible region a product screen has -- Solomon's contact title
// grades 83px against a 20px floor, the best in its inventory -- and the
// narrowest container the film had was 2.47, which grows a 116x20 label
// vertically into the name above it and the chips below. `snapClearOfWords`
// refuses that crop and the claim is dropped. At 5.5 there is no vertical
// growth to refuse.
//
// The underline is the beat's motion and it is deliberately not a label: it
// sweeps the width of the strip and says nothing. Every text option a template
// can draw is copy, and copy on a generated film has to come from the script or
// not at all -- a chip reading "SENIOR TECHNICAL RECRUITER" over a screen the
// narration never mentions is the same defect as a caption nobody speaks.
export const WideStripTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const box = productBox(scene);
  const crop = scene.productCrops[0];
  if (!crop) return null;
  const size = cardSize(crop, box.width, box.height);
  const left = box.left + Math.round((box.width - size.width) / 2);
  const top = box.top + Math.round((box.height - size.height) / 2);
  const enter = spring({ frame, fps: 30, config: { damping: 22, stiffness: 170 }, durationInFrames: 14 });
  const sweep = interpolate(frame, [8, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // The only product pattern whose band leaves room for geometry read whole, so
  // this one takes a strip motif rather than a field one. Drawn first, behind
  // the evidence and the presenter both.
  const motif = stripMotifFor(scene.id);
  return <AbsoluteFill>
    {motif && <AmbientMotif kind={motif} frame={frame} tone={scene.backdrop.foreground} deep={scene.backdrop.tier === "deep"} stripBand={WIDE_STRIP_BAND} />}
    <EvidenceRegion
      box={{ left, top, width: size.width, height: size.height }}
      crop={crop} frame={frame} border={GREEN}
      style={{ opacity: enter, transform: `translateY(${Math.round((1 - enter) * 34)}px)` }}
    />
    <div style={{
      position: "absolute", left, top: top + size.height + 12,
      width: Math.round(size.width * sweep), height: 9, borderRadius: 999,
      background: MINT, boxShadow: "0 0 22px rgba(57,242,181,.75)"
    }} />
  </AbsoluteFill>;
};

// ------------------------------------------------------------- state_swap

// Two crops of the same surface before and after an action, with the states
// named either side of an arrow and a cursor performing the click. The point of
// the pattern is cause and effect: the click, then the change.
export const StateSwapTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const box = productBox(scene);
  const options = scene.contentOptions;
  const swapAt = Math.round((scene.to - scene.from) * (options.swapAt ?? .31));
  const swapped = frame >= swapAt;
  const crop = (swapped ? scene.productCrops[1] : scene.productCrops[0]) ?? scene.productCrops[0]!;
  const size = cardSize(crop, box.width, box.height);
  const pulse = spring({ frame: Math.max(0, frame - swapAt + 2), fps: 30, config: { damping: 20, stiffness: 190 }, durationInFrames: 16 });
  return <AbsoluteFill>
    <EvidenceRegion box={{ left: box.left + Math.round((box.width - size.width) / 2), top: box.top, width: size.width, height: size.height }} crop={crop} frame={frame} />
    {options.pills && <div style={{ position: "absolute", left: 120, right: 120, top: box.top + size.height + 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 22, fontSize: 34, fontWeight: 950 }}>
      <StatePill text={options.pills[0]} active={!swapped} />
      <span style={{ fontSize: 54, color: GREEN }}>&#8594;</span>
      <StatePill text={options.pills[1]} active={swapped} />
    </div>}
    {options.cursor && <Cursor frame={frame} from={{ x: options.cursor.fromX, y: options.cursor.fromY }} to={{ x: options.cursor.toX, y: options.cursor.toY }} clickAt={options.cursor.clickAt} />}
    {swapped && <div style={{ position: "absolute", left: box.left + Math.round(size.width * .62), top: box.top + Math.round(size.height * .28), width: 180, height: 180, borderRadius: 999, border: `8px solid ${MINT}`, opacity: 1 - pulse, transform: `scale(${.4 + pulse * 1.4})` }} />}
  </AbsoluteFill>;
};

// ------------------------------------------------------------- card_field

// However many crops it is given, arranged. Three arrangements, because the
// three things a field of cards can say are different: `flank` crowds the
// presenter from both edges, `grid` lays the surfaces out to be counted, and
// `converge` collapses them into one result.
export const CardFieldTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const box = productBox(scene);
  const crops = scene.productCrops;
  const { arrangement = "grid", labels } = scene.contentOptions;
  const surface = placeholderSurface(scene.backdrop.tier);

  if (arrangement === "flank") {
    // Cards pressing in from both edges. Deliberately outside the product box:
    // crowding the presenter is the point, so they are declared as their own
    // rects rather than borrowing the product band.
    return <AbsoluteFill>{crops.map((crop, index) => {
      const right = index % 2 === 1;
      const size = cardSize(crop, 190, 150);
      return <div key={`${crop.assetId}-${index}`} style={{
        position: "absolute", left: right ? 888 : 2, top: 520 + Math.floor(index / 2) * 200 + (right ? 40 : 0),
        width: size.width, height: size.height, borderRadius: 18, overflow: "hidden", background: WHITE,
        border: "2px solid #efc4bb", boxShadow: "0 14px 32px rgba(103,44,32,.15)",
        transform: `translate(${interpolate(frame, [0, 10 + index * 2], [right ? 430 : -430, 0], { extrapolateRight: "clamp" })}px,${Math.sin((frame + index * 7) / 8) * 5}px) rotate(${right ? -2 : 2}deg)`
      }}><EvidenceCrop crop={crop} width={size.width} height={size.height} frame={frame} /></div>;
    })}</AbsoluteFill>;
  }

  if (arrangement === "converge") {
    // The field collapses toward the centre and, if a final crop is given, that
    // crop arrives in its place. `collapse` has one; `payoff` has five and a board.
    const progress = spring({ frame, fps: 30, config: { damping: 16, stiffness: 160 }, durationInFrames: 8 });
    // With placeholders declared, every crop is the result and the field is
    // empty cards. `collapse` is that shape: five scattered surfaces carrying no
    // evidence, converging on one that does. Without this it drew a single card
    // converging on nothing and the frame read as empty.
    const placeholderCount = scene.contentOptions.placeholders ?? 0;
    const result = placeholderCount > 0 ? crops[0]! : crops.length > 1 ? crops.at(-1)! : null;
    const field: Array<SceneProductCrop | null> = placeholderCount > 0
      ? Array.from({ length: placeholderCount }, () => null)
      : (result ? crops.slice(0, -1) : crops);
    const centreX = box.left + box.width / 2, centreY = box.top + box.height / 2;
    return <AbsoluteFill>
      {field.map((crop, index) => {
        const angle = index * Math.PI * 2 / Math.max(1, field.length) - Math.PI / 2;
        const size = crop ? cardSize(crop, 300, 190) : { width: 300, height: 170 };
        const x = centreX - size.width / 2 + Math.cos(angle) * (box.width * .34) * (1 - progress);
        const y = centreY - size.height / 2 + Math.sin(angle) * (box.height * .42) * (1 - progress);
        return <div key={`${crop?.assetId ?? "placeholder"}-${index}`} style={{
          position: "absolute", left: x, top: y, width: size.width, height: size.height,
          background: surface.background, border: `2px solid ${surface.border}`, borderRadius: 18, overflow: "hidden",
          opacity: 1 - progress * .78, transform: `scale(${1 - progress * .45}) rotate(${index * 4 - 8}deg)`
        }}>{crop && <EvidenceCrop crop={crop} width={size.width} height={size.height} frame={frame} />}</div>;
      })}
      {result && (() => {
        const size = cardSize(result, box.width, box.height);
        return <EvidenceRegion box={{ left: box.left + (box.width - size.width) / 2, top: box.top + (box.height - size.height) / 2, width: size.width, height: size.height }} crop={result} frame={frame} border={GREEN} style={{ opacity: progress, transform: `scale(${.65 + .35 * progress})` }} />;
      })()}
    </AbsoluteFill>;
  }

  // grid: two columns, sized from the box rather than from five hardcoded slots.
  const columns = crops.length > 4 ? 2 : Math.min(2, crops.length);
  const gap = 26;
  const cellWidth = Math.floor((box.width - gap * (columns - 1)) / columns);
  const cellHeight = Math.floor((box.height - gap * (Math.ceil(crops.length / columns) - 1)) / Math.ceil(crops.length / columns));
  return <AbsoluteFill>{crops.map((crop, index) => {
    const size = cardSize(crop, cellWidth, cellHeight);
    const x = box.left + (index % columns) * (cellWidth + gap);
    const y = box.top + Math.floor(index / columns) * (cellHeight + gap);
    const enter = spring({ frame: Math.max(0, frame - index * 7), fps: 30, config: { damping: 20, stiffness: 170 }, durationInFrames: 16 });
    return <div key={`${crop.assetId}-${index}`} style={{ position: "absolute", left: x, top: y, width: size.width, height: size.height, borderRadius: 25, overflow: "hidden", background: WHITE, border: "2px solid #e8b8ae", boxShadow: "0 20px 45px rgba(103,44,32,.14)", opacity: enter, transform: `scale(${.78 + .22 * enter})` }}>
      <EvidenceCrop crop={crop} width={size.width} height={size.height} frame={frame} />
      {labels?.[index] && <div style={{ position: "absolute", left: 10, bottom: 10, padding: "6px 10px", borderRadius: 9, background: INK, color: WHITE, fontSize: 17, fontWeight: 900 }}>{labels[index]}</div>}
    </div>;
  })}</AbsoluteFill>;
};

// -------------------------------------------------------------- filmstrip

// A row of crops with a marker travelling between them, each lighting as the
// story reaches it. Card widths come from their crops' aspects, so the strip is
// a row of differently shaped proofs rather than four identical slots.
export const FilmstripTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const crops = scene.productCrops;
  const labels = scene.contentOptions.labels ?? [];
  const held = Math.max(1, Math.round((scene.to - scene.groupFrom) / Math.max(1, crops.length)));
  const phase = Math.min(crops.length - 1, Math.floor(frame / held));
  const travel = (frame % held) / held;
  // Sized from a shared height and each crop's own aspect, then the row is
  // scaled to fit. Clamping every card to one max width made them all identical,
  // which defeats the point: the strip should read as four differently shaped
  // proofs, not four slots.
  const gap = 18, budget = 1080 - 80;
  const baseHeight = 300;
  // Aspect is clamped, not honoured outright. Four crops averaging 2:1 laid out
  // honestly need 2400px, so fitting them into 1080 shrank every card to 124px
  // tall and the strip became unreadable. A wide crop gives up some of its width
  // instead -- discard the strip can afford, because each card is a token here,
  // not the evidence itself.
  // 1.6, so a page-shaped crop is shown whole.
  //
  // The clamp exists because four wide crops laid out honestly need more width
  // than the row has. At 1.35 it also cropped the recap's page shots, which are
  // 1.52, and cover-fit spent the difference on the right edge of each card --
  // clipping the very words the cards were there to recall.
  //
  // The cards' own type is small and that is the pattern, not a defect: measured
  // on the reference, whose four cards are 760x265, 430x390, 390x265 and 742x300
  // laid into a 1000px row, its type renders at about 6px too. It labels each
  // card instead -- JOB, PERSON, PROOF, MESSAGE -- and the labels carry the
  // meaning while the cards carry shape. The generated strip has no labels
  // because there is no source of short screen names it could use without
  // inventing copy; the surface's own `route` is that source, and reaching it
  // means carrying route from the capture plan through the inventory.
  const naturalWidths = crops.map((crop) => baseHeight * Math.min(1.6, crop.width / crop.height));
  const naturalTotal = naturalWidths.reduce((sum, width) => sum + width, 0) + gap * (crops.length - 1);
  const fit = Math.min(1, budget / Math.max(1, naturalTotal));
  const height = Math.round(baseHeight * fit);
  const sizes = naturalWidths.map((width) => ({ width: Math.round(width * fit), height }));
  const total = sizes.reduce((sum, size) => sum + size.width, 0) + gap * (crops.length - 1);
  let cursor = Math.round((1080 - total) / 2);
  const positions = sizes.map((size) => { const x = cursor; cursor += size.width + gap; return x; });
  return <AbsoluteFill>
    {crops.map((crop, index) => {
      const active = index <= phase;
      const enter = spring({ frame: Math.max(0, frame - index * Math.round(held * .9)), fps: 30, config: { damping: 20, stiffness: 170 }, durationInFrames: 16 });
      return <div key={`${crop.assetId}-${index}`} style={{ position: "absolute", left: positions[index], top: 620, width: sizes[index]!.width, height: height, borderRadius: 24, overflow: "hidden", background: WHITE, border: `4px solid ${active ? GREEN : "#b9cbc4"}`, boxShadow: "0 20px 45px rgba(7,17,31,.15)", opacity: .25 + .75 * enter, transform: `translateY(${(1 - enter) * 80}px) scale(${.75 + .25 * enter})` }}>
        <EvidenceCrop crop={crop} width={sizes[index]!.width} height={sizes[index]!.height} frame={frame} />
        {labels[index] ? <div style={{ position: "absolute", left: 8, bottom: 8, padding: "5px 9px", borderRadius: 8, background: INK, color: WHITE, fontSize: 15, fontWeight: 900 }}>{labels[index]}</div> : null}
      </div>;
    })}
    {phase < crops.length - 1 && <div data-cs-context-dot style={{ position: "absolute", left: positions[phase]! + sizes[phase]!.width + (positions[phase + 1]! - positions[phase]! - sizes[phase]!.width) * travel, top: 620 + height + 22, width: 42, height: 42, borderRadius: 999, background: MINT, boxShadow: "0 0 24px rgba(57,242,181,.9)" }} />}
  </AbsoluteFill>;
};

// --------------------------------------------------------- composed_board

// One board assembling several crops into a single state -- the shot that says
// "these were separate and now they are one thing". Rows are proportioned from
// the crops rather than fixed, so a board of three reads as well as a board of four.
export const ComposedBoardTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const box = productBox(scene);
  const crops = scene.productCrops;
  const pulse = 1 + Math.sin(frame / 9) * .012;
  const [head, ...rest] = crops;
  if (!head) return null;
  const padding = 30, innerWidth = box.width - padding * 2;
  const headHeight = Math.round(innerWidth / (head.width / head.height) * .55);
  const restHeight = Math.max(120, box.height - padding * 2 - headHeight - 18 * rest.length);
  const restWidth = rest.length ? Math.floor((innerWidth - 16 * (rest.length - 1)) / rest.length) : innerWidth;
  return <AbsoluteFill>
    <div data-cs-composed-board style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: 36, background: "linear-gradient(145deg,#fff,#f2fbf7)", border: `7px solid ${GREEN}`, boxShadow: "0 32px 90px rgba(7,17,31,.22)", transform: `scale(${pulse})`, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: padding, top: padding, width: innerWidth, height: headHeight, borderRadius: 22, overflow: "hidden", boxShadow: `inset 0 0 0 3px ${GREEN}` }}>
        <EvidenceCrop crop={head} width={innerWidth} height={headHeight} frame={frame} />
      </div>
      {rest.map((crop, index) => (
        <div key={`${crop.assetId}-${index}`} style={{ position: "absolute", left: padding + index * (restWidth + 16), top: padding + headHeight + 18, width: restWidth, height: restHeight, borderRadius: 22, overflow: "hidden" }}>
          <EvidenceCrop crop={crop} width={restWidth} height={restHeight} frame={frame} />
        </div>
      ))}
      <div style={{ position: "absolute", right: 40, top: 8, fontSize: 12, fontWeight: 900, letterSpacing: 2, color: GREEN }}>CONCEPTUAL ASSEMBLY &#183; APPROVED PRODUCT EVIDENCE</div>
    </div>
  </AbsoluteFill>;
};

// ----------------------------------------------------------- comment_card

// The CTA. Stacked bands, because the mascot once covered the comment box
// entirely and only "SO..." and "...OMS" showed -- the most important frame in
// the film with its mechanism hidden. Every element here is a declared rect.
export const CommentCardTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const keyword = scene.contentOptions.labels?.[0] ?? "SOLOMON";
  const handle = scene.contentOptions.labels?.[1] ?? `@${keyword}`;
  const type = spring({ frame: Math.max(0, frame - 38), fps: 30, config: { damping: 20, stiffness: 190 }, durationInFrames: 16 });
  const pulse = frame >= 58 ? 1 + Math.sin((frame - 58) / 4) * .05 * Math.max(0, 1 - (frame - 58) / 48) : 1;
  const box = scene.layout.find(({ kind }) => kind === "cta");
  const top = box ? Math.round(box.top * 1920) : 1252;
  return <AbsoluteFill>
    <div data-cs-comment-box style={{ position: "absolute", left: 130, right: 130, top, transform: `scale(${pulse})` }}>
      <div style={{ padding: "22px 28px", borderRadius: 24, background: "rgba(255,255,255,.94)", border: `4px solid ${MINT}`, boxShadow: `0 0 ${34 + type * 46}px rgba(57,242,181,${.2 + .35 * type})`, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 999, background: INK, display: "grid", placeItems: "center", color: MINT, fontSize: 26, fontWeight: 950 }}>{keyword.slice(0, 1)}</div>
        <div style={{ fontSize: 38, fontWeight: 950, letterSpacing: 1, color: INK }}>{keyword.slice(0, Math.max(1, Math.round(type * keyword.length)))}<span style={{ opacity: .35 }}>|</span></div>
      </div>
    </div>
    <div style={{ position: "absolute", left: 365, right: 365, top: 1636, padding: "10px 14px", borderRadius: 999, background: INK, color: WHITE, textAlign: "center", fontSize: 23, fontWeight: 900, letterSpacing: 2 }}>{handle}</div>
  </AbsoluteFill>;
};

export const TEMPLATES = {
  ambient: AmbientTemplate,
  evidence_band: EvidenceBandTemplate,
  wide_strip: WideStripTemplate,
  product_screen: ProductScreenTemplate,
  big_number: BigNumberTemplate,
  editorial_scroll: EditorialScrollTemplate,
  state_swap: StateSwapTemplate,
  card_field: CardFieldTemplate,
  filmstrip: FilmstripTemplate,
  composed_board: ComposedBoardTemplate,
  comment_card: CommentCardTemplate
} as const;

// What kind of thing the viewer is looking at, said on the frame that shows it.
//
// The film mixes three materials and used to draw them in one visual language:
// regions captured from the running product, whole product pages, and the
// ambient motifs, which are invented. `cards` and `rows` are the confusable
// pair -- an abstracted stack of postings and an abstracted list, drawn in the
// brand's own palette next to frames where a real feed is being cited. Nothing
// on screen distinguished a drawing from evidence.
//
// Rendered from the dispatcher rather than from each template, because a label
// that a pattern can forget to draw is a label that will be missing on exactly
// the pattern nobody checked.
// What each motif depicts, and whether its shapes can be miscounted.
//
// Naming the subject is the cheap half. The disclaimer is the half that matters,
// and it belongs on two of the five rather than all of them. `cards` draws two
// discrete postings and `rows` four discrete list entries, in the brand's own
// palette, in films whose neighbouring frames cite real figures -- "200 jobs
// (5 new)", "13 hours ago". Two drawn cards can be read as two jobs arriving,
// and a bare ILLUSTRATION label says the frame is a drawing without saying the
// quantities are not counts, which is the part that could actually mislead.
//
// `rings`, `sweep` and `night` carry no such risk: concentric arcs, a clock hand
// and scattered dots are not enumerable as items, and appending "not a count" to
// them would be noise -- the same over-flagging that made the cross-capture
// disclosure weaker before it was narrowed.
const MOTIF_SUBJECT: Record<string, string> = {
  cards: "POSTINGS ARRIVING · NOT A COUNT",
  rows: "A LIST FILLING · NOT A COUNT",
  rings: "REPEATED CHECKING",
  sweep: "TIME PASSING",
  night: "THE QUIET HOURS"
};

function provenanceOf(scene: FilmScene): string | null {
  const parts: string[] = [];
  const { capturedOn, captureRelation } = scene.contentOptions;
  if (scene.productCrops.length && capturedOn) {
    parts.push(`${scene.contentPattern === "product_screen" ? "PRODUCT VIEW" : "PRODUCT CAPTURE"} · ${capturedOn}`);
  }
  // Mirrors exactly which templates call AmbientMotif, rather than assuming
  // every pattern that is not ambient draws a field motif. The first cut did
  // assume that and labelled both reveals ILLUSTRATION -- a frame whose whole
  // content is a captured value and its receipt, captioned as a drawing, which
  // is the same class of error as the missing label and no better for being
  // cautious. A scene with no crop and no motif is the presenter on a gradient:
  // it asserts nothing and needs no label.
  const motif = scene.contentPattern === "ambient" ? motifFor(scene.id)
    : scene.contentPattern === "wide_strip" ? stripMotifFor(scene.id)
    : scene.contentPattern === "product_screen" || scene.contentPattern === "evidence_band" ? fieldMotifFor(scene.id)
    : null;
  if (motif) parts.push(`ILLUSTRATION · ${MOTIF_SUBJECT[motif] ?? "AMBIENT"}`);
  // Always, and not as an option the author can forget. The viewer is watching
  // a motion the product never performed: these cards were photographed still
  // and the column is the film's arrangement of them. Every pixel inside a card
  // is the product's; the travel is not.
  if (scene.contentPattern === "editorial_scroll") parts.push("EDITORIAL SCROLL · ARRANGEMENT ONLY");
  if (captureRelation === "different") parts.push("DIFFERENT LISTING · DIFFERENT CAPTURE");
  if (captureRelation === "same") parts.push("SAME CAPTURE · SAME SEARCH");
  return parts.length ? parts.join("  ·  ") : null;
}

const Provenance: React.FC<{ scene: FilmScene }> = ({ scene }) => {
  const text = provenanceOf(scene);
  if (!text) return null;
  // Sized to wrap rather than to fit on one line. A scene can carry three facts
  // at once -- a dated capture, an illustrated backdrop and a same-source
  // relation -- which runs past 100 characters, and at 21px that overflowed the
  // 960px band and left the tail off the frame. A provenance line that is cut in
  // half is worse than none, because the half that survives still reads as a
  // complete statement.
  return <div style={{
    position: "absolute", left: 60, right: 60, bottom: 26, textAlign: "center",
    fontFamily: '"Manrope Variable", sans-serif', fontWeight: 700, fontSize: 19, letterSpacing: 1.1, lineHeight: 1.35,
    color: scene.backdrop.tier === "deep" ? "rgba(255,255,255,.44)" : "rgba(7,17,31,.40)"
  }}>{text}</div>;
};

export const SceneTemplate: React.FC<{ scene: FilmScene }> = ({ scene }) => {
  const localFrame = useCurrentFrame();
  // Patterns that continue across a cut read from the group origin, so a
  // component driven by useCurrentFrame does not restart at every boundary --
  // the three signature splits are why this exists.
  const frame = scene.contentPattern === "filmstrip" ? localFrame + (scene.from - scene.groupFrom) : localFrame;
  const Template = TEMPLATES[scene.contentPattern];
  return <Backdrop backdrop={scene.backdrop}><Template scene={scene} frame={frame} /><Provenance scene={scene} /></Backdrop>;
};
