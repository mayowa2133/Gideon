import { Composition } from "remotion";
import { createSolomonCreatorStoryV7Manifest, type SolomonCreatorStoryV7Manifest } from "../../shared/solomonCreatorStoryV7";
import { SolomonCreatorStoryV7 } from "./SolomonCreatorStoryV7";

const defaults = createSolomonCreatorStoryV7Manifest({
  jobs: "/approved/solomon/jobs.webm",
  tracker: "/approved/solomon/tracker.webm",
  contacts: "/approved/solomon/contacts.webm",
  outreach: "/approved/solomon/outreach.webm"
});

const Story: React.FC<Record<string, unknown>> = (props) => <SolomonCreatorStoryV7 {...props as unknown as SolomonCreatorStoryV7Manifest} />;

export const SolomonCreatorStoryV7Root: React.FC = () => <Composition
  id="SolomonCreatorStoryV7Robot"
  component={Story}
  durationInFrames={1_080}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={defaults as unknown as Record<string, unknown>}
/>;
