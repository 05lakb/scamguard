# Evidence tab review

## Corrections

- Historical headline results had no linked raw reports, dates or model versions in this checkout. They are now archived as unverified development notes, rather than presented as current performance.
- Pending retests and reported fixes no longer receive a green completion status.
- A zero-percent bar now has zero width.
- Category charts identify agreement with expected actions, and distinguish genuine-payment friction from detection. Public education sources are not presented as external validation.
- The main view uses a fresh, reproducible **payment-rules-only** run. It does not make claims about Gemini, MuleNet or the combined assessment.

## Reproduction

Run `.venv/Scripts/python.exe eval/export_evidence.py` from the repository root, then run `npm.cmd run build` in `web`.

The export writes `web/src/data/verifiedEvidence.json`. The UI offers that exact JSON as a download, including per-case decisions, expected actions, exclusions, generation time and SHA-256 hashes of both input files, the payment rules and the exporter. No key or customer message is exported. No model requests are made.

This is a recorded snapshot, not a live benchmark. Regenerate it after modifying inputs or payment rules. Synthetic project-authored cases cannot establish real-world performance; use independently authored held-out cases and record model, prompt and code versions for future full-system evaluations.

## Preserved history

The original `web/src/data/evidence.json` remains unchanged. Its summaries are retained in the expandable historical section. No missing raw results have been reconstructed or invented.
