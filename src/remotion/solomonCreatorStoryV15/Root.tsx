import { Composition } from "remotion";
import type { SolomonCreatorStoryV15Manifest } from "../../shared/solomonCreatorStoryV15";
import { SolomonCreatorStoryV15 } from "./SolomonCreatorStoryV15";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV15 {...props as unknown as SolomonCreatorStoryV15Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV15Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
