import { Composition } from "remotion";
import { createSolomonCreatorBenchmarkManifest, type SolomonCreatorBenchmarkManifest } from "../../shared/solomonCreatorBenchmark";
import { SolomonCreatorBenchmark } from "./SolomonCreatorBenchmark";

const defaultProps = createSolomonCreatorBenchmarkManifest("/approved/solomon/update-job-tracker.mp4");
const BenchmarkComposition: React.FC<Record<string, unknown>> = (props) => (
  <SolomonCreatorBenchmark {...props as unknown as SolomonCreatorBenchmarkManifest} />
);

export const SolomonCreatorBenchmarkRoot: React.FC = () => (
  <Composition
    id="SolomonCreatorBenchmarkV1"
    component={BenchmarkComposition}
    durationInFrames={300}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={defaultProps as unknown as Record<string, unknown>}
  />
);
