import { Composition, registerRoot } from "remotion";
import { MeetSolomonCampaignFilm } from "./MeetSolomonCampaignFilm";

const Root = () => <Composition id="MeetSolomonCampaign" component={MeetSolomonCampaignFilm} width={1080} height={1920} fps={30} durationInFrames={720} defaultProps={{ film: {} as never }} calculateMetadata={({ props }) => ({ durationInFrames: props.film.durationInFrames, fps: props.film.fps, width: 1080, height: 1920 })} />;

registerRoot(Root);
