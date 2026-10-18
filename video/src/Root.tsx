import { Composition, Series } from "remotion";
import { LiveSiteOne, LiveSiteRedTeam, LiveSiteVoice } from "./recorded";
import { Architecture, Close, Evidence, HowItWorks, Problem, framesFor, type SceneId } from "./scenes";
import { FPS, HEIGHT, WIDTH } from "./theme";

// The scenes in the order they are shown, each as long as its narration plus a short pause either side.
const ORDER: { id: SceneId; component: () => JSX.Element }[] = [
  { id: "scene1", component: Problem },
  { id: "scene2", component: HowItWorks },
  { id: "scene3", component: LiveSiteOne },
  { id: "scene4v", component: LiveSiteVoice },
  { id: "scene4r", component: LiveSiteRedTeam },
  { id: "scene5", component: Evidence },
  { id: "scene6", component: Architecture },
  { id: "scene7", component: Close },
];

const lengthOf = (id: SceneId) => framesFor(id, FPS);

// All the scenes, one after the other, as a single video.
const FullVideo = () => (
  <Series>
    {ORDER.map(({ id, component: Scene }) => (
      <Series.Sequence key={id} durationInFrames={lengthOf(id)}>
        <Scene />
      </Series.Sequence>
    ))}
  </Series>
);

const fullLength = ORDER.reduce((sum, { id }) => sum + lengthOf(id), 0);

export const Root = () => (
  <>
    {ORDER.map(({ id, component }) => (
      <Composition
        key={id}
        id={`Scene${id.replace("scene", "")}`}
        component={component}
        durationInFrames={lengthOf(id)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    ))}
    <Composition id="Full" component={FullVideo} durationInFrames={fullLength} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
