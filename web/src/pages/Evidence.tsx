import evidence from "../data/evidence.json";

function BarRow({ label, value, note, tone }: { label: string; value: number; note?: string; tone: "good" | "warn" | "plain" }) {
  return (
    <li>
      <div className="bar-head"><span>{label}</span><span className="mono">{value}%</span></div>
      <div className="bar-track" role="img" aria-label={`${label}: ${value} percent`}>
        <div className={`bar-fill big ${tone}`} style={{ width: `${Math.max(value, 1)}%` }} />
      </div>
      {note && <span className="muted small">{note}</span>}
    </li>
  );
}

export function Evidence() {
  const statusClass = (status: string) => (status.startsWith("Fixed") ? "ok" : status.startsWith("Holding") ? "hold-on" : "open");
  return (
    <div className="evidence">
      <section className="card">
        <h2 className="eyebrow">Scams flagged</h2>
        <p className="muted">The share of made-up scam cases that earned a warning or a hold.</p>
        <ul className="chart">
          {evidence.scamsFlagged.map((row, index) => (
            <BarRow key={row.label} label={row.label} value={row.value} note={row.note} tone={index === 0 ? "plain" : index === 1 ? "good" : "warn"} />
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="eyebrow">Genuine payments given friction</h2>
        <p className="muted">A warning, a question or a hold on a payment that was genuine. Lower is better.</p>
        <ul className="chart">
          {evidence.friction.map((row, index) => (
            <BarRow key={row.label} label={row.label} value={row.value} tone={index === 0 ? "good" : "warn"} />
          ))}
        </ul>
      </section>

      <section className="card wide-card">
        <h2 className="eyebrow">{evidence.scenarioRun.title}</h2>
        <p className="muted">
          An automatic factory wrote made-up scenarios and a simulated customer played each one. The site never saw the
          answers. {evidence.scenarioRun.overall}.
        </p>
        <ul className="chart">
          {evidence.scenarioRun.rows.map((row) => (
            <BarRow key={row.label} label={`${row.label} (${row.n})`} value={row.value} tone={row.value >= 80 ? "good" : "warn"} />
          ))}
        </ul>
      </section>

      <section className="card wide-card">
        <h2 className="eyebrow">What we tested, found and fixed</h2>
        <p className="muted">A red-team agent, a blind test written by someone else, and our own scenario factory attacked the system.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th scope="col">What we found</th><th scope="col">What we did</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {evidence.findings.map((row) => (
                <tr key={row.found}>
                  <td>{row.found}</td>
                  <td>{row.fix}</td>
                  <td><span className={`status-tag ${statusClass(row.status)}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card wide-card">
        <h2 className="eyebrow">What this does not prove</h2>
        <ul className="reasons">
          {evidence.limits.map((limit) => <li key={limit}>{limit}</li>)}
        </ul>
      </section>
    </div>
  );
}
