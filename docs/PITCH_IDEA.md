# Last Mile Guard: a second look before the money moves

**Product:** Last Mile Guard, a pre-payment check for scams and financial crime

**Three parts:** FraudShield + ScamStop + MuleNet
**Track:** Banking, financial services and insurance
**Stage:** Synthetic-data prototype

## The problem

A payment can be authorised by its customer and still be part of a scam. Transaction anomalies, a coached customer, and a suspicious receiving-account network may each be visible in different places. Looking at only one of them can miss the risk or create unnecessary friction.

## The combined idea

Last Mile Guard investigates a payment before it settles through three complementary checks:

1. **FraudShield** scores transaction anomalies: amount, timing, device, payee, payment frequency, and recent behaviour.
2. **ScamStop** looks for social-engineering signs in the customer's note and, when useful, asks one round of short follow-up questions. Gemini extracts structured facts; rules retain control of the recommendation. Links in the note are checked as text only, never opened.
3. **MuleNet** investigates the destination account's connections and movement of money to identify possible mule-network evidence.

A risk decision and explanation layer combines the available evidence, shows what raised or lowered risk, and recommends **proceed**, **warn or ask**, or **hold for human review**. The customer's warning can be shown in their own language. The bank remains responsible for any real payment action.

## Target demo story

A customer starts a payment through a simulated banking screen. FraudShield checks the transaction, ScamStop reads the customer's explanation, and MuleNet inspects synthetic links around the receiving account. The decision layer displays the risk level, the strongest evidence from each check, and a recommended action. An analyst can review a high-risk case before a simulated payment is released. A visitor can also describe their own made-up scenario and watch a red agent play it against the guard.

## What the repository currently demonstrates

A live web console with three modes, a FastAPI assessment service, explainable transaction rules, Gemini-assisted scam-message reading and follow-up, a link check, translated warnings, an analyst-view simulation, and red-team tests built on scam cases modelled on public advice pages (each credited to its source), with half of the cases held back for one final score. A first MuleNet slice accepts a small synthetic transfer graph and scores flagged links, multiple inbound senders, and rapid onward transfers. No bank-owned account graph, real payment rail, persistent case store, or final human-hold workflow is connected.

## What must follow

Source payment and network evidence from trusted bank systems; validate the three modules on representative held-back cases; calibrate combined risk and customer friction; add authenticated analyst review and a durable audit record; and integrate with a payment workflow only after security, privacy, and operational review.
