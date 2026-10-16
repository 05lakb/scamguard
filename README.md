# Last Mile Guard

**Real-time fraud intelligence before money moves.** Last Mile Guard checks a payment's behaviour, the customer's own words or call transcript, and the receiving account's network, then recommends **allow**, **warn/ask** or **hold for human review** with ranked, explainable reasons.

- **Stage:** synthetic-data prototype. No real bank or payment rail is connected; no money is ever moved.
- **Pitch:** [idea](docs/PITCH_IDEA.md) · **Palette:** [colours](docs/COLOR_PALETTE.md)

## The command centre

| Page | What it does | Backend |
| --- | --- | --- |
| Landing | Problem statement, product story, example decision, sign-in | – |
| Dashboard | Security overview, risk distribution, actions, top signals, module cards, live API/AI status | `GET /api/health` |
| Transactions | Analyse one account-to-account transfer and see the whole investigation on one page: score and ranked reasons, the analyst decision (approve / hold / escalate) with audit trail, customer, device and location context, and the receiving-account network scored by MuleNet | `POST /api/assess` |
| Voice AI | Live call detection (browser speech recognition), transcript upload (.txt/.srt/.vtt) or paste; scam-risk score, tactics, suspicious phrases, recommended action | `POST /api/conversation` |
| Cases | Review queue for every warning and hold, with **Run test scenario** against the real backend | `POST /api/assess` |
| Risk Profile | One customer's overall risk score with reasons, devices, beneficiaries, locations, transaction history (filter by decision) and fraud alerts | session cases |
| Analytics | KPIs, risk distribution, decisions, top signals, analyst feedback, risk by location, recent assessments across all transactions | session cases |
| Scenario Lab | Scenario library with live streamed checks, guided demo and the red-team arena | `POST /api/assess/stream`, `POST /api/arena` |
| Evidence, Architecture | Evaluation results and how the system fits together (footer links) | – |

Sign-in asks only for a display name (kept in this browser); there are no accounts or passwords.

## What each part does

1. **FraudShield — transaction fraud:** Check amount, timing, device, location change, payee, payment frequency, and recent payment history.
2. **ScamStop — customer manipulation:** Read the customer's note for pressure, secrecy, or coaching; ask one follow-up round when evidence is unclear.
3. **MuleNet — receiving-account risk:** Check account links, many recent senders, and rapid onward transfers.
4. **Risk decision and explanation:** Combine the available evidence, rank the reasons, and recommend an action. A bank would make the final payment-control decision.

## Agent and decision flow

```mermaid
flowchart TB
    P["Customer starts payment"] --> F["FraudShield: transaction checks"]
    P --> S["ScamStop: note, links and optional follow-up"]
    P --> M["MuleNet: account-network checks"]
    F --> D["Risk decision and explanation"]
    S --> D
    M --> D
    D --> L["Low risk: allow"]
    D --> W["Medium risk: warn or ask"]
    D --> H["High risk: recommend hold and analyst review"]
```

- **Current implementation:** One FastAPI service. FraudShield and MuleNet use explainable rules; ScamStop uses Gemini for structured message reading and question writing. Plain, testable rules choose the recommendation. Gemini never approves or holds a payment.
- **Target architecture:** A bank supplies trusted payment and account data, then controls warnings, holds, analyst review, and payment release. The diagram shows the intended flow; it does not imply a live bank integration.

## What works today

- **FraudShield:** Rule-based transaction and request-supplied history scoring in `backend/risk/behaviour.py`.
- **ScamStop:** Gemini-assisted note reading and one follow-up round; deterministic decision rules in `backend/risk/`.
- **MuleNet:** Rule-based checks on an optional, bounded **synthetic** transfer graph in `backend/risk/network.py`.
- **Voice AI:** `backend/risk/conversation.py` scores a call transcript with Gemini when configured, or with transparent phrase rules (OTP/PIN requests, impersonation, threats, urgency, secrecy, remote-access apps, off-platform payment) when it is not. The response always says which reader ran.
- **API:** `POST /api/assess` returns a recommendation, score, ranked reasons, audit breakdown and execution provenance; `POST /api/assess/stream` streams each pipeline stage live; `POST /api/conversation` scores a transcript; `GET /api/health` reports service health and whether AI reading is configured.
- **Demo:** React command centre (dashboard, transaction analyzer, voice AI, analytics, network, risk profile, geography), analyst queue with **Run test scenario** calling the real backend, three-agent audit panels, execution trace, scenario lab with red-team arena, architecture and evidence views.
- **Evaluation:** Synthetic scenarios, Python evaluations, red-team tools, Pytest, and web unit tests.
- **Live console extras:** a link check that reads risky-looking links as text and never opens them (`backend/risk/links.py`), the customer's warning shown in Hindi, Spanish, French, Portuguese or Arabic with the English kept as the record, and a form to describe your own scenario and watch the red agent play it.

## Testing against public fraud patterns

The scam cases in the live arena and the evaluation are modelled on fraud patterns described on public advice pages: the US Federal Trade Commission's consumer alerts and Australia's Scamwatch (ACCC). A careful reader (`redteam/intel/reports.py`) contacts only those named sites over https, follows each site's `robots.txt`, refuses redirects off the list, paces itself, and stops at a hard limit. It runs in Cloud Shell only and never saves page text. Gemini then writes an invented customer for each pattern, with made-up names and amounts, and each case records the page it was modelled on. The site shows that source and a link. UK Action Fraud is not used because its `robots.txt` asks automated readers to stay away. Scamwatch content is used under its Creative Commons Attribution licence.

Half of those cases are held back in a locked test set and run once. The results, including the weak ones and the faults we found and fixed in our own test data and in the message reader, are on the Evidence page. They are small samples and do not establish performance on bank data. MuleNet has unit tests and one demo scenario, but no measured evaluation yet.

## Google technology

- **Gemini via Vertex AI (implemented when configured):** Extract structured scam signals from notes and answers, draft up to two neutral questions, and translate the customer's warning. Gemini does not approve or hold payments.
- **Cloud Run (deployment included):** Serve the FastAPI API and React build in one container.
- **Cloud Build (deployment included):** Build the container during `gcloud run deploy --source`.
- **Cloud service account (deployment supported):** Give Cloud Run access to Vertex AI without a key file in the service.
- **Cloud Text-to-Speech (video only):** Narrate the explainer video in `video/`. Not in the payment path.
- **Pub/Sub (planned):** Receive authenticated payment events from a bank workflow.
- **BigQuery (planned):** Provide governed transaction, payee, and account-link history for scoring and evaluation.

## Tech stack

- **Web:** React, TypeScript, Vite, Vitest (`web/`).
- **API:** Python, FastAPI, Pydantic, Uvicorn (`backend/`).
- **AI:** Google Gen AI Python SDK and Gemini via Vertex AI (`backend/`).
- **Risk engine:** Explainable Python behaviour, scam, link, network, and decision rules (`backend/risk/`).
- **Deployment:** Docker and Cloud Run source deployment (`infra/`).
- **Video:** Remotion scenes and a Text-to-Speech script, built in Cloud Shell (`video/`).

## Safety and current limits

- The demo uses made-up payments, customer stories, and account links. The MuleNet graph arrives in the demo request; a production bank must source it from trusted records and bind it to the authenticated destination account. MuleNet only adds risk, so a supplied graph can never clear a payment.
- Customer text is untrusted. Model output is constrained to a schema, and scoring and action thresholds stay in testable code. Emails and card numbers are blocked before anything is sent to the model.
- The link check reads link text only and never opens or fetches a link. Translation applies only to the warning our rules wrote, never to the customer's words, and never changes the decision.
- A visitor's own scenario has its own limits (one a minute and a few an hour for each visitor), checks input in the browser and on the server, and never logs or returns the story text.
- The analyst queue exists only in browser state. No persistent case store, bank identity integration, or live payment hold or release mechanism exists. The API returns audit details but does not persist them.
- Gemini can be unavailable; the API then falls back to payment and network rules. Input limits, request limits and a Gemini call budget protect the demo.
- A calm, coached victim paying something ordinary can still get through. Synthetic and red-team results do not establish performance on real bank data.

## Next priorities

1. Bind each payment to trusted bank transaction and account-network data; replace request-supplied evidence in the production path.
2. Validate and calibrate combined scoring on held-back fraud, scam, mule, and legitimate cases.
3. Add authenticated analyst review, durable case and audit storage, and bank-controlled hold and release.
4. Add Pub/Sub ingestion, governed BigQuery lookups, monitoring, and automated CI checks.

## Live backend-verified analyst demonstration

For an exact local test walkthrough, synthetic scenario selection, Gemini cache/fallback labels, and an independent PowerShell API test, see [Analyst backend demo](docs/ANALYST_DEMO.md). The backend returns a request ID and timing for every payment assessment, which the application displays next to the scored evidence.

## Run and test locally

You need **Python 3.12+** and **Node.js 20+ (LTS)**. A Gemini key is optional: without one, message reading and Voice AI fall back to transparent rules and the screen says so.

Run every command from the repository root (the folder that contains `backend/` and `web/`), unless a step says `cd web`.

### 1. Install

**Windows (PowerShell)**

```powershell
python -m pip install -r backend\requirements.txt
cd web
npm.cmd ci
cd ..
```

PowerShell blocks `npm` by default; `npm.cmd` runs the same tool without changing security settings.

**macOS / Linux**

```bash
python3 -m pip install -r backend/requirements.txt
cd web && npm ci && cd ..
```

Optional: copy `.env.example` to `.env` and set `GEMINI_API_KEY` to enable Gemini reading. Never commit `.env`.

### 2. Run the automated tests

| Check | Windows | macOS / Linux | Expected |
| --- | --- | --- | --- |
| Backend | `python -m pytest backend\tests` | `python3 -m pytest backend/tests` | all tests pass (211 at the time of writing) |
| Web build (type check + bundle) | `cd web; npm.cmd run build` | `cd web && npm run build` | build completes with no errors |
| Web unit tests | `cd web; npm.cmd test` | `cd web && npm test` | all Vitest suites pass |

No test calls the internet or Gemini; the backend tests use fake readers.

### 3. Start the app

Use two terminals, both starting at the repository root.

```bash
# Terminal 1 - API on http://localhost:8080
python -m uvicorn backend.app:app --reload --port 8080
```

```bash
# Terminal 2 - website on http://localhost:5173
cd web
npm run dev        # Windows PowerShell: npm.cmd run dev
```

Open http://localhost:5173. The website forwards `/api` calls to the API automatically.

### 4. Try it in five minutes

1. Press **Get started** and enter any name (there are no accounts; the name only personalises the workspace).
2. **Transactions:** choose *Bank-impersonation call* and press **Analyse transaction**. Expect a hold, a high risk score and ranked reasons. Scroll down to see the whole investigation for that payment on the same page: the analyst decision (approve, hold or escalate), customer, device and location context, and the receiving-account network scored by MuleNet.
3. Choose *Everyday payment* and analyse again. Expect *allow* with no risk signals.
4. **Voice AI:** choose *Bank OTP call* and press **Analyse for phishing**. Expect high risk, the tactics found and the suspicious sentences. Live microphone detection works in Chrome and Edge.
5. **Cases:** every warning and hold from step 2 is waiting here. Open one and record a decision, or use **Run test scenario** to send a library scenario to the backend.
6. **Risk Profile:** the overall risk score, why it is that high, and every device, beneficiary and location the customer used.
7. **Analytics:** totals, top signals, analyst feedback and risk by location update from the transactions you analysed.
8. **Scenario Lab:** pick a sample case and press **Check**, or press **Guided demo** for the full five-step story. The step card sits above the panels and stays under the top bar as you scroll.
9. Use the palette button in the top bar to switch between the four colour themes.

All data is synthetic. No money moves, and a person confirms every hold.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm ... cannot be loaded because running scripts is disabled` | Use `npm.cmd` instead of `npm` in PowerShell. |
| `npm ci` fails with `EPERM ... unlink` | Stop `npm run dev` (Ctrl+C) and close editors that have `web/` open, then run `npm ci` again. |
| `'tsc' / 'vitest' is not recognized` | `npm ci` did not finish. Run it again from `web/`. |
| `npm run build` builds a different project | You ran it from the wrong folder. Run it from `web/`. |
| `No module named pytest` or `httpx` | Re-run `python -m pip install -r backend/requirements.txt`. |
| `pytest` finds no tests | Run it from the repository root, not from a parent folder. |
| Website shows "API offline" | Start the API (terminal 1) on port 8080. |
| Voice AI says "phrase rules only" | Expected without a Gemini key. Add `GEMINI_API_KEY` to `.env` and restart the API. |

Our own team runs installs, cloud commands and server tests in Cloud Shell, not on laptops.

## Deploy the synthetic demo

- Configure the Google Cloud project, required APIs, and the `lmg-runtime` service account for Vertex AI.
- Run `PROJECT_ID=your-project-id bash infra/deploy.sh`.
- Review the script's public access, region, resource caps, and cost settings before deployment. This is a public synthetic-data demo, not a bank production system.

## Repository layout

| Path | Contents |
| --- | --- |
| `backend/` | API, Gemini client, risk engine, and backend tests |
| `web/` | The React demo and web tests |
| `data/` | Synthetic scenarios, the scam-pattern guide, and the dev half of the public-pattern cases |
| `eval/` | Behaviour, message, flow, blind, and parity evaluations |
| `redteam/` | Synthetic attacker, customer, reader of public pages, and reporting tools |
| `infra/` | Cloud Run deployment and result-export scripts (`save_results.sh` checks files for secrets before saving) |
| `docs/` | Pitch, colour palette, and design assets |
| `video/` | The explainer video: narration, a Text-to-Speech script and animated scenes, built in Cloud Shell |

`frontend/` is a placeholder directory; the active interface is in `web/`.
