# FinGuard: visible execution demo

## Research, 15 October 2026

Reviewed the organizer's results and the teams' written submissions. These are evidence of awards and described workflows, not proof that a particular UI caused a win. The videos were not watched.

- Google named SalesShortcut the grand-prize winner and GreenOps the Asia-Pacific winner in the 2025 ADK hackathon: https://cloud.google.com/blog/products/ai-machine-learning/adk-hackathon-results-winners-and-highlights/
- GreenOps describes specialist agents with inspectable recommendations, forecasts and generated reports: https://devpost.com/software/greenops-gzp4aj
- SalesShortcut describes an end-to-end lead discovery, research, proposal and outreach workflow: https://devpost.com/software/salesshortcut
- Google's Gemini competition selected Jayu as best overall, highlighting its visible interaction with application interfaces: https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/

Our inference: a strong FinGuard demo should make the problem, each check's contribution, and the final human action visible in one workflow.

## Implemented

`POST /api/assess/stream` emits newline-delimited JSON as the shared assessment pipeline progresses. The existing JSON endpoint consumes the same pipeline. Events include a request ID, elapsed time, stage and status. No artificial stage delays or invented reasoning are used.

The Live console's run button and execution panel appear above the long case details. The panel shows FraudShield (payment rules), MuleNet (account-link rules), ScamStop (Gemini reading), clarification when needed, and the decision. The existing guided story also uses this stream. Gemini readings are labeled fresh, saved or unavailable. Missing account graphs are explicit.

## Suggested 90-second presentation

1. 0–10 seconds: explain the customer's payment risk and click Run a payment demo on Overview (d6 supplies all three checks).
2. 10–35 seconds: follow the backend activity. Explain the payment signals, graph evidence and Gemini's reading. Cached results can finish almost instantly; edit the note to test a different message.
3. 35–55 seconds: show the recommendation and strongest reasons. Say this is a simulation and no money moves.
4. 55–75 seconds: open Analyst queue, inspect the new live case and demonstrate the human review action.
5. 75–90 seconds: use Evidence for the reproducible rules baseline and Architecture for implementation questions.

Timing is a presentation target, not a guarantee of model latency. Use the console for execution, Evidence for evaluation, and Architecture for system design. These are different forms of proof.

## Scope

The implementation is a coordinated rules-and-Gemini pipeline. FraudShield and MuleNet are deterministic checks, not autonomous LLM agents. Streaming reveals execution; it does not add planning, tool selection or autonomous bank actions. Client cancellation stops receiving events; an already-started provider request may finish on the backend under its timeout.
