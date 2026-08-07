// Fraunces carries every headline and Manrope every chip and label. Without
// these imports neither family exists in the bundle and the browser silently
// falls back to generic serif/sans -- which is what V9 through V21 shipped. Only
// V8 ever loaded them; the imports were dropped in the V9 fork and no gate
// noticed, because a fallback font renders perfectly happily. The V22 bundle
// contained zero .woff2 files before this.
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import { continueRender, delayRender, registerRoot } from "remotion";
import { Root } from "./Root";

// Rendering waits for the faces. Letting frames render while the fonts are still
// arriving is the defect this project just spent a render budget on in another
// guise: early frames in the fallback and later ones in Fraunces is a whole-frame
// typographic change that the scene detector scores as a cut, landing in
// different places each run. Blocking here makes the typeface identical on frame
// 0 and frame 1154.
//
// Fails loudly rather than quietly: document.fonts.load resolves with an empty
// list for a family it cannot find, so an empty result throws instead of
// continuing into a film that has silently reverted to Times.
const handle = delayRender("loading Fraunces Variable and Manrope Variable");
void (async () => {
  const requested = [
    '850 100px "Fraunces Variable"',
    '900 100px "Fraunces Variable"',
    '700 100px "Manrope Variable"',
    '950 100px "Manrope Variable"',
  ];
  const loaded = await Promise.all(requested.map((face) => document.fonts.load(face)));
  const missing = requested.filter((_, index) => loaded[index]!.length === 0);
  if (missing.length > 0) {
    throw new Error(`V22 typography: no face loaded for ${missing.join(", ")}. The film would render in the fallback serif.`);
  }
  await document.fonts.ready;
  continueRender(handle);
})();

registerRoot(Root);
