// V16 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V16 renders.
export {
  SOLOMON_V15_DEMO_CONTENT_VERSION as SOLOMON_V16_DEMO_CONTENT_VERSION,
  SOLOMON_V15_DISCLOSURE as SOLOMON_V16_DISCLOSURE,
  solomonV15DemoContentSchema as solomonV16DemoContentSchema,
  compileSolomonV15DemoContent as compileSolomonV16DemoContent,
} from "./solomonDemoContentV15";
export type { SolomonV15DemoContent as SolomonV16DemoContent } from "./solomonDemoContentV15";
