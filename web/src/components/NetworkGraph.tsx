// Draws a small account graph: the payment recipient in the middle, senders on the left,
// onward transfers on the right. Used by the Transactions investigation and the Network page.

import type { AccountNetwork } from "../core/types";

interface NodePos {
  id: string;
  x: number;
  y: number;
}

export function layoutNetwork(graph: AccountNetwork): NodePos[] {
  const payee = graph.payee_account_id;
  const ids = [...new Set(graph.transfers.flatMap((t) => [t.from_account_id, t.to_account_id]).concat(payee))];
  const inbound = ids.filter((id) => id !== payee && graph.transfers.some((t) => t.from_account_id === id && t.to_account_id === payee));
  const outbound = ids.filter((id) => id !== payee && !inbound.includes(id) && graph.transfers.some((t) => t.from_account_id === payee && t.to_account_id === id));
  const rest = ids.filter((id) => id !== payee && !inbound.includes(id) && !outbound.includes(id));
  const column = (list: string[], x: number) => list.map((id, i) => ({ id, x, y: ((i + 1) * 440) / (list.length + 1) }));
  return [{ id: payee, x: 340, y: 220 }, ...column(inbound, 90), ...column(outbound, 560), ...column(rest, 760)];
}

interface Props {
  graph: AccountNetwork;
  markerId: string;
  query?: string;
  onToggle?: (account: string) => void;
}

export function NetworkGraph({ graph, markerId, query = "", onToggle }: Props) {
  const nodes = layoutNetwork(graph);
  const pos = (account: string) => nodes.find((n) => n.id === account)!;
  const flagged = new Set(graph.flagged_account_ids);
  const match = query.trim().toLowerCase();
  const width = nodes.some((n) => n.x > 700) ? 840 : 660;

  return (
    <>
      <svg className="net-graph" viewBox={`0 0 ${width} 440`} role="img" aria-label="Synthetic account graph around the payment recipient. Transfers are also listed as text.">
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="28" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path className="arrow-head" d="M0 0 10 5 0 10z" /></marker>
        </defs>
        {graph.transfers.map((t, i) => {
          const a = pos(t.from_account_id);
          const b = pos(t.to_account_id);
          const hot = flagged.has(t.from_account_id) || flagged.has(t.to_account_id);
          return <line key={i} className={hot ? "hot" : ""} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd={`url(#${markerId})`} />;
        })}
        {nodes.map((n) => {
          const isPayee = n.id === graph.payee_account_id;
          const dim = match && !n.id.toLowerCase().includes(match);
          const kind = flagged.has(n.id) ? "flagged" : isPayee ? "payee" : "";
          const interactive = Boolean(onToggle);
          return (
            <g key={n.id} className={`node ${kind} ${dim ? "dim" : ""}`}
              {...(interactive ? {
                role: "button", tabIndex: 0, "aria-label": `${n.id}${flagged.has(n.id) ? ", flagged" : ""}. Press to toggle flag.`,
                onClick: () => onToggle!(n.id),
                onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle!(n.id); } },
                style: { cursor: "pointer" },
              } : {})}>
              <circle cx={n.x} cy={n.y} r={isPayee ? 26 : 20} />
              <text className="node-glyph" x={n.x} y={n.y + 5} textAnchor="middle">{flagged.has(n.id) ? "!" : isPayee ? "P" : "A"}</text>
              <text x={n.x} y={n.y + (isPayee ? 44 : 36)} textAnchor="middle">{n.id}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span><i style={{ borderColor: "var(--accent-2)" }} /> Payment recipient</span>
        <span><i style={{ borderColor: "var(--hold)" }} /> Flagged account</span>
        <span><i style={{ borderColor: "var(--accent)" }} /> Other account</span>
        <span>Arrows show transfer direction</span>
      </div>
    </>
  );
}
