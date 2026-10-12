import { createContext, useContext, type ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import durations from "../public/audio/durations.json";
import narration from "../narration.json";
import { AFTER_FIX, BEFORE_FIX, LOSS_FIGURES, type BarData } from "./data";
import { LEAD_IN_SECONDS, TAIL_SECONDS, colors, font } from "./theme";

export type SceneId = keyof typeof durations;

// How long the scene is, in frames. Inside a combined video a scene cannot ask the composition, so it is passed down.
const SceneLength = createContext(1);
export const framesFor = (id: SceneId, fps: number) => Math.ceil((durations[id].seconds + LEAD_IN_SECONDS + TAIL_SECONDS) * fps);

// How far through the scene we are, from 0 to 1.
export function useProgress() {
  const frame = useCurrentFrame();
  const durationInFrames = useContext(SceneLength);
  return frame / durationInFrames;
}

// Fades and slides something in once the scene reaches a point, given as a share of the scene.
export function Reveal({ at, children, style }: { at: number; children: ReactNode; style?: React.CSSProperties }) {
  const frame = useCurrentFrame();
  const durationInFrames = useContext(SceneLength);
  const start = at * durationInFrames;
  const opacity = interpolate(frame, [start, start + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [start, start + 18], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ opacity, transform: `translateY(${Math.round(y)}px)`, ...style }}>{children}</div>;
}

// The caption at the bottom: the sentence being spoken right now, so the video also works without sound.
function Captions({ id }: { id: SceneId }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = narration.scenes.find((scene) => scene.id === id)?.text ?? "";
  const sentences = text.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()) ?? [text];
  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
  const start = LEAD_IN_SECONDS * fps;
  const length = durations[id].seconds * fps;
  if (frame < start || frame > start + length + fps) return null;
  const position = Math.min(total - 1, ((frame - start) / length) * total);
  let used = 0;
  let index = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    used += sentences[i].length;
    index = i;
    if (position < used) break;
  }
  return (
    <div style={{ position: "absolute", left: 80, right: 80, bottom: 36, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          background: "rgba(7, 13, 25, 0.85)",
          border: `1px solid ${colors.line}`,
          borderRadius: 14,
          padding: "12px 22px",
          fontSize: 26,
          lineHeight: 1.35,
          textAlign: "center",
          maxWidth: 1080,
        }}
      >
        {sentences[index]}
      </div>
    </div>
  );
}

// The frame around every scene: background, the voice, and the captions.
export function SceneFrame({ id, children }: { id: SceneId; children: ReactNode }) {
  const { fps } = useVideoConfig();
  return (
    <SceneLength.Provider value={framesFor(id, fps)}>
      <AbsoluteFill style={{ backgroundColor: colors.bg, fontFamily: font, color: colors.ink }}>
        {children}
        <Sequence from={Math.round(LEAD_IN_SECONDS * fps)}>
          <Audio src={staticFile(`audio/${id}.wav`)} />
        </Sequence>
        <Captions id={id} />
      </AbsoluteFill>
    </SceneLength.Provider>
  );
}

export function Title({ children, color }: { children: ReactNode; color?: string }) {
  return <div style={{ fontSize: 58, fontWeight: 700, letterSpacing: -1, color: color ?? colors.ink }}>{children}</div>;
}

export function RedFigure({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" aria-hidden="true">
      <polygon points="38,6 66,22 66,54 38,70 10,54 10,22" fill={colors.redDark} stroke={colors.red} strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points="38,6 66,22 10,22" fill={colors.red} fillOpacity="0.22" stroke={colors.red} strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="23" y1="33" x2="33" y2="37" stroke={colors.red} strokeWidth="3" strokeLinecap="round" />
      <line x1="53" y1="33" x2="43" y2="37" stroke={colors.red} strokeWidth="3" strokeLinecap="round" />
      <circle cx="30" cy="41" r="2.4" fill={colors.red} />
      <circle cx="46" cy="41" r="2.4" fill={colors.red} />
      <path d="M29 51 Q38 47 47 51" fill="none" stroke={colors.red} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Shield({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" aria-hidden="true">
      <circle cx="38" cy="38" r="34" fill="none" stroke={colors.green} strokeWidth="1.5" strokeDasharray="3 5" />
      <path d="M38 9 L60 17 V37 C60 51 51 60 38 67 C25 60 16 51 16 37 V17 Z" fill={colors.greenDark} stroke={colors.green} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="31" cy="30" r="2.6" fill={colors.green} />
      <circle cx="45" cy="30" r="2.6" fill={colors.green} />
      <path d="M29 41 Q38 48 47 41" fill="none" stroke={colors.green} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 52 L36 57 L47 47" fill="none" stroke={colors.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Scene 1: the problem ----------

export function Problem() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = frame / framesFor("scene1", fps); // this runs above the frame, so it works the length out itself
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 90 } });
  return (
    <SceneFrame id="scene1">
      <div style={{ position: "absolute", left: 90, top: 80, width: 640 }}>
        <Reveal at={0.02}><Title>You approve it.</Title></Reveal>
        <Reveal at={0.3} style={{ marginTop: 10 }}><Title color={colors.red}>The scammer tricked you.</Title></Reveal>
        <div style={{ marginTop: 40, display: "grid", gap: 18 }}>
          {LOSS_FIGURES.map((figure, index) => (
            <Reveal key={figure.big} at={0.55 + index * 0.14}>
              <div style={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 14, padding: "16px 22px" }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: colors.amber }}>{figure.big}</div>
                <div style={{ fontSize: 22, color: colors.muted }}>{figure.small}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 70, width: 380 }}>
        <div style={{ transform: `scale(${pop})`, transformOrigin: "top center", background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 28, padding: 28 }}>
          <div style={{ fontSize: 22, color: colors.muted }}>Pay to a new payee</div>
          <div style={{ fontSize: 46, fontWeight: 700, margin: "6px 0 18px" }}>2,400 USD</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: colors.greenDark, color: colors.green, borderRadius: 10, padding: "8px 16px", fontSize: 24 }}>
            Approved by you
          </div>
        </div>
        <div style={{ marginTop: 26, display: "flex", justifyContent: "center", opacity: interpolate(progress, [0.28, 0.36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <RedFigure size={190} />
        </div>
      </div>
    </SceneFrame>
  );
}

// ---------- Scene 2: what it does ----------

const STEPS = [
  { title: "Look at the payment", detail: "New payee? Unusual amount? A call going on?" },
  { title: "Read the words", detail: "Gemini spots pressure and secrecy" },
  { title: "Ask one question", detail: "Short, polite, never an accusation" },
  { title: "Decide", detail: "Allow, warn, or hold" },
];

export function HowItWorks() {
  return (
    <SceneFrame id="scene2">
      <div style={{ position: "absolute", left: 80, top: 54 }}>
        <Reveal at={0.0}><Title>A second look before the money moves</Title></Reveal>
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 170, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        {STEPS.map((step, index) => (
          <Reveal key={step.title} at={0.14 + index * 0.16}>
            <div style={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 16, padding: 22, height: 210 }}>
              <div style={{ fontSize: 34, fontWeight: 700, color: colors.teal }}>{index + 1}</div>
              <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0" }}>{step.title}</div>
              <div style={{ fontSize: 21, color: colors.muted, lineHeight: 1.3 }}>{step.detail}</div>
            </div>
          </Reveal>
        ))}
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 430, display: "flex", gap: 20, justifyContent: "center" }}>
        {[
          { label: "Allow", back: colors.greenDark, front: colors.green },
          { label: "Warn", back: colors.amberDark, front: colors.amber },
          { label: "Hold for a person", back: colors.redDark, front: colors.red },
        ].map((chip, index) => (
          <Reveal key={chip.label} at={0.72 + index * 0.05}>
            <div style={{ background: chip.back, color: chip.front, borderRadius: 12, padding: "12px 26px", fontSize: 28, fontWeight: 700 }}>{chip.label}</div>
          </Reveal>
        ))}
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 520, textAlign: "center" }}>
        <Reveal at={0.86}><div style={{ fontSize: 26, color: colors.muted }}>A person confirms every hold. The system never moves money.</div></Reveal>
      </div>
    </SceneFrame>
  );
}

// ---------- Scene 5: the evidence ----------

function Bar({ bar, at }: { bar: BarData; at: number }) {
  const frame = useCurrentFrame();
  const durationInFrames = useContext(SceneLength);
  const start = at * durationInFrames;
  const width = interpolate(frame, [start, start + 36], [0, bar.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const good = bar.value >= 80;
  return (
    <Reveal at={at}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, marginBottom: 6 }}>
        <span>{bar.label} <span style={{ color: colors.muted }}>({bar.n} cases)</span></span>
        <span style={{ fontWeight: 700, color: good ? colors.green : colors.amber }}>
          {Math.round(width)}%{bar.note ? ` - ${bar.note}` : ""}
        </span>
      </div>
      <div style={{ height: 22, background: colors.line, borderRadius: 11, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ width: `${width}%`, height: "100%", background: good ? colors.green : colors.amber }} />
      </div>
    </Reveal>
  );
}

export function Evidence() {
  return (
    <SceneFrame id="scene5">
      <div style={{ position: "absolute", left: 80, top: 44 }}>
        <Reveal at={0.0}><Title>We measured it, including the bad news</Title></Reveal>
      </div>
      <div style={{ position: "absolute", left: 80, top: 140, width: 520 }}>
        <Reveal at={0.06}><div style={{ fontSize: 24, color: colors.muted, marginBottom: 14 }}>Held-back test, run once, before the fix</div></Reveal>
        <Bar bar={BEFORE_FIX[0]} at={0.12} />
        <Bar bar={BEFORE_FIX[1]} at={0.24} />
      </div>
      <div style={{ position: "absolute", right: 80, top: 140, width: 520 }}>
        <Reveal at={0.45}><div style={{ fontSize: 24, color: colors.muted, marginBottom: 14 }}>After the fix, on a fresh test</div></Reveal>
        <Bar bar={AFTER_FIX[0]} at={0.5} />
        <Bar bar={AFTER_FIX[1]} at={0.6} />
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 450, display: "flex", justifyContent: "center" }}>
        <Reveal at={0.78}>
          <div style={{ background: colors.amberDark, color: colors.amber, borderRadius: 12, padding: "12px 24px", fontSize: 26, textAlign: "center" }}>
            Still open: a calm, coached victim can slip through. Samples are small.
          </div>
        </Reveal>
      </div>
    </SceneFrame>
  );
}

// ---------- Scene 6: built on Google Cloud ----------

function Box({ title, detail, at, left, top, tone }: { title: string; detail: string; at: number; left: number; top: number; tone: string }) {
  return (
    <Reveal at={at} style={{ position: "absolute", left, top, width: 300 }}>
      <div style={{ background: colors.panel, border: `2px solid ${tone}`, borderRadius: 16, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: tone }}>{title}</div>
        <div style={{ fontSize: 21, color: colors.muted, marginTop: 6 }}>{detail}</div>
      </div>
    </Reveal>
  );
}

function Arrow({ at, left, top }: { at: number; left: number; top: number }) {
  return (
    <Reveal at={at} style={{ position: "absolute", left, top, width: 120 }}>
      <svg width="120" height="30" viewBox="0 0 120 30" aria-hidden="true">
        <line x1="4" y1="15" x2="104" y2="15" stroke={colors.muted} strokeWidth="4" strokeLinecap="round" />
        <polyline points="92,4 108,15 92,26" fill="none" stroke={colors.muted} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Reveal>
  );
}

export function Architecture() {
  return (
    <SceneFrame id="scene6">
      <div style={{ position: "absolute", left: 80, top: 44 }}>
        <Reveal at={0.0}><Title>Built on Google Cloud</Title></Reveal>
      </div>
      <Box title="Browser" detail="Customer or judge" at={0.1} left={80} top={190} tone={colors.blue} />
      <Arrow at={0.22} left={390} top={225} />
      <Box title="Cloud Run" detail="Web app, guard rules, limits" at={0.3} left={500} top={190} tone={colors.teal} />
      <Arrow at={0.42} left={810} top={225} />
      <Box title="Vertex AI" detail="Gemini reads the words" at={0.5} left={920} top={190} tone={colors.green} />
      <div style={{ position: "absolute", left: 80, right: 80, top: 360, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
        {["Service identity, no keys in the code", "Rate limits and a cost guard", "A person confirms every hold", "All the data is made up"].map((tag, index) => (
          <Reveal key={tag} at={0.62 + index * 0.08}>
            <div style={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 999, padding: "10px 22px", fontSize: 24 }}>{tag}</div>
          </Reveal>
        ))}
      </div>
    </SceneFrame>
  );
}

// ---------- Scene 7: the close ----------

export function Close() {
  return (
    <SceneFrame id="scene7">
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <Reveal at={0.02}><Shield size={190} /></Reveal>
        <Reveal at={0.1}><div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -1 }}>Last Mile Guard</div></Reveal>
        <Reveal at={0.22}><div style={{ fontSize: 34, color: colors.teal }}>A second look before the money moves</div></Reveal>
      </AbsoluteFill>
    </SceneFrame>
  );
}

// The scene length in frames, for parts that need to time things against it.
export const useSceneFrames = () => useContext(SceneLength);
