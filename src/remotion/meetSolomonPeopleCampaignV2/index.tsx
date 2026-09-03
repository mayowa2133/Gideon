import { Composition, registerRoot } from "remotion";
import { MeetSolomonPeopleCampaignV2Film } from "./MeetSolomonPeopleCampaignV2Film";

const Root = () => <Composition id="MeetSolomonPeopleCampaignV2" component={MeetSolomonPeopleCampaignV2Film} width={1080} height={1920} fps={30} durationInFrames={780} defaultProps={{ film: {} as never }} calculateMetadata={({ props }) => ({ durationInFrames: props.film.durationInFrames, fps: props.film.fps, width: 1080, height: 1920 })} />;
registerRoot(Root);
