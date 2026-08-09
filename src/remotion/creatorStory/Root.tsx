import { Composition } from "remotion";
import { CreatorStoryFilm, type CreatorStoryFilmProps } from "./CreatorStoryFilm";

// Duration comes from the props at render time via calculateMetadata, because a
// generated film has no fixed length: the blueprint's scenes and the realized
// narration decide it. V22 hardcoded 1155 here, which is exactly the assumption
// that made a second angle impossible.
const Film: React.FC<Record<string, unknown>> = (props) => <CreatorStoryFilm {...(props as unknown as CreatorStoryFilmProps)} />;

export const Root: React.FC = () => <Composition
  id="CreatorStoryFilm"
  component={Film}
  durationInFrames={1155}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{} as Record<string, unknown>}
  calculateMetadata={({ props }) => {
    const scenes = (props as unknown as CreatorStoryFilmProps).scenes ?? [];
    return { durationInFrames: Math.max(1, scenes.at(-1)?.to ?? 1155) };
  }}
/>;
