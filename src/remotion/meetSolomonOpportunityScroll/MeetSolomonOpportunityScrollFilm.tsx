import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { OpportunityFilm } from "../../shared/meetSolomonOpportunityScroll";

const INK = "#17221f", GREEN = "#176b50", MINT = "#b7ead0", IVORY = "#f5f1e8";
const SANS = '"Manrope Variable", Arial, sans-serif';
const abs = (left: number, top: number, width: number, height?: number): CSSProperties => ({ position: "absolute", left, top, width, height });
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const scrollOffset = (frame: number, start: number, end: number, distance: number) => interpolate(frame, [start, end], [0, -distance], { ...clamp, easing: value => value < .5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2 });

const ProductCard: React.FC<{ source: OpportunityFilm["sources"][number]; card: OpportunityFilm["sources"][number]["cards"][number] }> = ({ source, card }) => {
  const width = 850, scale = width / card.crop.width, height = card.crop.height * scale;
  return <div style={{ position: "relative", width, height, flex: "0 0 auto", overflow: "hidden", borderRadius: 20, background: "white", boxShadow: "0 10px 28px #0e201914", border: "2px solid #dfe2da" }}>
    <Img src={staticFile(source.file)} style={{ position: "absolute", left: -card.crop.x * scale, top: -card.crop.y * scale, width: source.sourceWidth * scale, height: source.sourceHeight * scale, maxWidth: "none" }} />
  </div>;
};

const Feed: React.FC<{ film: OpportunityFilm; frame: number; dim?: boolean }> = ({ film, frame, dim }) => {
  const cards = film.sources.flatMap(source => source.cards.map(card => ({ source, card })));
  const cardHeights = cards.map(({ card }) => card.crop.height * (850 / card.crop.width));
  const stripHeight = cardHeights.reduce((sum, height) => sum + height, 0) + (cards.length - 1) * 22;
  const viewportHeight = 1120, distance = Math.max(0, stripHeight - viewportHeight + 20);
  const start = film.scenes[0]!.to - 6, end = film.scenes[4]!.from + 20;
  return <div style={{ ...abs(85, 405, 910, viewportHeight), overflow: "hidden", borderRadius: 34, background: "#ecefe8", border: "3px solid #d7ddd2", boxShadow: "0 24px 54px #13231b22", opacity: dim ? .15 : 1 }}>
    <div style={{ position: "absolute", left: 30, top: 24 + scrollOffset(frame, start, end, distance), display: "flex", flexDirection: "column", gap: 22 }}>
      {cards.map(({ source, card }) => <ProductCard key={card.id} source={source} card={card} />)}
    </div>
  </div>;
};

export const MeetSolomonOpportunityScrollFrame: React.FC<{ film: OpportunityFilm; frame: number }> = ({ film, frame }) => {
  const scene = film.scenes.find(item => frame >= item.from && frame < item.to) ?? film.scenes.at(-1)!;
  const cta = scene.id === "cta";
  return <AbsoluteFill data-opportunity-scene={scene.id} style={{ background: IVORY, color: INK, fontFamily: SANS, overflow: "hidden" }}>
    <div style={{ ...abs(64, 72, 952), display: "flex", justifyContent: "space-between", fontSize: 23, fontWeight: 800, letterSpacing: 1.7 }}><span>MEET SOLOMON</span><span>OPPORTUNITIES</span></div>
    <Feed film={film} frame={frame} dim={cta} />
    {!cta && <>
      <div style={{ ...abs(68, 145, 944), fontSize: scene.id === "range" ? 66 : 82, lineHeight: 1.02, fontWeight: 850, letterSpacing: -3.5, textAlign: "center", textWrap: "balance" }}>{scene.headline}</div>
      <div style={{ ...abs(104, 1555, 872), padding: "18px 26px", boxSizing: "border-box", borderRadius: 20, background: scene.id === "caveat" ? "#fffaf0" : INK, color: scene.id === "caveat" ? INK : "white", border: scene.id === "caveat" ? "2px solid #cabf9e" : "none", textAlign: "center", fontSize: 31, lineHeight: 1.2, fontWeight: 720 }}>{scene.vo}</div>
    </>}
    {cta && <div data-opportunity-cta="Want easy access to more opportunities? Join Solomon." style={{ ...abs(72, 280, 936, 1320), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontSize: 82, lineHeight: 1.02, fontWeight: 850, letterSpacing: -4 }}>WANT EASY ACCESS TO<br /><span style={{ color: GREEN }}>MORE OPPORTUNITIES?</span></div>
      <div style={{ marginTop: 76, padding: "30px 68px", borderRadius: 28, background: GREEN, color: "white", fontSize: 102, lineHeight: 1, fontWeight: 900, letterSpacing: -4, boxShadow: "0 22px 55px #0f4e3938" }}>JOIN SOLOMON.</div>
      <div style={{ marginTop: 34, fontSize: 30, fontWeight: 750, color: GREEN }}>Pick your direction. Revisit one focused feed.</div>
    </div>}
    <div style={{ ...abs(62, 1780, 956), color: cta ? GREEN : "#51615a", textAlign: "center", fontSize: 19, fontWeight: 700, letterSpacing: 1.15 }}>ACTUAL SOLOMON FEED · CAPTURED 2026-08-31 · EDITORIAL SCROLL · LISTINGS CAN CHANGE</div>
    <div style={{ ...abs(65, 1835, 950), height: 3, background: cta ? MINT : "#d6ddd5" }} />
  </AbsoluteFill>;
};

export const MeetSolomonOpportunityScrollFilm: React.FC<{ film: OpportunityFilm }> = ({ film }) => <>
  <MeetSolomonOpportunityScrollFrame film={film} frame={useCurrentFrame()} />
  <Audio src={staticFile(film.narrationSrc)} />
</>;
