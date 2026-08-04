import { Composition } from "remotion";
import type { SolomonCreatorStoryV11Manifest } from "../../shared/solomonCreatorStoryV11";
import { SolomonCreatorStoryV11 } from "./SolomonCreatorStoryV11";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV11 {...props as unknown as SolomonCreatorStoryV11Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV11Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
