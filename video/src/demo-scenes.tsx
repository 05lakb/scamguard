import type { ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { RedFigure, Reveal, SceneFrame, Shield, useSceneFrames } from "./scenes";
import { colors } from "./theme";

// Scenes 3 and 4 show the live site. Until real screen recordings are swapped in, these are animated
// recreations of it, and they say so on screen.

function RecreationTag() {
  return (
    <div style={{ position: "absolute", right: 36, top: 22, fontSize: 18, color: colors.muted, border: `1px solid ${colors.line}`, borderRadius: 999, padding: "4px 14px" }}>
      Animated recreation of the live site
    </div>
  );
}

// Text that types itself out between two points of the scene, given as shares of the scene.
function Typed({ text, at, span }: { text: string; at: number; span: number }) {
  const frame = useCurrentFrame();
  const length = useSceneFrames();
  const shown = Math.floor(interpolate(frame, [at * length, (at + span) * length], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return <span>{text.slice(0, shown)}</span>;
}

function Pill({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      style={{
        padding: "8px 18px",
        borderRadius: 999,
        fontSize: 22,
        background: on ? "#0f2f2e" : colors.panel,
        color: on ? colors.teal : colors.muted,
        border: `1px solid ${on ? colors.teal : colors.line}`,
        fontWeight: on ? 700 : 400,
      }}
    >
      {label}
    </div>
  );
}

function Card({ title, tone, children, style }: { title: string; tone?: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: colors.panel, border: `1px solid ${tone ?? colors.line}`, borderRadius: 14, padding: "14px 18px", ...style }}>
      <div style={{ fontSize: 16, letterSpacing: 1.5, textTransform: "uppercase", color: colors.muted, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Bubble({ who, tone, at, children }: { who: string; tone: "customer" | "guard"; at: number; children: ReactNode }) {
  const guard = tone === "guard";
  return (
    <Reveal at={at} style={{ display: "flex", justifyContent: guard ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div
        style={{
          maxWidth: 440,
          padding: "8px 14px",
          borderRadius: 12,
          fontSize: 21,
          background: guard ? "#14284d" : colors.bg,
          border: `1px solid ${guard ? colors.blue : colors.line}`,
          color: guard ? colors.blue : colors.ink,
        }}
      >
        <div style={{ fontSize: 14, letterSpacing: 1.2, textTransform: "uppercase", color: guard ? colors.blue : colors.muted }}>{who}</div>
        {children}
      </div>
    </Reveal>
  );
}

function Chip({ label, back, front }: { label: string; back: string; front: string }) {
  return <div style={{ display: "inline-block", background: back, color: front, borderRadius: 10, padding: "6px 16px", fontSize: 22, fontWeight: 700 }}>{label}</div>;
}

// ---------- Scene 3: the live demo ----------

export function LiveDemo() {
  const frame = useCurrentFrame();
  const length = useSceneFrames();
  const second = frame / length >= 0.55;
  return (
    <SceneFrame id="scene3">
      <RecreationTag />
      <div style={{ position: "absolute", left: 60, top: 22, display: "flex", gap: 10 }}>
        <Pill label="Try one case" on={!second} />
        <Pill label="Watch the red team" on={false} />
        <Pill label="Your own scenario" on={second} />
      </div>

      <div style={{ position: "absolute", left: 140, top: 22, width: 1280, height: 720, transform: "scale(0.78)", transformOrigin: "top left" }}>
      <div style={{ position: "absolute", left: 60, top: 84, width: 560 }}>
        <Card title="Case file">
          <div style={{ fontSize: 22, lineHeight: 1.5 }}>
            <div><span style={{ color: colors.muted }}>Customer </span>Retired person</div>
            <div><span style={{ color: colors.muted }}>Payment </span>2,400 USD to Jordan Ellis</div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Chip label="New payee" back={colors.amberDark} front={colors.amber} />
            <Chip label="On a phone call" back={colors.amberDark} front={colors.amber} />
          </div>
        </Card>
        <div style={{ marginTop: 12 }}>
          <Bubble who="Customer" tone="customer" at={0.06}>
            <Typed text="moving money to a safe account like the bank asked" at={0.07} span={0.08} />
          </Bubble>
          <Bubble who="Guard" tone="guard" at={0.18}>How do you know this person, and have you met?</Bubble>
          <Bubble who="Customer" tone="customer" at={0.28}>
            <Typed text="The bank called me. They said it is urgent." at={0.29} span={0.07} />
          </Bubble>
        </div>
        <Reveal at={0.4}>
          <Card title="The guard decided" tone={colors.red}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Chip label="Held for review" back={colors.redDark} front={colors.red} />
              <span style={{ fontSize: 22, color: colors.muted }}>risk 100</span>
            </div>
            <div style={{ fontSize: 20, marginTop: 8, lineHeight: 1.4 }}>
              A phone call was going on while paying. Money is going to someone not paid before. The answer gives nothing to check.
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal at={0.55} style={{ position: "absolute", left: 660, top: 84, width: 560 }}>
        <Card title="Your own scenario" tone={colors.teal}>
          <div style={{ fontSize: 21, lineHeight: 1.4, minHeight: 92, background: colors.bg, border: `1px solid ${colors.line}`, borderRadius: 10, padding: 12 }}>
            <Typed text="Someone I met online asked me to send money for a hospital bill, and asked me to keep it private." at={0.57} span={0.13} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <Chip label="Being tricked" back={colors.redDark} front={colors.red} />
            <Chip label="New payee" back={colors.amberDark} front={colors.amber} />
            <Chip label="1,800 USD" back={colors.panel} front={colors.ink} />
          </div>
          <Reveal at={0.73} style={{ marginTop: 14 }}>
            <div style={{ display: "inline-block", background: colors.teal, color: "#04201c", borderRadius: 10, padding: "10px 22px", fontSize: 22, fontWeight: 700 }}>Play this scenario</div>
          </Reveal>
          <Reveal at={0.79} style={{ marginTop: 14 }}>
            <Chip label="Held for review" back={colors.redDark} front={colors.red} />
          </Reveal>
        </Card>
        <Reveal at={0.87} style={{ marginTop: 14 }}>
          <Card title="A genuine customer, ordinary payment">
            <Chip label="Allowed" back={colors.greenDark} front={colors.green} />
            <span style={{ fontSize: 21, color: colors.muted, marginLeft: 12 }}>Wrongly stopping people is a cost too.</span>
          </Card>
        </Reveal>
      </Reveal>
      </div>
    </SceneFrame>
  );
}

// ---------- Scene 4: the red team ----------

const STAGES = ["Prepare", "Attack", "Analyse", "Decide"];
const CHECKS = ["Payment behaviour", "Last 15 days", "Reading the message", "Matching scam patterns"];

export function RedTeam() {
  const frame = useCurrentFrame();
  const length = useSceneFrames();
  const progress = frame / length;
  const stage = progress < 0.3 ? 0 : progress < 0.4 ? 1 : progress < 0.7 ? 2 : 3;
  const pulse = 1 + 0.04 * Math.sin(frame / 7);
  const dots = Math.floor(frame / 6) % 4;
  return (
    <SceneFrame id="scene4">
      <RecreationTag />
      <div style={{ position: "absolute", left: 60, top: 22, display: "flex", gap: 10 }}>
        {STAGES.map((name, index) => <Pill key={name} label={`${index + 1} ${name}`} on={index === stage} />)}
      </div>

      <div style={{ position: "absolute", left: 140, top: 22, width: 1280, height: 720, transform: "scale(0.78)", transformOrigin: "top left" }}>
      <div style={{ position: "absolute", left: 60, right: 60, top: 78, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ textAlign: "center", width: 300 }}>
          <RedFigure size={130} />
          <div style={{ fontSize: 24, fontWeight: 700 }}>Red agent</div>
          <div style={{ fontSize: 18, color: colors.muted }}>Plays the customer. Test only.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[0, 1, 2].map((index) => (
            <div key={index} style={{ width: 14, height: 14, borderRadius: 7, background: colors.red, opacity: stage === 1 ? (dots > index ? 1 : 0.25) : 0.25 }} />
          ))}
        </div>
        <div style={{ textAlign: "center", width: 300 }}>
          <div style={{ transform: `scale(${pulse})`, display: "inline-block" }}><Shield size={130} /></div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Bank guard</div>
          <div style={{ fontSize: 18, color: colors.muted }}>A person confirms every hold.</div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 60, top: 300, width: 560 }}>
        <Card title="Mock case the red agent prepared" tone={colors.red}>
          <div style={{ fontSize: 21, lineHeight: 1.55 }}>
            <Reveal at={0.04}><div><span style={{ color: colors.muted }}>Customer </span>young professional</div></Reveal>
            <Reveal at={0.09}><div><span style={{ color: colors.muted }}>Payment </span>2,000 USD to a new payee</div></Reveal>
            <Reveal at={0.14}><div><span style={{ color: colors.muted }}>Plan </span>Play: a romance scam</div></Reveal>
            <Reveal at={0.19}><div><span style={{ color: colors.muted }}>Goal </span>Slip the payment past the guard</div></Reveal>
          </div>
          <Reveal at={0.23}>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${colors.line}`, fontSize: 18, color: colors.muted }}>
              Modelled on a public page: <span style={{ color: colors.teal }}>Relationship scams | Scamwatch</span>
            </div>
          </Reveal>
        </Card>
        <div style={{ marginTop: 10 }}>
          <Bubble who="Red agent" tone="customer" at={0.31}>sending money for his travel so we can finally meet</Bubble>
        </div>
      </div>

      <div style={{ position: "absolute", left: 660, top: 300, width: 560 }}>
        <Card title="The guard is analysing" tone={colors.green}>
          <div style={{ display: "grid", gap: 8, fontSize: 22 }}>
            {CHECKS.map((name, index) => (
              <Reveal key={name} at={0.4 + index * 0.07}>
                <div style={{ color: colors.green }}>{"✓"} {name}</div>
              </Reveal>
            ))}
          </div>
        </Card>
        <Reveal at={0.7} style={{ marginTop: 12 }}>
          <Card title="Decision" tone={colors.red}>
            <Chip label="Held for review" back={colors.redDark} front={colors.red} />
            <div style={{ fontSize: 21, marginTop: 8 }}>Scam stopped before any money moved.</div>
          </Card>
        </Reveal>
        <Reveal at={0.86} style={{ marginTop: 12 }}>
          <div style={{ background: colors.amberDark, color: colors.amber, borderRadius: 12, padding: "10px 18px", fontSize: 21 }}>
            Some slip through. We show those too.
          </div>
        </Reveal>
      </div>
      </div>
    </SceneFrame>
  );
}
