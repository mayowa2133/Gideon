import { Composition } from "remotion";
import type { SolomonCreatorStoryV21Manifest } from "../../shared/solomonCreatorStoryV21";
import { SolomonCreatorStoryV21 } from "./SolomonCreatorStoryV21";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV21 {...props as unknown as SolomonCreatorStoryV21Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV21Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
