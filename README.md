# ScamGuard

A safety check that runs just before a bank payment is sent, to help stop people from being tricked into paying scammers.

Built for the Google Cloud AI Builder Cup 2026 (banking, financial services and insurance track).

## The problem

Many scams today don't hack anyone's account. The scammer talks the customer into sending the money themselves: a fake investment, a fake bank call, a fake romance. Because the customer approves the payment, normal fraud checks often miss it. Worldwide, people lose hundreds of billions of dollars a year this way, and new rules in several regions make banks responsible for stopping it.

## What ScamGuard does

Before a payment goes out, ScamGuard looks at:

1. **How the payment looks:** new payee, unusual amount, odd time, many payments in a short time.
2. **What the customer was told:** pasted chat messages, screenshots or links are read for pressure tactics like "act now" or "don't tell your bank".
3. **Known scam patterns:** a small library of how common scams work.

It then decides one of three things:

- **Allow** the payment.
- **Pause and warn** the customer in plain words, explaining why.
- **Hold** the payment for a bank analyst to review.

Every decision comes with a short written explanation and a record of what was checked, so a person can review it later.

## How we use Google Cloud

- Gemini reads the messages and writes the explanations.
- Cloud Run hosts the app.
- BigQuery, Pub/Sub and a search index support the checks.

## Safety

- Only made-up data is used. No real customer information.
- Messages from customers are treated as untrusted text and are screened before use.
- The system can only recommend an action. It cannot move money. A person confirms every hold.
- Secrets are kept out of the code.

## Project layout

```
backend/    the server and the checks
frontend/   the web pages
data/       made-up data and test scenarios
eval/       scripts that measure how well it works
infra/      deployment scripts
docs/       design notes and diagrams
```

## Status

Early build. More details will be added as the pieces land.
