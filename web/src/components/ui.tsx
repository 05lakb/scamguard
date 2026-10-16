// Small building blocks shared by the command-centre pages.

import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type Tone = "teal" | "red" | "amber" | "green" | "violet" | "blue" | "slate";

export const toneForAction = (action: string): Tone =>
  action === "hold" ? "red" : action === "warn" ? "amber" : action === "ask" ? "blue" : "green";

export const toneForLevel = (level: string): Tone => (level === "high" ? "red" : level === "medium" ? "amber" : "green");

// A circular 0–100 score, like a speedometer dial seen from the front.
export function ScoreRing({ score, tone, label = "RISK", size = 132 }: { score: number; tone: Tone; label?: string; size?: number }) {
  const radius = 52;
  const circle = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circle;
  return (
    <svg className={`ring tone-${tone}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${label} ${score} out of 100`}>
      <circle cx="60" cy="60" r={radius} className="ring-track" />
      <circle cx="60" cy="60" r={radius} className="ring-fill" strokeDasharray={`${filled} ${circle}`} transform="rotate(-90 60 60)" />
      <text x="60" y="62" textAnchor="middle" className="ring-number">{score}</text>
      <text x="60" y="80" textAnchor="middle" className="ring-sub">/100</text>
      <text x="60" y="94" textAnchor="middle" className="ring-label">{label}</text>
    </svg>
  );
}

export function StatCard({ icon, tone, label, value, hint }: { icon: IconName; tone: Tone; label: string; value: ReactNode; hint?: string }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon tone-${tone}`}><Icon name={icon} size={18} /></span>
      <div>
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {hint && <small className="stat-hint">{hint}</small>}
      </div>
    </article>
  );
}

export function PanelHead({ kicker, title, icon, children }: { kicker?: string; title: string; icon?: IconName; children?: ReactNode }) {
  return (
    <div className="panel-head">
      <div>
        {kicker && <p className="kicker">{kicker}</p>}
        <h2>{title}</h2>
      </div>
      <div className="panel-head-side">
        {children}
        {icon && <span className="panel-icon"><Icon name={icon} size={18} /></span>}
      </div>
    </div>
  );
}

export function PageHead({ kicker, title, accent, text, children }: { kicker: string; title: string; accent?: string; text: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <p className="kicker live"><span className="dot" /> {kicker}</p>
        <h1>{title} {accent && <span className="grad">{accent}</span>}</h1>
        <p className="page-sub">{text}</p>
      </div>
      {children && <div className="page-head-side">{children}</div>}
    </header>
  );
}

// A labelled horizontal bar used for distributions (high / medium / low and similar).
export function DistRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: Tone }) {
  const share = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="dist-row">
      <div className="dist-head">
        <span><i className={`dot-sm tone-${tone}`} /> {label}</span>
        <strong className="mono">{value}</strong>
      </div>
      <div className="dist-track"><div className={`dist-fill tone-${tone}`} style={{ width: `${share}%` }} /></div>
      <small className="muted">{share}%</small>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <strong>{title}</strong>
      <p className="muted">{text}</p>
      {action}
    </div>
  );
}

export function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle" htmlFor={id}>
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
