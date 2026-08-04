import { Composition } from "remotion";
import type { SolomonCreatorStoryV14Manifest } from "../../shared/solomonCreatorStoryV14";
import { SolomonCreatorStoryV14 } from "./SolomonCreatorStoryV14";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV14 {...props as unknown as SolomonCreatorStoryV14Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV14Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
