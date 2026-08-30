import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import { Composition, cancelRender, continueRender, delayRender, registerRoot } from "remotion";
import { meetFilmSchema, type MeetFilm } from "../../shared/meetSolomon";
import { MeetSolomonFilm } from "./MeetSolomonFilm";

const loaded = delayRender("Meet Solomon fonts");
void Promise.all(['800 98px "Manrope Variable"', 'italic 600 124px "Fraunces Variable"'].map(face => document.fonts.load(face)))
  .then(faces => {
    if (faces.some(font => font.length === 0)) throw new Error("Meet Solomon font missing.");
    continueRender(loaded);
  }).catch(cancelRender);
const Film: React.FC<Record<string, unknown>> = props => <MeetSolomonFilm film={(props as { film: MeetFilm }).film} />;
const Root: React.FC = () => <Composition id="MeetSolomon" component={Film} fps={30} width={1080} height={1920} durationInFrames={1155}
  calculateMetadata={({ props }) => ({ durationInFrames: meetFilmSchema.parse(props.film).durationInFrames })} />;
registerRoot(Root);
