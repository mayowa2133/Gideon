// V17 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V17 renders.
export {
  SOLOMON_V16_DEMO_CONTENT_VERSION as SOLOMON_V17_DEMO_CONTENT_VERSION,
  SOLOMON_V16_DISCLOSURE as SOLOMON_V17_DISCLOSURE,
  solomonV16DemoContentSchema as solomonV17DemoContentSchema,
  compileSolomonV16DemoContent as compileSolomonV17DemoContent,
} from "./solomonDemoContentV16";
export type { SolomonV16DemoContent as SolomonV17DemoContent } from "./solomonDemoContentV16";
