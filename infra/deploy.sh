#!/usr/bin/env bash
# Deploys Last Mile Guard to Cloud Run. Run it in Google Cloud Shell, from the repo folder.
# Usage:  PROJECT_ID=your-project-id bash infra/deploy.sh
#
# It is safe to run again. It builds on Google's machines, not on your laptop.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID first, for example: export PROJECT_ID=last-mile-guard-510814}"
REGION="${REGION:-us-central1}"          # a region inside Cloud Run's free allowance
SERVICE="last-mile-guard"
MIN_INSTANCES="${MIN_INSTANCES:-0}"      # use 1 during judging; warm instances incur idle charges
FIRESTORE="${FIRESTORE:-0}"              # 1 saves cases and analyst decisions in Firestore (database must exist)
if [[ ! "${MIN_INSTANCES}" =~ ^[0-2]$ ]]; then
  echo "MIN_INSTANCES must be 0, 1 or 2 (the configured maximum)." >&2
  exit 1
fi
RUNTIME_ACCOUNT="lmg-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Project: ${PROJECT_ID}   Region: ${REGION}"
gcloud config set project "${PROJECT_ID}" >/dev/null

# New Google projects need this once: the builder identity must be allowed to build from source.
# It is Google's narrow "Cloud Run Builder" role, and running it again does no harm.
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.builder" >/dev/null

# Cost and safety limits:
#   min-instances 0   -> scales to zero when idle; 1 keeps an instance warm for judging
#   max-instances 2   -> a flood of visitors cannot start many copies
#   concurrency 20    -> each copy handles up to 20 requests at once
#   memory 512Mi, 1 cpu, 300 second timeout (a live red-team run takes a few minutes)
# The app runs as the "lmg-runtime" identity, which can only call Gemini. No keys are used.
gcloud run deploy "${SERVICE}" \
  --source . \
  --region "${REGION}" \
  --service-account "${RUNTIME_ACCOUNT}" \
  --allow-unauthenticated \
  --min-instances "${MIN_INSTANCES}" \
  --max-instances 2 \
  --concurrency 20 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 300 \
  --set-env-vars "USE_VERTEX=1,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},VERTEX_LOCATION=global,LMG_DISK_CACHE=0,LMG_FIRESTORE=${FIRESTORE}"

echo
echo "Done. The web address is:"
gcloud run services describe "${SERVICE}" --region "${REGION}" --format="value(status.url)"
