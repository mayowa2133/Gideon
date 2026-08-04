import { Composition } from "remotion";
import type { SolomonCreatorStoryV16Manifest } from "../../shared/solomonCreatorStoryV16";
import { SolomonCreatorStoryV16 } from "./SolomonCreatorStoryV16";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV16 {...props as unknown as SolomonCreatorStoryV16Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV16Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
