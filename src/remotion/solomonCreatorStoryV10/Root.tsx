import { Composition } from "remotion";
import type { SolomonCreatorStoryV10Manifest } from "../../shared/solomonCreatorStoryV10";
import { SolomonCreatorStoryV10 } from "./SolomonCreatorStoryV10";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV10 {...props as unknown as SolomonCreatorStoryV10Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV10Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
