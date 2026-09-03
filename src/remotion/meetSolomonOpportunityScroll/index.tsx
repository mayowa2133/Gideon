import "@fontsource-variable/manrope/wght.css";
import { Composition, registerRoot } from "remotion";
import type { OpportunityFilm } from "../../shared/meetSolomonOpportunityScroll";
import { MeetSolomonOpportunityScrollFilm } from "./MeetSolomonOpportunityScrollFilm";

const Film: React.FC<Record<string, unknown>> = props => <MeetSolomonOpportunityScrollFilm film={(props as { film: OpportunityFilm }).film} />;
const Root: React.FC = () => <Composition id="MeetSolomonOpportunityScroll" component={Film} fps={30} width={1080} height={1920} durationInFrames={780} defaultProps={{} as Record<string, unknown>}
  calculateMetadata={({ props }) => ({ durationInFrames: (props as { film?: OpportunityFilm }).film?.durationInFrames ?? 780 })} />;
registerRoot(Root);
