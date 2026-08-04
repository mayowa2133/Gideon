// V14 intentionally reuses the V10 demo-content compiler verbatim: the fixture
// bytes (seed 101010) and the "DEMO DATA" disclosure must stay identical so the
// hash-verified V10 Playwright captures remain valid for V14 renders.
export {
  SOLOMON_V13_DEMO_CONTENT_VERSION as SOLOMON_V14_DEMO_CONTENT_VERSION,
  SOLOMON_V13_DISCLOSURE as SOLOMON_V14_DISCLOSURE,
  solomonV13DemoContentSchema as solomonV14DemoContentSchema,
  compileSolomonV13DemoContent as compileSolomonV14DemoContent,
} from "./solomonDemoContentV13";
export type { SolomonV13DemoContent as SolomonV14DemoContent } from "./solomonDemoContentV13";
