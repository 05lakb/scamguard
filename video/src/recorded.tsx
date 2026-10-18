import { OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import marks from "../public/footage/marks.json";
import durations from "../public/audio/durations.json";
import { SceneFrame } from "./scenes";
import { LEAD_IN_SECONDS, TAIL_SECONDS, colors } from "./theme";

// The scenes that show the real site. The footage is one long recording of the live site; marks.json says
// when each of these two scenes starts inside it, and the recorder paced its clicks to the narration.
// The recording is 1280 by 620, which sits between a title strip at the top and the captions at the bottom.

type RecordedId = "scene3" | "scene4v" | "scene4r";
// How much faster than real time the footage may play. The red-team run is long, so it is a time-lapse.
const MAX_RATE: Record<RecordedId, number> = { scene3: 2.2, scene4v: 1.7, scene4r: 10 };

function RecordedScene({ id }: { id: RecordedId }) {
  const { fps } = useVideoConfig();
  const { start, end } = marks[id];
  // The recording runs a little behind the recorder's clock, and the gap grows as the recording goes on (about 4%).
  // marks.lag is a fixed gap, if it could be measured; marks.drift is the growing part.
  const lag = (marks as { lag?: number }).lag ?? 0;
  const drift = (marks as { drift?: number }).drift ?? 0;
  const footageAt = (clock: number) => clock * (1 + drift) + lag;
  // If the real clicks took longer than the voice, play the footage a little faster so none of it is cut off.
  const planned = durations[id].seconds + LEAD_IN_SECONDS + TAIL_SECONDS;
  const rate = Math.min(MAX_RATE[id], Math.max(1, (footageAt(end) - footageAt(start)) / planned));
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
        {rate > 1.3 ? <span style={{ marginLeft: "auto", color: colors.amber, fontWeight: 700 }}>Sped up {rate.toFixed(1)}x</span> : null}
      </div>
      <div style={{ position: "absolute", left: 0, top: 40, width: 1280, height: 620, overflow: "hidden" }}>
        <OffthreadVideo
          src={staticFile("footage/demo.webm")}
          startFrom={Math.max(0, Math.round(footageAt(start) * fps))}
          muted
          playbackRate={rate}
          style={{ width: 1280, height: 620, objectFit: "cover" }}
        />
      </div>
    </SceneFrame>
  );
}

export const LiveSiteOne = () => <RecordedScene id="scene3" />;
export const LiveSiteVoice = () => <RecordedScene id="scene4v" />;
export const LiveSiteRedTeam = () => <RecordedScene id="scene4r" />;
