import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import { Composition, cancelRender, continueRender, delayRender, registerRoot } from "remotion";
import { meetFilmSchema, type MeetFilm } from "../../shared/meetSolomonV2";
import { MeetSolomonFilmV2 } from "./MeetSolomonFilmV2";

const loaded = delayRender("Meet Solomon V2 fonts");
void Promise.all(['800 99px "Manrope Variable"', 'italic 600 130px "Fraunces Variable"'].map(face => document.fonts.load(face)))
  .then(faces => {
    if (faces.some(font => font.length === 0)) throw new Error("Meet Solomon V2 font missing.");
    continueRender(loaded);
  }).catch(cancelRender);
const Film: React.FC<Record<string, unknown>> = props => <MeetSolomonFilmV2 film={(props as { film: MeetFilm }).film} />;
const Root: React.FC = () => <Composition id="MeetSolomonV2" component={Film} fps={30} width={1080} height={1920} durationInFrames={1050}
  calculateMetadata={({ props }) => ({ durationInFrames: meetFilmSchema.parse(props.film).durationInFrames })} />;
registerRoot(Root);
