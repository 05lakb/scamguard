# PaySentinel AI

**Real-time fraud intelligence before money moves.** PaySentinel AI checks a payment's behaviour, the customer's own words or call transcript, and the receiving account's network, then recommends **allow**, **warn/ask** or **hold for human review** with ranked, explainable reasons.

- **Stage:** synthetic-data prototype. No real bank or payment rail is connected; no money is ever moved.
- **Pitch:** [idea](docs/PITCH_IDEA.md) · **Palette:** [colours](docs/COLOR_PALETTE.md)

## The command centre

| Page | What it does | Backend |
| --- | --- | --- |
| Landing | Product story, example decision, entry to the workspace | – |
| Dashboard | Security overview, risk distribution, actions, top signals, module suite, live API/AI status | `GET /api/health` |
| Transactions | Transaction Risk Analyzer: amount, beneficiary, device, location, time, toggles (new payee, new device, location changed, live call, remote-access app) and an optional customer note; one follow-up question round | `POST /api/assess` |
| Voice AI | Live call detection (browser speech recognition), transcript upload (.txt/.srt/.vtt) or paste; scam-risk score, tactics, suspicious phrases, recommended action | `POST /api/conversation` |
| Analytics | KPIs, risk distribution, AI decisions, top risk signals, human-review feedback, recent assessments | session cases |
| Network | Mule-network graph; click accounts to flag or unflag, search, then run the engine | `POST /api/assess` with `network` |
| Risk Profile | Overall risk, devices, beneficiaries, locations, why-this-score, filterable history, alerts | session cases |
| Geography | Locations observed, risk by place, location-change count | session cases |
| Analyst | Review queue: approve, keep on hold or escalate, with audit trail | browser state |
| Scenario Lab | Scenario library, guided demo and the live red-team arena | `POST /api/assess`, `POST /api/arena` |

Sign-in asks only for a display name (kept in this browser); there are no accounts or passwords.

## What each part does

1. **TxnGuard — transaction fraud:** Check amount, timing, device, location change, payee, payment frequency, and recent payment history.
2. **ScamStop — customer manipulation:** Read the customer's note for pressure, secrecy, or coaching; ask one follow-up round when evidence is unclear.
3. **MuleNet — receiving-account risk:** Check account links, many recent senders, and rapid onward transfers.
4. **Risk decision and explanation:** Combine the available evidence, rank the reasons, and recommend an action. A bank would make the final payment-control decision.

## Agent and decision flow

```mermaid
flowchart TB
    P["Customer starts payment"] --> F["TxnGuard: transaction checks"]
    P --> S["ScamStop: note and optional follow-up"]
    P --> M["MuleNet: account-network checks"]
    F --> D["Risk decision and explanation"]
    S --> D
    M --> D
    D --> L["Low risk: allow"]
    D --> W["Medium risk: warn or ask"]
    D --> H["High risk: recommend hold and analyst review"]
```

- **Current implementation:** One FastAPI service. TxnGuard and MuleNet use explainable rules; ScamStop uses Gemini for structured message reading and question writing. Rules choose the recommendation.
- **Target architecture:** A bank supplies trusted payment and account data, then controls warnings, holds, analyst review, and payment release. The diagram shows this intended decision flow; it does not imply a live bank integration.

## What works today

- **TxnGuard:** Rule-based transaction and request-supplied history scoring in `backend/risk/behaviour.py`.
- **ScamStop:** Gemini-assisted note reading and one follow-up round; deterministic decision rules in `backend/risk/`.
- **MuleNet:** Rule-based checks on an optional, bounded **synthetic** transfer graph in `backend/risk/network.py`.
- **Voice AI:** `backend/risk/conversation.py` scores a call transcript with Gemini when configured, or with transparent phrase rules (OTP/PIN requests, impersonation, threats, urgency, secrecy, remote-access apps, off-platform payment) when it is not. The response always says which reader ran.
- **API:** `POST /api/assess` returns a recommendation, score, ranked reasons, audit breakdown and execution provenance; `POST /api/assess/stream` streams each pipeline stage live; `POST /api/conversation` scores a transcript; `GET /api/health` reports service health and whether AI reading is configured.
- **Demo:** React command centre (dashboard, transaction analyzer, voice AI, analytics, network, risk profile, geography), analyst queue with **Run test scenario** calling the real backend, three-agent audit panels, execution trace, scenario lab with red-team arena, architecture and evidence views.
- **Evaluation:** Synthetic scenarios, Python evaluations, red-team tools, Pytest, and web unit tests.

## Google technology

- **Gemini via Vertex AI — implemented when configured:** Extract structured scam signals from notes and answers; draft up to two neutral questions. Gemini does not approve or hold payments.
- **Cloud Run — deployment included:** Serve the FastAPI API and React build in one container.
- **Cloud Build — deployment included:** Build the container during `gcloud run deploy --source`.
- **Cloud service account — deployment supported:** Give Cloud Run access to Vertex AI without a key file in the service.
- **Pub/Sub — planned:** Receive authenticated payment events from a bank workflow.
- **BigQuery — planned:** Provide governed transaction, payee, and account-link history for scoring and evaluation.

## Tech stack

- **Web:** React, TypeScript, Vite, Vitest (`web/`).
- **API:** Python, FastAPI, Pydantic, Uvicorn (`backend/`).
- **AI:** Google Gen AI Python SDK and Gemini via Vertex AI (`backend/`).
- **Risk engine:** Explainable Python behaviour, scam, network, and decision rules (`backend/risk/`).
- **Deployment:** Docker and Cloud Run source deployment (`infra/`).

## Current limits

- The demo uses made-up payments, customer stories, and account links. The MuleNet graph arrives in the demo request; a production bank must source and bind it to the authenticated destination account.
- The analyst queue exists only in browser state. No persistent case store, bank identity integration, or live payment hold/release mechanism exists.
- The API returns audit details but does not persist them.
- Gemini can be unavailable; the API then falls back to transaction and network rules. Input limits and request/model-call limits protect the demo.
- Synthetic evaluation does not establish performance on real bank data.

## Next priorities

1. Bind each payment to trusted bank transaction and account-network data; replace request-supplied evidence in the production path.
2. Validate and calibrate combined scoring on held-back fraud, scam, mule, and legitimate cases.
3. Add authenticated analyst review, durable case/audit storage, and bank-controlled hold/release.
4. Add Pub/Sub ingestion, governed BigQuery lookups, monitoring, and automated CI checks.

## Live backend-verified analyst demonstration

For an exact local test walkthrough, synthetic scenario selection, Gemini cache/fallback labels, and an independent PowerShell API test, see [Analyst backend demo](docs/ANALYST_DEMO.md). The backend returns a request ID and timing for every payment assessment, which the application displays next to the scored evidence.

## Run locally

1. Copy `.env.example` to an ignored `.env`; set `GEMINI_API_KEY` if you want Gemini message reading.
2. Start the API from the repository root:

   ```bash
   python -m pip install -r backend/requirements.txt
   python -m uvicorn backend.app:app --reload --port 8080
   ```

3. Start the web app in another terminal:

   ```bash
   cd web
   npm ci
   npm run dev
   ```

4. Run the tests: `python -m pytest backend/tests`; from `web/`, run `npm test`.

## Deploy the synthetic demo

- Configure the Google Cloud project, required APIs, and the `lmg-runtime` service account for Vertex AI.
- Run `PROJECT_ID=your-project-id bash infra/deploy.sh`.
- Review the script's public access, region, resource caps, and cost settings before deployment. This is a public synthetic-data demo, not a bank production system.
