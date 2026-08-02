import { Composition } from "remotion";
import { createSolomonCreatorStoryV6Manifest, type SolomonCreatorStoryV6Manifest } from "../../shared/solomonCreatorStoryV6";
import { SolomonCreatorStoryV6 } from "./SolomonCreatorStoryV6";

const defaults = createSolomonCreatorStoryV6Manifest({
  jobs: "/approved/solomon/jobs.webm",
  tracker: "/approved/solomon/tracker.webm",
  contacts: "/approved/solomon/contacts.webm",
  outreach: "/approved/solomon/outreach.webm"
});

const Story: React.FC<Record<string, unknown>> = (props) => <SolomonCreatorStoryV6 {...props as unknown as SolomonCreatorStoryV6Manifest} />;

export const SolomonCreatorStoryV6Root: React.FC = () => (
  <Composition
    id="SolomonCreatorStoryV6Robot"
    component={Story}
    durationInFrames={1_080}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={defaults as unknown as Record<string, unknown>}
  />
);
