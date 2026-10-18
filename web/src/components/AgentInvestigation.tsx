import type { AssessmentEvent, Investigation } from "../api";
import { Icon, type IconName } from "./Icon";

const TOOL: Record<string, { label: string; icon: IconName }> = {
  lookup_payee_history: { label: "Payee history", icon: "user" },
  get_customer_profile: { label: "Customer profile and phone signals", icon: "device" },
  check_mule_network: { label: "Mule network", icon: "network" },
  search_scam_playbook: { label: "Scam playbook", icon: "flag" },
};

function resultLine(tool: string, result: Record<string, unknown>): string {
  const r = result as Record<string, never>;
  if (tool === "lookup_payee_history") return `${r.new_payee ? "New payee" : "Known payee"}, ${r.payee_type}, account ${r.account_age_days} days old`;
  if (tool === "get_customer_profile") {
    const flags = [r.on_a_live_call && "on a live call", r.remote_access_app_running && "remote-access app", r.known_device === false && "new device", r.location_changed && "unusual location"].filter(Boolean);
    return `${r.times_usual}× the usual payment at ${r.time}${flags.length ? `; ${flags.join(", ")}` : ""}`;
  }
  if (tool === "check_mule_network") return r.available ? `Network score ${r.network_score}: ${((r.findings as unknown as string[]) ?? []).slice(0, 2).join(" ")}` : "No account-link data for this payee";
  if (tool === "search_scam_playbook") {
    const matches = (r.matches as unknown as { name: string }[]) ?? [];
    return matches.length ? `Matches: ${matches.map((m) => m.name).join(", ")}` : "No matching scam type";
  }
  return "";
}

// The AI investigator: which read-only lookups Gemini chose, what each returned, and its cited summary.
export function AgentInvestigation({ investigation, running }: { investigation?: Investigation | null; running?: AssessmentEvent }) {
  if (!investigation && !running) return null;
  const busy = !investigation && running?.status === "running";
  return (
    <section className="panel agent-investigation" aria-label="AI investigator">
      <div className="agent-head">
        <span className="agent-icon"><Icon name="brain" size={18} /></span>
        <div>
          <span className="kicker">AI investigator · Gemini function calling</span>
          <h3>{busy ? "Investigating…" : investigation?.status === "failed" ? "Investigator unavailable" : "What the agent looked up"}</h3>
          <p className="muted small">Gemini chooses which read-only lookups to run and cites them. It cannot change the score or release the payment.</p>
        </div>
        {busy && <span className="spin" />}
      </div>
      {busy && running?.detail && <p className="small agent-live">{running.detail}</p>}
      {investigation && investigation.steps.length > 0 && (
        <ol className="agent-steps">
          {investigation.steps.map((step, index) => {
            const tool = TOOL[step.tool] ?? { label: step.tool, icon: "search" as IconName };
            const cited = investigation.cited.includes(step.tool);
            return (
              <li key={step.tool}>
                <span className="agent-step-no">{index + 1}</span>
                <div>
                  <strong><Icon name={tool.icon} size={14} /> {tool.label}{step.query ? <small> “{step.query}”</small> : null}</strong>
                  <span className="muted small">Why: {step.reason}</span>
                  <span className="small">{resultLine(step.tool, step.result)}</span>
                </div>
                <span className={`agent-cite ${cited ? "on" : ""}`}>{cited ? "Cited" : "Not cited"}</span>
              </li>
            );
          })}
        </ol>
      )}
      {investigation?.summary && (
        <div className="agent-summary">
          <p><strong>Findings for the analyst:</strong> {investigation.summary}</p>
          {investigation.concerns.length > 0 && <ul>{investigation.concerns.map((c) => <li key={c}>{c}</li>)}</ul>}
          {investigation.callback_question && <p className="small"><strong>Ask on the call-back:</strong> {investigation.callback_question}</p>}
          {investigation.dropped_citations.length > 0 && <p className="muted small">Dropped citations to lookups it did not run: {investigation.dropped_citations.join(", ")}.</p>}
        </div>
      )}
      {investigation && investigation.status !== "complete" && investigation.status !== "failed" && (
        <p className="muted small">The investigation stopped early ({investigation.status === "budget" ? "AI budget reached" : "step limit"}). The decision is unchanged.</p>
      )}
    </section>
  );
}
