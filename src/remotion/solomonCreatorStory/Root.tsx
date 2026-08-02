import { Composition } from "remotion";
import { createSolomonCreatorStoryManifest, type SolomonCreatorStoryManifest } from "../../shared/solomonCreatorStory";
import { SolomonCreatorStory } from "./SolomonCreatorStory";

const placeholderPaths = {
  jobs: "/approved/solomon/jobs.mp4",
  tracker: "/approved/solomon/tracker.mp4",
  contacts: "/approved/solomon/contacts.mp4",
  outreach: "/approved/solomon/outreach.mp4"
};
const defaultProps = createSolomonCreatorStoryManifest(placeholderPaths);
const StoryComposition: React.FC<Record<string, unknown>> = (props) => (
  <SolomonCreatorStory {...props as unknown as SolomonCreatorStoryManifest} />
);

export const SolomonCreatorStoryRoot: React.FC = () => (
  <Composition
    id="SolomonCreatorStoryV2"
    component={StoryComposition}
    durationInFrames={1_080}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={defaultProps as unknown as Record<string, unknown>}
  />
);
