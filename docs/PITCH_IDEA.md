# Last Mile Guard: a second look before the money moves

**Product:** Last Mile Guard, a pre-payment check for scams and financial crime
**Three engines:** FraudShield + ScamStop + MuleNet, combined by an explainable decision layer
**Track:** Banking, financial services and insurance
**Stage:** Synthetic-data prototype. No real bank, payment rail or money is involved.

## The problem

In authorised account-to-account scams, the victim logs in on their own phone, passes every security check and sends a UPI, IMPS or NEFT transfer themselves, because a fake bank officer, "police" caller, investment adviser or online partner told them to. Password, OTP and device checks all pass, so traditional fraud systems see a normal payment. Within minutes the money moves on through mule accounts.

**Problem statement:** detect social-engineering scams in account-to-account transfers in real time, before the money leaves the account, explain the decision clearly, and avoid blocking genuine customers.

The warning signs live in three different places. Looking at only one either misses the scam or stops genuine customers:

| Where the sign shows | What it looks like | Engine |
| --- | --- | --- |
| In the payment | Amount far above usual, new payee, new device or location, night-time, live call, remote-access app | **FraudShield** |
| In the customer's words | Urgency, secrecy, OTP requests, threats, a rehearsed reason | **ScamStop** and **Voice AI** |
| In the receiving account | Many unrelated senders, money moved straight on, links to flagged mule accounts | **MuleNet** |

## The idea

Last Mile Guard checks every transfer with all three engines before it settles:

1. **FraudShield** scores payment behaviour against the customer's normal pattern: amount, timing, device, location, payee, payment frequency and recent history.
2. **ScamStop** reads the customer's note (Gemini on Vertex AI when configured, phrase rules otherwise) and, when the evidence is thin, asks one short question before deciding. Links in the note are checked as text only, never opened. **Voice AI** applies the same reading to call transcripts.
3. **MuleNet** looks at the receiving account's transfer graph for mule-ring patterns.

The **decision layer** combines the scores (warn from 40, hold from 70), ranks the reasons and recommends **allow**, **warn or ask**, or **hold for human review**. The customer's warning can be shown in their own language. Gemini extracts facts; rules make the recommendation; a person confirms every hold.

## What the prototype shows today

- **Transactions:** analyse one transfer and see everything on one page: the overall score, a score bar per engine, ranked reasons, a case file with Approve / Keep on hold / Escalate and an audit trail, the customer conversation, context (amount vs usual, device, location, beneficiary seen before) and the MuleNet graph showing where the money would go.
- **Voice AI:** paste, upload or speak a call transcript to spot OTP requests, impersonation, threats and pressure.
- **Cases and Risk Profile:** an analyst queue for every warning and hold, and a customer view with an overall risk score, reasons, devices, beneficiaries, locations and alerts.
- **Dashboard and Analytics:** live totals, risk distribution, top signals, analyst feedback, risk by location, and the status of each detection engine.
- **Scenario Lab:** replay realistic scam and genuine payments, a five-step guided demo, a red-team arena that attacks the engine, and a form to describe your own made-up scenario and watch a red agent play it against the guard.
- **Live console extras:** a link check that never opens links, and the customer's warning translated into their own language (the English stays the record; translation never changes the decision).
- **Proof:** red-team and evaluation cases modelled on public advice pages (FTC consumer alerts, Scamwatch), each credited to its source, with half held back for one final score; plus backend tests and web unit tests, with results on the Evidence page.

No bank-owned account graph, real payment rail, persistent case store or final human-hold workflow is connected.

## Demo story (two minutes)

1. **Landing:** state the problem: the customer approves the payment, the scammer wrote the script.
2. **Transactions:** run *Bank-impersonation call*. The payment is held at a high score. Show the three engine bars, the ranked reasons, then scroll to the case file and the MuleNet graph (four victims pay one account, which forwards to a flagged collector).
3. Run *Everyday payment*: allowed, no friction for a genuine customer.
4. **Voice AI:** analyse the *Bank OTP call* transcript.
5. **Cases** and **Risk Profile:** record a human decision and show the customer's overall risk.
6. **Scenario Lab:** start the guided demo, or describe your own scenario and let the red agent attack.

## What must follow

Source payment and account-network data from trusted bank systems instead of the request; validate and calibrate the three engines on representative held-back cases; add authenticated analyst review, durable case and audit storage, and bank-controlled hold and release; and integrate with a payment workflow (Pub/Sub ingestion, governed BigQuery history) only after security, privacy and operational review.
