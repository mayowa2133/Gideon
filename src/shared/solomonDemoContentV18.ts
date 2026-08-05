// V18 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V18 renders.
export {
  SOLOMON_V17_DEMO_CONTENT_VERSION as SOLOMON_V18_DEMO_CONTENT_VERSION,
  SOLOMON_V17_DISCLOSURE as SOLOMON_V18_DISCLOSURE,
  solomonV17DemoContentSchema as solomonV18DemoContentSchema,
  compileSolomonV17DemoContent as compileSolomonV18DemoContent,
} from "./solomonDemoContentV17";
export type { SolomonV17DemoContent as SolomonV18DemoContent } from "./solomonDemoContentV17";
