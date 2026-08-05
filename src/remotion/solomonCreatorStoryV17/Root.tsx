import { Composition } from "remotion";
import type { SolomonCreatorStoryV17Manifest } from "../../shared/solomonCreatorStoryV17";
import { SolomonCreatorStoryV17 } from "./SolomonCreatorStoryV17";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV17 {...props as unknown as SolomonCreatorStoryV17Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV17Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
