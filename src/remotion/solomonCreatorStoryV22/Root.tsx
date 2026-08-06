import { Composition } from "remotion";
import type { SolomonCreatorStoryV22Manifest } from "../../shared/solomonCreatorStoryV22";
import { SolomonCreatorStoryV22 } from "./SolomonCreatorStoryV22";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV22 {...props as unknown as SolomonCreatorStoryV22Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV22Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
