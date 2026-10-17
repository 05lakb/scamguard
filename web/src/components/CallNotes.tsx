import { useState } from "react";
import { analyseConversation, type ConversationResult, type NoteKind } from "../api";
import type { CaseItem } from "../lib/cases";
import { Icon } from "./Icon";

const KIND_LABEL: Record<NoteKind, string> = { call: "Call", note: "Analyst notes", check: "Voice AI check" };

// The call log on a warned or held case: the customer's call, what was said, and a Voice AI check of it.
export function CallNotes({ item, onAdd }: { item: CaseItem; onAdd: (kind: NoteKind, text: string) => void }) {
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<ConversationResult | null>(null);
  const [error, setError] = useState("");
  const notes = item.notes ?? [];
  const called = notes.some((note) => note.kind === "call");
  const hasNotes = notes.some((note) => note.kind === "note");

  function save() {
    const text = draft.trim();
    if (!text) return;
    onAdd("note", text);
    setDraft("");
  }

  async function runCheck() {
    const text = [...notes.filter((note) => note.kind === "note").map((note) => note.text), draft.trim()].filter(Boolean).join("\n");
    if (!text) return;
    setChecking(true);
    setError("");
    try {
      const result = await analyseConversation(text.slice(0, 4000));
      setCheck(result);
      onAdd("check", `${result.risk_level} risk (${result.scam_likelihood}/100). ${result.explanation}`.slice(0, 2000));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The notes could not be checked.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="call-notes">
      <h3 className="mini"><Icon name="mic" size={15} /> Analyst's call with the customer</h3>
      <p className="muted small">
        {called
          ? "The customer called the fraud team about this payment."
          : "When the customer calls and quotes the reference, record what they say here."}
      </p>
      {notes.length > 0 && (
        <ul className="call-log">
          {notes.map((note, index) => (
            <li key={`${note.at}-${index}`} className={`call-log-${note.kind}`}>
              <span className="muted small">
                {KIND_LABEL[note.kind]} · {new Date(note.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {note.author}
              </span>
              <span>{note.text}</span>
            </li>
          ))}
        </ul>
      )}
      <label className="f-label" htmlFor={`notes-${item.id}`}>What the customer said on the call</label>
      <textarea
        id={`notes-${item.id}`}
        className="f-area"
        maxLength={2000}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="For example: says the bank's fraud team told them to move the money and to stay on the line."
      />
      <div className="form-actions" style={{ marginTop: 8 }}>
        <button className="btn small primary" onClick={save} disabled={!draft.trim()}>Save call notes</button>
        <button className="btn small" onClick={runCheck} disabled={checking || (!draft.trim() && !hasNotes)}>
          {checking ? "Checking…" : "Check the notes with Voice AI"}
        </button>
      </div>
      {error && <p className="problem" role="alert">{error}</p>}
      {check && (
        <p className={`ai-note ${check.risk_level === "high" ? "warn" : ""}`} role="status">
          <Icon name="shield" size={16} />{" "}
          <span>
            <strong>Voice AI: {check.risk_level} risk ({check.scam_likelihood}/100).</strong> {check.explanation}
            {check.tactics.length > 0 && <> Signs: {check.tactics.join(", ")}.</>}
          </span>
        </p>
      )}
      <p className="muted small">Notes are saved with this case in this browser only and deleted after 24 hours. The decision stays with the analyst.</p>
    </div>
  );
}
