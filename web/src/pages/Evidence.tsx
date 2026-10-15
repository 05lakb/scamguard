import { PairedEvidence } from "./PairedEvidence";
import evidence from "../data/evidence.json";
import report from "../data/verifiedEvidence.json";
import { sourceLink } from "../lib/stage";

function BarRow({ label, value, note }: { label: string; value: number; note?: string }) {
  return <li>
    <div className="bar-head"><span>{label}</span><span className="mono">{value}%</span></div>
    <div className="bar-track" role="img" aria-label={`${label}: ${value} percent`}>
      <div className="bar-fill big plain" style={{ width: `${Math.min(100, Math.max(value, 0))}%` }} />
    </div>
    {note && <span className="muted small">{note}</span>}
  </li>;
}

function downloadReport() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "finguard-payment-rules-evidence.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const metricCards = [
  { key: "scams_flagged", title: "Scams flagged", description: "Scam cases receiving a warning or hold. Higher is better.", direction: "Detection" },
  { key: "genuine_friction", title: "Genuine payments interrupted", description: "Genuine cases receiving a warning or hold. Lower is better.", direction: "Customer impact" },
  { key: "expected_matches", title: "Expected actions matched", description: "Cases whose action is in the dataset's acceptable actions.", direction: "Scenario agreement" },
] as const;

export function Evidence() {
  return <div className="evidence-review">
    <header className="evidence-heading">
      <div><p className="eyebrow">Evaluation & limitations</p>
        <h1>Evidence you can inspect.</h1>
        <p className="muted">Compare the same cases with and without message analysis. Inspect what worked, what failed and what is still untested.</p>
      </div>

    </header>

    <PairedEvidence />

    <details className="card evidence-details"><summary>Additional baseline: payment rules on 200 synthetic cases</summary>
    <button type="button" className="ghost" onClick={downloadReport}>Download payment-rules baseline</button>
    <section className="evidence-baseline" aria-labelledby="baseline-title">
      <div className="evidence-baseline-heading">
        <div><p className="eyebrow">Recorded offline run</p><h2 id="baseline-title">FraudShield · Payment rules</h2></div>
        <span className="evidence-scope">Synthetic data only</span>
      </div>
      <p>This snapshot tests payment behaviour rules against {report.total_cases} made-up cases. It does not measure Gemini, MuleNet, follow-up conversations or the combined decision.</p>
      <div className="evidence-metrics">
        {metricCards.map(({ key, title, description, direction }) => {
          const metric = report.metrics[key];
          return <article className="evidence-metric" key={key}>
            <span className="eyebrow">{direction}</span><h3>{title}</h3>
            <strong>{metric.percent === null ? "N/A" : `${metric.percent}%`}</strong>
            <span className="evidence-count">{metric.numerator} / {metric.denominator} cases</span>
            <p>{description}</p>
          </article>;
        })}
      </div>
      <div className="evidence-run-meta">
        <span>Generated <time dateTime={report.generated_at}>{report.generated_at.replace("T", " ").replace("+00:00", " UTC")}</time></span>
        <span>{report.included_cases} included · {report.excluded_cases} excluded for low-confidence labels</span>
      </div>
    </section>

    </details>

    <div className="evidence-method-grid">
      <section className="card"><h2>What this establishes</h2>
        <p>The downloads show the inputs and decisions for these specific synthetic datasets. The paired run uses the real assessment API with Gemini; the separate 200-case baseline tests payment rules alone.</p>
        <p className="muted">The cases and labels were created for this project. These percentages are test-set results, not estimates of real-world fraud detection or calibrated confidence.</p>
      </section>
      <section className="card"><h2>What still needs evidence</h2>
        <ul className="reasons"><li>Completed follow-up conversations on cases with independently written customer answers.</li>
          <li>An independent held-out dataset and larger samples of genuine payments.</li>
          <li>Separate network-check results, failure behaviour and measured latency under load.</li></ul>
      </section>
    </div>

    <details className="card evidence-details"><summary>Reproduce the 200-case rules baseline & inspect its sources</summary>
      <p>From the repository root, run <code>{report.command}</code>, then rebuild the web app to update this snapshot. This command makes no external calls.</p>
      <p>Cases with low-confidence labels are excluded from all three metrics. Empty groups are reported as N/A.</p>
      <p className="muted">SHA-256 fingerprints identify the exact inputs and code used. A later code change requires a new report.</p>
      <dl className="evidence-hashes">{Object.entries(report.source_sha256).map(([file, hash]) => <div key={file}><dt>{file}</dt><dd><code>{hash}</code></dd></div>)}</dl>
    </details>

    <details className="card evidence-details evidence-archive"><summary>Historical experiments <span className="evidence-scope">Supporting reports missing</span></summary>
      <p className="honest">These are previously recorded summaries. The underlying run reports, run dates and model versions were not found in this checkout. Treat them as development notes, not verified performance of this build.</p>
      <div className="evidence-method-grid">
        <section><h3>Reported scams flagged</h3><p className="muted small">Warning or hold; higher is better. Different datasets are not direct comparisons.</p>
          <ul className="chart">{evidence.scamsFlagged.map(row => <BarRow key={row.label} label={row.label} value={row.value} />)}</ul></section>
        <section><h3>Reported genuine-payment friction</h3><p className="muted small">Warning, question or hold; lower is better. Historical scope differs from the baseline above.</p>
          <ul className="chart">{evidence.friction.map(row => <BarRow key={row.label} label={row.label} value={row.value} />)}</ul></section>
      </div>
      <section className="evidence-archive-section"><h3>{evidence.scenarioRun.title}</h3>
        <p className="muted">Reported agreement with expected actions, by category. {evidence.scenarioRun.overall}.</p>
        <ul className="chart">{evidence.scenarioRun.rows.map(row => <BarRow key={row.label} label={row.label} value={row.value} note={`${row.n} scenarios`} />)}</ul>
      </section>
      <section className="evidence-archive-section"><h3>{evidence.publicReports.title}</h3>
        <p>{evidence.publicReports.intro}</p><p className="muted">These generated scenarios are not regulator-provided test data or an endorsement.</p>
        <ul className="chart">{evidence.publicReports.rows.map(row => <BarRow key={row.label} label={row.label} value={row.value} note={`${row.n} cases; metric specified in the label`} />)}</ul>
        <p className="honest">{evidence.publicReports.pending}</p>
        <h4>Public scam education referenced by the project</h4>
        <ul>{evidence.publicReports.sources.map(source => { const link = sourceLink(source); return link ? <li key={source.name}><a href={link} target="_blank" rel="noopener noreferrer">{source.name}</a></li> : null; })}</ul>
      </section>
      <section className="evidence-archive-section"><h3>Reported findings & changes</h3>
        <p className="muted">A reported fix is not proof of a passing fresh test. All statuses below need linked run evidence.</p>
        <div className="table-wrap"><table><thead><tr><th scope="col">Finding</th><th scope="col">Reported change</th><th scope="col">Recorded status</th></tr></thead>
          <tbody>{evidence.findings.map(row => <tr key={row.found}><td>{row.found}</td><td>{row.fix}</td><td><span className="status-tag open">{row.status}</span></td></tr>)}</tbody>
        </table></div>
      </section>
    </details>
  </div>;
}
