# Recorded evaluation results

Run: `paired-20261015T165130Z` · Completed: 2026-10-15T17:04:12+00:00

Model: `gemini-3.5-flash-lite` via Gemini Developer API. Existing synthetic development data;
25 scams and 25 genuine payments. Not independent validation or real-world accuracy.

| Measure | Payment rules | Combined first-round assessment |
| --- | --- | --- |
| Scams warned or held | 11/25 (44.0%) | 13/25 (52.0%) |
| Genuine payments interrupted | 1/25 (4.0%) | 16/25 (64.0%) |
| Expected actions matched | 27/50 (54.0%) | 22/50 (44.0%) |
| Pending follow-up conversations | 0/50 (0.0%) | 28/50 (56.0%) |

## Interpretation

The combined assessment changes the first-round decisions, but these results do not
establish an overall improvement in customer outcomes. 12 scam-labelled
cases and 16 genuine-labelled cases remain pending customer answers.
Those questions are not counted as completed scam detections. Questioning a genuine
customer counts as friction even if it is reasonable given the limited note.

The immediate product-validation priority is completing the conversation on
independently authored cases and measuring unnecessary questions. Do not lower the
questioning thresholds just to improve this known dataset's headline score. Some
original labels depend on facts not contained in the submitted customer note.

## Reliability and timing

- Fresh Gemini readings: 48 of 50 assessments.
- No message reading requested: 2 cases
  with no initial note. These can still call Gemini to generate follow-up questions.
- Fallbacks: 0; API errors/no decision: 0.
- Fresh-reading backend median: 7109 ms;
  nearest-rank 95th percentile: 16781 ms.
- Requests were serial with at least 15 seconds between case starts. Backend timing
  excludes that spacing. This is not a concurrent-load or cold-start measurement.
- The earlier unpaced run hit provider quota on 41/50 assessments. It remains
  downloadable as `pairedEvidenceInitial.json`; the paced run does not erase it.

## Traceable artifacts

- Full current report: `web/src/data/pairedEvidence.json` (all case inputs, outputs,
  events, request IDs, source hashes and metric definitions).
- Small UI summary: `web/src/data/pairedEvidenceSummary.json`.
- Timestamped local original: `eval/output/paired-20261015T165130Z/report.json`.
- [Reproduction and independent-test protocol](PAIRED_EVALUATION.md).
