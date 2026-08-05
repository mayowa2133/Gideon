import { Composition } from "remotion";
import type { SolomonCreatorStoryV20Manifest } from "../../shared/solomonCreatorStoryV20";
import { SolomonCreatorStoryV20 } from "./SolomonCreatorStoryV20";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV20 {...props as unknown as SolomonCreatorStoryV20Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV20Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
