import { Composition } from "remotion";
import type { SolomonCreatorStoryV19Manifest } from "../../shared/solomonCreatorStoryV19";
import { SolomonCreatorStoryV19 } from "./SolomonCreatorStoryV19";

const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV19 {...props as unknown as SolomonCreatorStoryV19Manifest}/>;
export const Root:React.FC = () => <Composition id="SolomonCreatorStoryV19Performance" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{} as Record<string,unknown>}/>;
