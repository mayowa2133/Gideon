import { Composition } from "remotion";
import { createSolomonCreatorStoryV9Manifest, type SolomonCreatorStoryV9Manifest } from "../../shared/solomonCreatorStoryV9";
import { SolomonCreatorStoryV9 } from "./SolomonCreatorStoryV9";
const defaults=createSolomonCreatorStoryV9Manifest({jobs:"jobs",tracker:"tracker",contacts:"contacts",outreach:"outreach"});
const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV9 {...props as unknown as SolomonCreatorStoryV9Manifest}/>;
export const Root=()=> <Composition id="SolomonCreatorStoryV9Mascot" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={defaults as unknown as Record<string,unknown>}/>;
