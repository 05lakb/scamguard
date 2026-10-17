import { OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import marks from "../public/footage/marks.json";
import { SceneFrame } from "./scenes";
import { colors } from "./theme";

// The two scenes that show the real site. The footage is one long recording of the live site; marks.json says
// when each of these two scenes starts inside it, and the recorder paced its clicks to the narration.
// The recording is 1280 by 620, which sits between a title strip at the top and the captions at the bottom.

function RecordedScene({ id }: { id: "scene3" | "scene4" }) {
  const { fps } = useVideoConfig();
  const start = marks[id].start;
  return (
    <SceneFrame id={id} compact>
      <div
        style={{
          position: "absolute", left: 0, top: 0, width: 1280, height: 40, boxSizing: "border-box",
          background: "#0f1a2e", borderBottom: `1px solid ${colors.line}`, display: "flex", alignItems: "center",
          gap: 12, padding: "0 18px", fontSize: 18, color: colors.muted,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 5, background: colors.red }} />
        Live site: lastmileguard.web.app. Real footage, made-up data.
      </div>
      <div style={{ position: "absolute", left: 0, top: 40, width: 1280, height: 620, overflow: "hidden" }}>
        <OffthreadVideo
          src={staticFile("footage/demo.webm")}
          startFrom={Math.round(start * fps)}
          muted
          style={{ width: 1280, height: 620, objectFit: "cover" }}
        />
      </div>
    </SceneFrame>
  );
}

export const LiveSiteOne = () => <RecordedScene id="scene3" />;
export const LiveSiteTwo = () => <RecordedScene id="scene4" />;
