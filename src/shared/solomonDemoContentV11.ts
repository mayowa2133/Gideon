// V11 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V11 renders.
export {
  SOLOMON_V10_DEMO_CONTENT_VERSION as SOLOMON_V11_DEMO_CONTENT_VERSION,
  SOLOMON_V10_DISCLOSURE as SOLOMON_V11_DISCLOSURE,
  solomonV10DemoContentSchema as solomonV11DemoContentSchema,
  compileSolomonV10DemoContent as compileSolomonV11DemoContent,
} from "./solomonDemoContentV10";
export type { SolomonV10DemoContent as SolomonV11DemoContent } from "./solomonDemoContentV10";
