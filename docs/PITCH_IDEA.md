# ScamGuard: the last check before a scam payment

**Product name:** Last Mile Guard  
**Track:** Banking, financial services and insurance  
**Stage:** Prototype using synthetic scenarios and data

## The problem

Many scams persuade a customer to approve a payment themselves. The bank sees an authenticated transaction, while the pressure, false story, or instruction to keep the transfer secret may be invisible to ordinary fraud checks. A useful intervention has to happen before the money leaves, without holding every unusual but legitimate payment.

## The idea

ScamGuard adds a second look at the final step of a bank payment. It combines payment and recent-behaviour signals with an optional customer note. Gemini reads the note for scam tactics; testable rules weigh that reading alongside the transaction context and known scam patterns. When the evidence is unclear, the system can ask one short follow-up question and reassess the answer.

The outcome is **allow**, **warn**, or **hold for human review**, with ranked reasons that an analyst can inspect. ScamGuard recommends an action; it does not move money or make a final hold decision on its own.

## A 90-second demo story

1. A customer starts a payment to a new payee and shares the message that prompted it.
2. ScamGuard checks recent payment behaviour and reads the message for pressure, secrecy, and the claimed reason for payment.
3. If the signal is uncertain, it asks one relevant question. The customer's answer gets one more assessment.
4. The customer sees a plain-language warning or proceeds. A high-risk case is presented to an analyst with the evidence and reasons behind the recommendation.
5. The demo can replay made-up scam and legitimate cases, then show evaluation results and known limits.

## Why this approach

- It looks for *the story behind an authorised payment*, not just anomalies in the transaction.
- It asks for more context only when needed, reducing unnecessary friction for legitimate customers.
- It keeps the decision explainable through ranked contributions and an analyst view.
- It tests both missed scams and false alarms with synthetic scenarios and red-team runs.

## What exists in this prototype

The repository includes a web demo, a payment-assessment API, risk and message-reading logic, a Gemini client, synthetic scenarios, evaluation scripts, red-team tooling, tests, and Cloud Run deployment scripts. The demo and its results are prototype evidence, not proof of bank production readiness. No real customer data or live payment rails are part of this project.

## What would come next

Validate with a bank partner using governed data and a defined consent, privacy, and review process. Measure scam detection, false-positive friction, explanation quality, latency, and analyst workload on representative cases. Integrate with a bank's payment workflow only after operational and security review.
