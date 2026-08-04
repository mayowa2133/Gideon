// V15 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V15 renders.
export {
  SOLOMON_V14_DEMO_CONTENT_VERSION as SOLOMON_V15_DEMO_CONTENT_VERSION,
  SOLOMON_V14_DISCLOSURE as SOLOMON_V15_DISCLOSURE,
  solomonV14DemoContentSchema as solomonV15DemoContentSchema,
  compileSolomonV14DemoContent as compileSolomonV15DemoContent,
} from "./solomonDemoContentV14";
export type { SolomonV14DemoContent as SolomonV15DemoContent } from "./solomonDemoContentV14";
