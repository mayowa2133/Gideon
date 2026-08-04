import { Composition } from "remotion";
import type { SolomonCreatorStoryV13Manifest } from "../../shared/solomonCreatorStoryV13";
import { SolomonCreatorStoryV13 } from "./SolomonCreatorStoryV13";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV13 {...props as unknown as SolomonCreatorStoryV13Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV13Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
