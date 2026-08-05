// V19 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V19 renders.
export {
  SOLOMON_V18_DEMO_CONTENT_VERSION as SOLOMON_V19_DEMO_CONTENT_VERSION,
  SOLOMON_V18_DISCLOSURE as SOLOMON_V19_DISCLOSURE,
  solomonV18DemoContentSchema as solomonV19DemoContentSchema,
  compileSolomonV18DemoContent as compileSolomonV19DemoContent,
} from "./solomonDemoContentV18";
export type { SolomonV18DemoContent as SolomonV19DemoContent } from "./solomonDemoContentV18";
