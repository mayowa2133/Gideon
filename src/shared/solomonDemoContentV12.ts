// V12 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V12 renders.
export {
  SOLOMON_V11_DEMO_CONTENT_VERSION as SOLOMON_V12_DEMO_CONTENT_VERSION,
  SOLOMON_V11_DISCLOSURE as SOLOMON_V12_DISCLOSURE,
  solomonV11DemoContentSchema as solomonV12DemoContentSchema,
  compileSolomonV11DemoContent as compileSolomonV12DemoContent,
} from "./solomonDemoContentV11";
export type { SolomonV11DemoContent as SolomonV12DemoContent } from "./solomonDemoContentV11";
