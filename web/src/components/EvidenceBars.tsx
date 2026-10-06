import { maxPoints, type Contribution } from "../lib/contrib";

// "Why", ranked by weight. Each row is a reason, with a bar and a points figure.
// Hover or focus a row to see the plain-language explanation.

export function EvidenceBars({ items }: { items: Contribution[] }) {
  if (items.length === 0) return <p className="muted">Nothing unusual was found.</p>;
  const top = maxPoints(items);
  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.label} title={item.why} tabIndex={0}>
          <div className="bar-head">
            <span>{item.label}</span>
            <span className="mono">{item.points > 0 ? `+${item.points}` : item.points}</span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <div className={`bar-fill ${item.kind} ${item.points < 0 ? "negative" : ""}`} style={{ width: `${Math.max(4, (Math.abs(item.points) / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
