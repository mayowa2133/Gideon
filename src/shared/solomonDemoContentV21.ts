// V21 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V21 renders.
export {
  SOLOMON_V19_DEMO_CONTENT_VERSION as SOLOMON_V21_DEMO_CONTENT_VERSION,
  SOLOMON_V19_DISCLOSURE as SOLOMON_V21_DISCLOSURE,
  solomonV19DemoContentSchema as solomonV21DemoContentSchema,
  compileSolomonV19DemoContent as compileSolomonV21DemoContent,
} from "./solomonDemoContentV19";
export type { SolomonV19DemoContent as SolomonV21DemoContent } from "./solomonDemoContentV19";
