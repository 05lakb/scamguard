import { Composition } from "remotion";
import durations from "../public/audio/durations.json";
import { Architecture, Close, Evidence, HowItWorks, Problem } from "./scenes";
import { FPS, HEIGHT, LEAD_IN_SECONDS, TAIL_SECONDS, WIDTH } from "./theme";

// Each scene is as long as its narration, plus a short pause before and after.
const framesFor = (id: keyof typeof durations) =>
  Math.ceil((durations[id].seconds + LEAD_IN_SECONDS + TAIL_SECONDS) * FPS);

export const Root = () => (
  <>
    <Composition id="Scene1" component={Problem} durationInFrames={framesFor("scene1")} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Scene2" component={HowItWorks} durationInFrames={framesFor("scene2")} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Scene5" component={Evidence} durationInFrames={framesFor("scene5")} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Scene6" component={Architecture} durationInFrames={framesFor("scene6")} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Scene7" component={Close} durationInFrames={framesFor("scene7")} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
