# Last Mile Guard: stop financial crime before payment settlement

**Product:** Last Mile Guard — Agentic Financial Crime Prevention Platform

**Three parts:** FraudShield + ScamStop + MuleNet
**Track:** Banking, financial services and insurance
**Stage:** Synthetic-data prototype

## The problem

A payment can be authorised by its customer and still be part of a scam. Transaction anomalies, a coached customer, and a suspicious receiving-account network may each be visible in different places. Looking at only one of them can miss the risk or create unnecessary friction.

## The combined idea

Last Mile Guard investigates a payment before it settles through three complementary checks:

1. **FraudShield** scores transaction anomalies: amount, timing, device, payee, payment frequency, and recent behaviour.
2. **ScamStop** looks for social-engineering signs in the customer's note and, when useful, asks one round of short follow-up questions. Gemini extracts structured facts; rules retain control of the recommendation.
3. **MuleNet** investigates the destination account's connections and movement of money to identify possible mule-network evidence.

A risk decision and explanation layer combines the available evidence, shows what raised or lowered risk, and recommends **proceed**, **warn or ask**, or **hold for human review**. The bank remains responsible for any real payment action.

## Target demo story

A customer starts a payment through a simulated banking screen. FraudShield checks the transaction, ScamStop reads the customer's explanation, and MuleNet inspects synthetic links around the receiving account. The decision layer displays the risk level, the strongest evidence from each check, and a recommended action. An analyst can review a high-risk case before a simulated payment is released.

## What the repository currently demonstrates

The existing ScamGuard/Last Mile Guard code has a live web console, a FastAPI assessment service, explainable transaction rules, Gemini-assisted scam-message reading and follow-up, an analyst-view simulation, and synthetic red-team tests. A first MuleNet slice now accepts a small synthetic transfer graph and scores flagged links, multiple inbound senders, and rapid onward transfers. No bank-owned account graph, real payment rail, persistent case store, or final human-hold workflow is connected.

## What must follow

Source payment and network evidence from trusted bank systems; validate the three modules on representative held-back cases; calibrate combined risk and customer friction; add authenticated analyst review and a durable audit record; and integrate with a payment workflow only after security, privacy, and operational review.
