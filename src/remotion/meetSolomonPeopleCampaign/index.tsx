import { Composition, registerRoot } from "remotion";
import { MeetSolomonPeopleCampaignFilm } from "./MeetSolomonPeopleCampaignFilm";

const Root = () => <Composition id="MeetSolomonPeopleCampaign" component={MeetSolomonPeopleCampaignFilm} width={1080} height={1920} fps={30} durationInFrames={720} defaultProps={{ film: {} as never }} calculateMetadata={({ props }) => ({ durationInFrames: props.film.durationInFrames, fps: props.film.fps, width: 1080, height: 1920 })} />;
registerRoot(Root);
