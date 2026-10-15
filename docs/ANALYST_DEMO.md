# Analyst Queue — backend-verified demo

The demo uses **synthetic** customer and payment inputs, but the **actual** FastAPI `POST /api/assess` endpoint calculates the recommendation. Nothing connects to a bank or moves money.

## Launch locally

From the repository root, open two terminals:

```powershell
# Backend terminal (install requirements once, in a Python environment with google-genai)
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app:app --reload --port 8080
```

```powershell
# Frontend terminal
cd web
npm.cmd ci
npm.cmd run build
npm.cmd run dev
```

Open the Vite URL (normally http://localhost:5173), go to **Analyst queue → Run a single backend scenario**. Pick **Fake bank security call**, click **Run test scenario**, and review the new `TEST-*` case. For an explicit network check select **Same payee, paid again and again · MuleNet graph**. The backend may ask a question; the tool automatically uses that synthetic scenario's sample reply for the second request. To enter your own replies, use **Live console → Try one case**.

**Execution evidence**: Each backend response carries a request ID, duration, message execution mode, and whether a network input was supplied. The server terminal prints the same request ID. Check the browser Network panel for `POST /api/assess` (status 200); a 200 response is evidence the backend answered. A result marked `gemini_live` means the message reader invoked the Gemini model. `gemini_cached` means a previous Gemini output was reused. `fallback_payment_only` means Gemini failed or was cost-limited and the backend evaluated payment signals only. A `not_requested` response is normal when there was no customer message. `injected_reader` is for automated backend tests.

## Independent backend verification in PowerShell

From the repository root, in another terminal:

```powershell
$scenario = (Get-Content .\web\src\data\demo.json -Raw | ConvertFrom-Json) | Where-Object id -eq 'd2'
$body = @{ payment=$scenario.payment; customer=$scenario.customer; message=$scenario.message } | ConvertTo-Json -Depth 15
$result = Invoke-RestMethod -Uri 'http://localhost:8080/api/assess' -Method Post -ContentType 'application/json' -Body $body
$result | Select-Object action, score, round, degraded, execution
$result.audit | ConvertTo-Json -Depth 10
```

A result may be `ask`; the real UI handles round 2. Verify that `execution.request_id` matches the backend log line.

## Limits and safeguards

- Preloaded `S*` cases are **recorded samples**, not freshly assessed responses.
- The case queue and analyst approval/hold/escalation history are currently **in browser memory only**. A new tab or refresh resets them. This is not persistent case management or a real bank payment decision.
- MuleNet operates on the **synthetic account graph included in the selected scenario**, not connected bank-account data.
- Risk points can exceed 100 before the total is capped. Individual contributions are not percentages.
- Never put real customer/account data, card details, or a Gemini API key in a screenshot or a commit.
- If model credentials are missing or the cost guard activates, say “payment-only fallback”; do not claim Gemini ran.
