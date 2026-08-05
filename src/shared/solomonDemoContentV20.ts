// V20 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V20 renders.
export {
  SOLOMON_V19_DEMO_CONTENT_VERSION as SOLOMON_V20_DEMO_CONTENT_VERSION,
  SOLOMON_V19_DISCLOSURE as SOLOMON_V20_DISCLOSURE,
  solomonV19DemoContentSchema as solomonV20DemoContentSchema,
  compileSolomonV19DemoContent as compileSolomonV20DemoContent,
} from "./solomonDemoContentV19";
export type { SolomonV19DemoContent as SolomonV20DemoContent } from "./solomonDemoContentV19";
