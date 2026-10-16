# Last Mile Guard: judge walkthrough and runtime checks

Last Mile Guard is a payment-fraud prototype. FraudShield and MuleNet use explainable rules;
ScamStop uses Gemini for structured message analysis. All sample payments and account
links are synthetic. The application recommends an action; it does not move or hold real money.

## First minute

1. Open the homepage and select **Try the live demo**.
2. The app sends the repeated-payment scenario (`d6`) with its synthetic account graph
   to `POST /api/assess/stream`. It does not preselect a risk outcome.
3. Watch the three checks. Open **See live backend activity** for the detailed stage
   map and event feed. Read the recommendation and main reasons.
4. Select **Review this case** to open the matching live case in **Review cases**.
   Choose **Keep on hold** to demonstrate a simulated human review and its audit entry.
   Analyst actions and the queue are held in browser memory.

**Fresh Gemini analysis** means a model call supplied the message reading.
**Saved Gemini analysis** reuses the prior reading of the exact message and model.
That is expected when repeating a preset; it does not benchmark inference latency.
Edit the customer message in the console to exercise a fresh reading.
If analysis fails, the page names a safe failure category and shows the fallback evidence.
Risk scores and model scam likelihoods are not calibrated probabilities or production accuracy claims.

## Runtime behaviour

- Gemini requests default to a 20,000 ms transport timeout with one application attempt
  and no SDK retries. `GEMINI_TIMEOUT_MS` is configurable between 1,000 and 60,000 ms.
  An assessment that generates follow-up questions can make two sequential model calls.
  Browser assessment requests stop waiting after 50 seconds. This is not a production latency SLA.
- Backend duration includes the assessment work; it excludes page load and browser network time.
- HTML and unversioned assets use `Cache-Control: no-cache`; successful hashed Vite
  assets use `public, max-age=31536000, immutable`. API responses use `no-store`.
- Initial HTML contains a readable product summary, loading guidance, a no-JavaScript
  message and OpenGraph/Twitter text metadata. It is not full SSR. A canonical public
  URL and share image should be added when the final submission URL is selected.
- The hourly model guard is a per-assessment limit, not token or dollar accounting.
  Token cost, throughput and uptime are not fabricated; aggregated telemetry remains future work.

## Optional Cloud Run judging window

The deployment script accepts `MIN_INSTANCES=0`, `1` or `2`; it defaults to zero.
One warm instance reduces cold-start exposure and incurs idle charges. It does not
remove model inference time or guarantee a particular response time.

For an authorized deployment from Cloud Shell:

```bash
PROJECT_ID=your-project-id MIN_INSTANCES=1 bash infra/deploy.sh
```

To change only the existing service's revision minimum during judging, use the
actual project, region and service:

```bash
gcloud run services update last-mile-guard --project your-project-id --region us-central1 --min-instances 1
# After judging:
gcloud run services update last-mile-guard --project your-project-id --region us-central1 --min-instances 0
```

See [Google Cloud minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances).
The local improvements do not deploy or change cloud capacity.


## Short judge narrative

- **Problem:** A customer can authorize a payment while being manipulated. A payment
  pattern alone may not explain the scam. Last Mile Guard combines the customer's story
  with payment and optional account-link evidence for an analyst to inspect.
- **Live example:** Start the homepage demo, show the payment and customer note, then
  watch the backend checks. Point out which checks use rules and which use Gemini.
  Read the actual live/cached/fallback badge; never call a cached reading fresh.
- **Human review:** Open the resulting case, inspect its strongest reasons and record
  a simulated analyst action. The audit trail updates; no real funds move.
- **Proof and limits:** Open Explore → Evidence & test results. Explain the paired
  50-case first-round comparison, genuine-payment friction, pending conversations
  and measured latency. The full run and the earlier quota-limited run are downloadable.
- **Next validation:** Independently authored cases, complete follow-up conversations,
  and a verified deployment of the latest build. Do not imply the current numbers
  are bank-production accuracy or that all suggested Google Cloud services are used.

If time permits, try **New supplier, details confirmed by phone** to demonstrate how
reassuring context is handled. Describe the returned result, even if it is a question
or fallback; do not promise a fixed outcome before the request completes.

The public URL was serving an older build when checked on 15 October 2026. See
[deployment review](DEPLOYMENT_REVIEW.md) before using it for the live stream demo.
See [paired evaluation method](PAIRED_EVALUATION.md) for exact reproduction and scope.
