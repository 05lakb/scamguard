# What the paired evaluation establishes

## Run and inspect

From the project root in PowerShell:

```powershell
.\.venv\Scripts\python.exe eval/run_paired_eval.py --live --interval-seconds 15
.\.venv\Scripts\python.exe eval/export_paired_summary.py
Set-Location web
npm.cmd run build
```

The first command makes paid Gemini calls on synthetic cases. Keep credentials in
the local `.env`; no credentials enter a report. The other commands make no model
calls. Do not run other model-heavy demos at the same time when quota is limited.

Each run has a timestamped directory under `eval/output/paired-*`, containing
append-only case records and a final report. The latest complete report is copied
to `web/src/data/pairedEvidence.json`. The UI imports only a small summary and offers
the full JSON as a separate download. Interrupted runs retain their partial records
and do not replace the latest complete report.

## Fair comparison and its limits

- Both arms receive the same payment and customer profile. The combined arm also
  receives the original customer message and any supplied network graph.
- The baseline is `check_behaviour`; the combined arm is the actual first-round
  `POST /api/assess/stream` handler through FastAPI TestClient, with real Gemini calls.
- The default 50-case dataset has 25 scam and 25 genuine labels and no account graphs.
  It is existing development data. Its name `blind_test_v1.json` does not establish
  independent authorship, lack of prior exposure, or label quality.
- Labels, typology labels, rationales and expected actions stay in the evaluator.
  An explicit input allowlist prevents them being sent to the assessment endpoint.
- Disk caches are disabled and process-local caches cleared before each case. The
  running demo and its cached answers are unaffected.
- The evaluator preserves failures and does not retry individual cases until they
  pass. The initial quota-limited run is also downloadable from Evidence.
- `ask` means a pending conversation. It counts as genuine-payment friction, but
  does not count as a scam warned or held. An API error is a nonmatch and is counted
  separately from friction. Low-confidence labels, if present, are excluded equally.
- This comparison adds Gemini, message safeguards and decision rules together.
  It does not isolate the causal contribution of the language model alone.
- Backend latency includes model calls and question generation; excludes case
  pacing, page rendering, browser-to-server delivery and Cloud Run cold starts.
  This serial run is not a load test, SLA, throughput or token-cost measurement.
- All source fingerprints are checked again after the run. No scoring or prompt
  tuning is performed during measurement. Code/model changes require a new run.

## Independent test still required

Ask a reviewer who has not tuned these prompts/rules to write a new, synthetic set.
Do not show its labels or expected outcomes to the implementation team until the
rules, prompts, model configuration and metric definitions are frozen.

The reviewer should include genuine payments that resemble scams, subtle scams,
obvious scams, absent evidence, contradictory replies and instruction attacks.
Define acceptable actions and ambiguous labels before testing. Include the facts
needed to answer follow-up questions; do not fabricate convenient answers after
seeing the model's question or decision.

Use the same input schema as `data/blind_test_v1.json`, with unique IDs and optional
`acceptable_actions` and `ground_truth_confidence`. The first-round runner accepts
`--data path/to/new-synthetic-cases.json`. It deliberately does not invent round-two
answers. Complete-conversation evaluation needs a separate, reviewer-owned answer
protocol and must report both first-round and final outcomes.

Do not tune against the independent set and continue calling it held out. After
using its errors for development, reserve another new set for the next evaluation.

## Submission language

Use: "We compared payment rules and the combined first-round assessment on the
same 50 synthetic development cases, publishing every outcome, question, failure
and measured backend duration. Independent and complete-conversation validation
remain open."

Do not claim production accuracy, calibrated confidence, loss prevention, three
autonomous LLM agents, or independently validated improvement from this run.
