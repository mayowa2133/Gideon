import { Composition } from "remotion";
import type { SolomonCreatorStoryV12Manifest } from "../../shared/solomonCreatorStoryV12";
import { SolomonCreatorStoryV12 } from "./SolomonCreatorStoryV12";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV12 {...props as unknown as SolomonCreatorStoryV12Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV12Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
