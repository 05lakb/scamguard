# Last Mile Guard deployment verification — 15 October 2026

Public URL: https://last-mile-guard-lcjgzaksea-uc.a.run.app/

## Observed directly

| Check | Public result |
| --- | --- |
| `GET /api/health` | HTTP 200, `{"ok":true}` |
| Root HTML | HTTP 200; title still "Last Mile Guard" |
| Web bundle | `index-XloT3IZI.js`, `index-UeHzjd3q.css` |
| `POST /api/assess` with one synthetic bank-impersonation note | HTTP 200; recommendation `hold`; message reading present; `from_cache=false`; no degraded notice |
| `POST /api/assess/stream` | HTTP 405; the live stream endpoint is not available in this deployment |
| Request/model/latency execution metadata | Absent from the public assessment response |
| API caching / frame protection | `Cache-Control: no-store`; `X-Frame-Options: DENY` |
| HTML caching / first paint | No Cache-Control header observed; root div empty in initial HTML |

The public app is reachable and returned a fresh message reading. It is an older
build than the local Last Mile Guard app. The response does not establish which Gemini
model, API provider, runtime identity, IAM permissions or Cloud Run revision it uses.

## Local status

The local app has the simpler Home / Try a payment / Review cases journey, backend
stage streaming, request metadata, explicit live/cached/fallback labels and the
paired evaluation. The evaluation uses the Gemini Developer API locally. This is
not proof of Vertex AI being used by the public deployment.

No Cloud Run deployment, IAM changes, billing changes or instance-setting changes
were made during this review. The Google Cloud CLI was not found on PATH or in the
usual local installation locations. The hosting project ID and authenticated
deployment access are needed before updating the public service.

## Release checks for the next revision

1. Verify the actual project, service, region and runtime identity in Google Cloud.
   The repository's deploy script is a reference, not proof of the current settings.
2. Deploy the reviewed local source and built evidence through the project's normal
   authenticated deployment path. Never upload `.env`, local credentials or caches.
3. Verify the public HTML title and asset hashes match the new build.
4. Run a fresh synthetic case through `/api/assess/stream`; confirm events arrive
   before the model result, with one matching request ID and truthful execution mode.
5. Verify Vertex configuration and service identity from deployment settings/logs.
   A successful health check or architecture diagram is insufficient.
6. Walk Home → Try the live demo → Review this case → simulated analyst action.
   Open Evidence and verify both downloadable reports match the displayed run.
7. Keep real-world effectiveness, persistent analyst storage, reviewer authentication,
   and load testing explicitly outside the current demonstrated scope.
