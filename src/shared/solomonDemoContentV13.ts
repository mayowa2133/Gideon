// V13 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V13 renders.
export {
  SOLOMON_V12_DEMO_CONTENT_VERSION as SOLOMON_V13_DEMO_CONTENT_VERSION,
  SOLOMON_V12_DISCLOSURE as SOLOMON_V13_DISCLOSURE,
  solomonV12DemoContentSchema as solomonV13DemoContentSchema,
  compileSolomonV12DemoContent as compileSolomonV13DemoContent,
} from "./solomonDemoContentV12";
export type { SolomonV12DemoContent as SolomonV13DemoContent } from "./solomonDemoContentV12";
