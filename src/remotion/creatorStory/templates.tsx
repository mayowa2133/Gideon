import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import type { FilmScene } from "../../shared/creatorStoryFilm";
import type { SceneProductCrop } from "../../shared/types";
import { Backdrop, CONTENT_FLOOR_BOTTOM, Cursor, EvidenceCard, EvidenceCrop, GREEN, INK, MINT, ProofLabel, StatePill, WHITE, placeholderSurface } from "./primitives";

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

// No product. The presenter and a light gesture -- the hook's flash and the
// sting's glow are the same component at different intensities, which is what
// `purpose` decides.
export const AmbientTemplate: React.FC<TemplateProps> = ({ scene, frame }) => {
  const opening = scene.contentOptions.arrangement !== "converge" && scene.mascot.narrativePurpose === "emotion";
  const flash = opening
    ? interpolate(frame, [0, 5, 12, 20], [.2, 1, .55, .15], { extrapolateRight: "clamp" })
    : .10 + .10 * spring({ frame, fps: 30, config: { damping: 15, stiffness: 175 }, durationInFrames: 8 });
  const centre = opening ? "38%" : "62%";
  return <AbsoluteFill>
    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% ${centre},rgba(57,242,181,${flash * (opening ? .24 : 1)}),transparent ${opening ? 48 : 55}%)` }} />
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
  return <AbsoluteFill>
    <div style={{ position: "absolute", left: box.left + Math.round((box.width - size.width) / 2), top: box.top, width: size.width, height: size.height }}>
      <EvidenceCard border={complete && options.highlight ? GREEN : undefined}>
        <EvidenceCrop crop={crop} width={size.width} height={size.height} frame={frame} />
        {options.highlight && <div style={{ position: "absolute", left: Math.round(size.width * .035), top: Math.round(size.height * .76), width: Math.round(size.width * .93) * reveal, height: Math.round(size.height * .2), borderRadius: 12, background: "rgba(57,242,181,.24)", borderBottom: `7px solid ${MINT}` }} />}
      </EvidenceCard>
    </div>
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
    <div style={{ position: "absolute", left: box.left + Math.round((box.width - size.width) / 2), top: box.top, width: size.width, height: size.height }}>
      <EvidenceCard><EvidenceCrop crop={crop} width={size.width} height={size.height} frame={frame} /></EvidenceCard>
    </div>
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
    const result = crops.length > 1 ? crops.at(-1)! : null;
    const field = result ? crops.slice(0, -1) : crops;
    const centreX = box.left + box.width / 2, centreY = box.top + box.height / 2;
    return <AbsoluteFill>
      {field.map((crop, index) => {
        const angle = index * Math.PI * 2 / Math.max(1, field.length) - Math.PI / 2;
        const size = cardSize(crop, 300, 190);
        const x = centreX - size.width / 2 + Math.cos(angle) * (box.width * .34) * (1 - progress);
        const y = centreY - size.height / 2 + Math.sin(angle) * (box.height * .42) * (1 - progress);
        return <div key={`${crop.assetId}-${index}`} style={{
          position: "absolute", left: x, top: y, width: size.width, height: size.height,
          background: surface.background, border: `2px solid ${surface.border}`, borderRadius: 18, overflow: "hidden",
          opacity: 1 - progress * .78, transform: `scale(${1 - progress * .45}) rotate(${index * 4 - 8}deg)`
        }}><EvidenceCrop crop={crop} width={size.width} height={size.height} frame={frame} /></div>;
      })}
      {result && (() => {
        const size = cardSize(result, box.width, box.height);
        return <div style={{ position: "absolute", left: box.left + (box.width - size.width) / 2, top: box.top + (box.height - size.height) / 2, width: size.width, height: size.height, opacity: progress, transform: `scale(${.65 + .35 * progress})` }}>
          <EvidenceCard border={GREEN}><EvidenceCrop crop={result} width={size.width} height={size.height} frame={frame} /></EvidenceCard>
        </div>;
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
  const naturalWidths = crops.map((crop) => baseHeight * (crop.width / crop.height));
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
        {labels[index] && <div style={{ position: "absolute", left: 8, bottom: 8, padding: "5px 9px", borderRadius: 8, background: INK, color: WHITE, fontSize: 15, fontWeight: 900 }}>{labels[index]}</div>}
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

const TEMPLATES = {
  ambient: AmbientTemplate,
  evidence_band: EvidenceBandTemplate,
  state_swap: StateSwapTemplate,
  card_field: CardFieldTemplate,
  filmstrip: FilmstripTemplate,
  composed_board: ComposedBoardTemplate,
  comment_card: CommentCardTemplate
} as const;

export const SceneTemplate: React.FC<{ scene: FilmScene }> = ({ scene }) => {
  const localFrame = useCurrentFrame();
  // Patterns that continue across a cut read from the group origin, so a
  // component driven by useCurrentFrame does not restart at every boundary --
  // the three signature splits are why this exists.
  const frame = scene.contentPattern === "filmstrip" ? localFrame + (scene.from - scene.groupFrom) : localFrame;
  const Template = TEMPLATES[scene.contentPattern];
  return <Backdrop backdrop={scene.backdrop}><Template scene={scene} frame={frame} /></Backdrop>;
};
