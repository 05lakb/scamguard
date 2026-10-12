import { useEffect, useRef, useState } from "react";
import { streamCustom, type ArenaRecord } from "../api";
import { Icon } from "../components/Icon";
import { Stage } from "../components/Stage";
import { EXAMPLES, SEGMENTS, STORY_MAX, STORY_MIN, emptyForm, problemWith, toRequest, type CustomForm } from "../lib/custom";
import { viewAt } from "../lib/stage";
import { usePlayback } from "../lib/usePlayback";

// A visitor describes their own made-up scenario. The red agent plays that customer and the guard decides, live.
export function Custom() {
  const [form, setForm] = useState<CustomForm>(emptyForm);
  const [running, setRunning] = useState(false);
  const [records, setRecords] = useState<ArenaRecord[]>([]);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const set = <K extends keyof CustomForm>(key: K, value: CustomForm[K]) => setForm((old) => ({ ...old, [key]: value }));
  const number = (key: keyof CustomForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
    set(key, (event.target.value === "" ? 0 : Number(event.target.value)) as never);

  async function play() {
    const problem = problemWith(form);
    if (problem) {
      setError(problem);
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setRecords([]);
    setRunning(true);
    try {
      await streamCustom(
        toRequest(form),
        (event) => {
          if (event.type === "scenario") setRecords([event.record]);
        },
        abort.signal,
      );
    } catch (problemFound) {
      if ((problemFound as Error).name !== "AbortError") {
        setError(problemFound instanceof Error ? problemFound.message : "Your scenario stopped unexpectedly.");
      }
    } finally {
      setRunning(false);
    }
  }

  const { cursor, elapsed, record: playing } = usePlayback(records, false);
  const verdictLanded = playing ? viewAt(playing, elapsed).verdictShown : false;
  const finished = records.length > 0 && (cursor >= records.length || verdictLanded) ? records[0] : null;
  const allPlayed = !running && records.length > 0 && cursor >= records.length;

  return (
    <div className="custom">
      <section className="card">
        <div className="card-head">
          <h2 className="eyebrow">Your own scenario</h2>
          <span className="muted small">Everything here should be made up</span>
        </div>
        <p>
          Describe a situation in your own words and set the payment details. The red agent plays that customer, writes the
          note and any answer, and the bank guard decides. <strong>The guard never sees your description.</strong> Please
          don't enter real names, numbers or addresses.
        </p>

        <div className="row examples">
          <span className="muted small">Start from an example:</span>
          {EXAMPLES.map((example) => (
            <button key={example.label} className="ghost" onClick={() => { setForm(example.form); setError(""); }} disabled={running}>
              {example.label}
            </button>
          ))}
        </div>

        <label className="field" htmlFor="story">What is happening to the customer?</label>
        <textarea
          id="story"
          rows={4}
          maxLength={STORY_MAX}
          value={form.story}
          disabled={running}
          placeholder="For example: someone I met online asked me to send money for an urgent hospital bill, and asked me to keep it private."
          onChange={(event) => set("story", event.target.value)}
        />
        <p className="muted small">{form.story.trim().length} / {STORY_MAX} characters (at least {STORY_MIN})</p>

        <fieldset className="who" disabled={running}>
          <legend className="field">Is the customer being tricked, or genuine?</legend>
          <label className="check"><input type="radio" name="role" checked={form.role === "victim"} onChange={() => set("role", "victim")} /> Being tricked</label>
          <label className="check"><input type="radio" name="role" checked={form.role === "genuine"} onChange={() => set("role", "genuine")} /> Genuine</label>
          {form.role === "victim" && (
            <label className="check"><input type="checkbox" checked={form.coached} onChange={(event) => set("coached", event.target.checked)} /> Coached to stay calm and give nothing away</label>
          )}
        </fieldset>

        <h3 className="mini">The payment</h3>
        <div className="form-grid">
          <div>
            <label className="field" htmlFor="segment">Customer type</label>
            <select id="segment" value={form.segment} disabled={running} onChange={(event) => set("segment", event.target.value)}>
              {SEGMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field" htmlFor="typical">Usual payment size (USD)</label>
            <input id="typical" type="number" min={1} max={1000000} value={form.typicalAmount} disabled={running} onChange={number("typicalAmount")} />
          </div>
          <div>
            <label className="field" htmlFor="amount">This payment (USD)</label>
            <input id="amount" type="number" min={1} max={1000000} value={form.amount} disabled={running} onChange={number("amount")} />
          </div>
          <div>
            <label className="field" htmlFor="payee">Payee name (made up)</label>
            <input id="payee" type="text" maxLength={60} value={form.payeeName} disabled={running} onChange={(event) => set("payeeName", event.target.value)} />
          </div>
          <div>
            <label className="field" htmlFor="ptype">Who is being paid?</label>
            <select id="ptype" value={form.payeeType} disabled={running} onChange={(event) => set("payeeType", event.target.value as CustomForm["payeeType"])}>
              <option value="individual">A person</option>
              <option value="business">A business</option>
              <option value="crypto_exchange">A crypto exchange</option>
            </select>
          </div>
          <div>
            <label className="field" htmlFor="age">Payee account age (days)</label>
            <input id="age" type="number" min={0} max={20000} value={form.payeeAgeDays} disabled={running} onChange={number("payeeAgeDays")} />
          </div>
          <div>
            <label className="field" htmlFor="recent">Payments in the last 24 hours</label>
            <input id="recent" type="number" min={0} max={50} value={form.paymentsLast24h} disabled={running} onChange={number("paymentsLast24h")} />
          </div>
        </div>
        <div className="checks">
          <label className="check"><input type="checkbox" checked={form.isNewPayee} disabled={running} onChange={(event) => set("isNewPayee", event.target.checked)} /> New payee (never paid before)</label>
          <label className="check"><input type="checkbox" checked={form.deviceKnown} disabled={running} onChange={(event) => set("deviceKnown", event.target.checked)} /> Usual device</label>
          <label className="check"><input type="checkbox" checked={form.onLiveCall} disabled={running} onChange={(event) => set("onLiveCall", event.target.checked)} /> On a phone call while paying</label>
          <label className="check"><input type="checkbox" checked={form.remoteTool} disabled={running} onChange={(event) => set("remoteTool", event.target.checked)} /> Remote-control tool running</label>
        </div>

        <div className="row">
          <button className="primary" onClick={play} disabled={running}>
            <Icon name="play" size={14} /> {running ? "Playing..." : records.length ? "Play again" : "Play this scenario"}
          </button>
          <span className="muted small">One a minute for each visitor. It takes under a minute.</span>
        </div>
        {error && <p className="problem" role="alert">{error}</p>}
      </section>

      {(running || records.length > 0) && (
        <>
          <Stage
            record={playing ?? records[0] ?? null}
            elapsed={playing ? elapsed : 1e9}
            number={1}
            total={1}
            running={running}
            allPlayed={allPlayed}
          />
          {finished && !finished.error && (
            <section className="card" aria-live="polite">
              <h2 className="eyebrow">Why the guard decided this</h2>
              <ul className="reasons">
                {finished.reasons?.length ? finished.reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>Nothing unusual was found.</li>}
              </ul>
              <p className="honest">
                One case is a demonstration, not a measurement. The guard may handle your scenario differently from the
                ones we tested. The Evidence page shows the tested results, including the misses.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
