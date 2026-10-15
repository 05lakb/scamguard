import report from "../data/pairedEvidenceSummary.json";
import reportUrl from "../data/pairedEvidence.json?url";
import initialReportUrl from "../data/pairedEvidenceInitial.json?url";

const rows = [
  { key: "scams_flagged", label: "Scams warned or held", note: "Higher is better. A question is still pending." },
  { key: "genuine_friction", label: "Genuine payments interrupted", note: "Lower is better. Includes warnings, holds and questions." },
  { key: "expected_matches", label: "Expected actions matched", note: "Higher is better. Uses the dataset's original labels." },
  { key: "questions", label: "Waiting for a customer answer", note: "These are unfinished conversations, not final decisions." },
] as const;

type Metric = { numerator: number; denominator: number; percent: number | null };
const format = (metric: Metric) => metric.percent === null ? "N/A" : `${metric.numerator} / ${metric.denominator} (${metric.percent}%)`;
const seconds = (ms: number | null) => ms === null ? "N/A" : `${(ms / 1000).toFixed(1)} s`;

export function PairedEvidence() {
  const fresh = (report.execution_modes as Record<string, number>).gemini_live ?? 0;
  return <section className="paired-evidence" aria-labelledby="paired-title">
    <div className="paired-heading"><div><p className="eyebrow">Same cases · Two approaches</p>
      <h2 id="paired-title">What changes when we add Gemini?</h2></div>
      <a className="primary paired-download" href={reportUrl} download="finguard-paired-evaluation.json">Download full run</a>
    </div>
    <p>We sent the same {report.total_cases} synthetic cases through payment rules and the complete first-round assessment. That assessment adds Gemini message analysis, message safeguards and follow-up questions.</p>
    <p className="paired-caveat">Development benchmark · Existing cases with unverified independence. This measures this run, not real-world fraud accuracy.</p>
    <div className="table-wrap"><table className="paired-table"><caption>Recorded first-round outcomes; {report.included_cases} included and {report.excluded_cases} excluded for low-confidence labels.</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col">Payment rules</th><th scope="col">Combined assessment</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.label}<small>{row.note}</small></th><td>{format(report.rules[row.key])}</td><td>{format(report.combined[row.key])}</td></tr>)}</tbody>
    </table></div>
    <p className="muted small">Of the pending conversations, {report.pending_by_label.scam} have scam labels and {report.pending_by_label.legit} have genuine-payment labels. Their final outcomes have not been measured.</p>
    <div className="paired-facts">
      <article><h3>Did AI actually run?</h3><strong>{fresh} / {report.total_cases}</strong><p>Assessments finished with a fresh Gemini reading.</p>
        <p>{report.fallbacks} fell back to rules. {report.errors} returned no decision. Failures stay in the results.</p></article>
      <article><h3>How long did it take?</h3><strong>{seconds(report.fresh_backend_latency.median_ms)}</strong><p>Median backend time for {report.fresh_backend_latency.n} assessments with fresh Gemini readings.</p>
        <p>95th percentile: {seconds(report.fresh_backend_latency.p95_ms)}. Includes follow-up generation where used; excludes browser and cloud cold-start time.</p></article>
    </div>
    <details className="paired-method"><summary>Inspect the method, changed decisions and failure run</summary>
      <p>{report.method}</p><p>{report.latency_scope}</p>
      <p>No follow-up answers were invented. A result of <code>ask</code> is pending and does not count as a scam warned or held. Errors count as nonmatches and are reported separately from customer friction.</p>
      <dl className="paired-metadata"><div><dt>Run</dt><dd>{report.run_id}</dd></div><div><dt>Model / provider</dt><dd>{report.model} / {report.provider}</dd></div><div><dt>Completed</dt><dd><time dateTime={report.generated_at}>{report.generated_at}</time></dd></div></dl>
      <p>Reproduce with <code>{report.command}</code>, then run <code>.venv/Scripts/python.exe eval/export_paired_summary.py</code> and rebuild the web app. The evaluation makes paid model calls. Full inputs, outputs, stage events, request IDs and source fingerprints are in the download.</p>
      <h3>{report.changed_actions} changed first-round actions</h3>
      <div className="table-wrap"><table><thead><tr><th scope="col">Case</th><th scope="col">Dataset label</th><th scope="col">Rules</th><th scope="col">Combined</th></tr></thead><tbody>
        {report.changed_cases.map(row => <tr key={row.id}><td>{row.id}</td><td>{row.label === "legit" ? "Genuine" : "Scam"}</td><td>{row.rules}</td><td>{row.combined === "ask" ? "Ask · pending" : row.combined}</td></tr>)}
      </tbody></table></div>
      <h3>Earlier quota-limited run retained</h3>
      <p>The first unpaced run completed 9 assessments with fresh Gemini readings and hit provider quota limits on 41 of 50 cases. The repeat uses 15-second minimum spacing between cases; this is not evidence of production throughput.</p>
      <a href={initialReportUrl} download="finguard-initial-quota-run.json">Download the earlier run, including all fallbacks</a>
    </details>
  </section>;
}
