import{Composition}from "remotion";import{createSolomonCreatorStoryV8Manifest,type SolomonCreatorStoryV8Manifest}from "../../shared/solomonCreatorStoryV8";import{SolomonCreatorStoryV8}from "./SolomonCreatorStoryV8";
const defaults=createSolomonCreatorStoryV8Manifest({jobs:"jobs",tracker:"tracker",contacts:"contacts",outreach:"outreach"});
const Story:React.FC<Record<string,unknown>>=(props)=><SolomonCreatorStoryV8 {...props as unknown as SolomonCreatorStoryV8Manifest}/>;
export const Root=()=> <Composition id="SolomonCreatorStoryV8Robot" component={Story} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={defaults as unknown as Record<string,unknown>}/>;
