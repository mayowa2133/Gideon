import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import { Composition, cancelRender, continueRender, delayRender, registerRoot } from "remotion";
import { meetFilmSchema, type MeetFilm } from "../../shared/meetSolomonNontech";
import { MeetSolomonNontechFilm } from "./MeetSolomonNontechFilm";

const loaded = delayRender("Meet Solomon 05 fonts");
void Promise.all(['800 96px "Manrope Variable"', 'italic 600 135px "Fraunces Variable"'].map(face => document.fonts.load(face)))
  .then(faces => {
    if (faces.some(font => font.length === 0)) throw new Error("Meet Solomon 05 font missing.");
    continueRender(loaded);
  }).catch(cancelRender);
const Film: React.FC<Record<string, unknown>> = props => <MeetSolomonNontechFilm film={(props as { film: MeetFilm }).film} />;
const Root: React.FC = () => <Composition id="MeetSolomonNontech" component={Film} fps={30} width={1080} height={1920} durationInFrames={1200}
  calculateMetadata={({ props }) => ({ durationInFrames: meetFilmSchema.parse(props.film).durationInFrames })} />;
registerRoot(Root);
