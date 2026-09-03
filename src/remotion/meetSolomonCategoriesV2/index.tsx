import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import { Composition, cancelRender, continueRender, delayRender, registerRoot } from "remotion";
import { meetFilmSchema, type MeetFilm } from "../../shared/meetSolomonCategoriesV2";
import { MeetSolomonCategoriesFilmV2 } from "./MeetSolomonCategoriesFilmV2";

const loaded = delayRender("Meet Solomon category fonts");
void Promise.all(['800 94px "Manrope Variable"', 'italic 600 116px "Fraunces Variable"'].map(face => document.fonts.load(face)))
  .then(faces => {
    if (faces.some(font => font.length === 0)) throw new Error("Category font missing.");
    continueRender(loaded);
  }).catch(cancelRender);
const Film: React.FC<Record<string, unknown>> = props => <MeetSolomonCategoriesFilmV2 film={(props as { film: MeetFilm }).film} />;
const Root: React.FC = () => <Composition id="MeetSolomonCategoriesV2" component={Film} fps={30} width={1080} height={1920} durationInFrames={960}
  calculateMetadata={({ props }) => ({ durationInFrames: meetFilmSchema.parse(props.film).durationInFrames })} />;
registerRoot(Root);
