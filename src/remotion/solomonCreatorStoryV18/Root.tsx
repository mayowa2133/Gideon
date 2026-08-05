import { Composition } from "remotion";
import type { SolomonCreatorStoryV18Manifest } from "../../shared/solomonCreatorStoryV18";
import { SolomonCreatorStoryV18 } from "./SolomonCreatorStoryV18";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV18 {...props as unknown as SolomonCreatorStoryV18Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV18Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
