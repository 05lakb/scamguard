#!/usr/bin/env bash
# Tests the live site's newest features in a real browser and saves the report to the results repo.
# Run it in Google Cloud Shell:   bash video/record/verify.sh        (STORIES=2 bash ... for a quick check)
set -euo pipefail
cd "$(dirname "$0")"

echo "Installing the recorder (install scripts are switched off)..."
npm install --ignore-scripts --no-audit --no-fund
echo "Getting the browser it uses..."
npx playwright install chromium

code=0
node verify-new.mjs || code=$?
if [ "${code}" -eq 42 ]; then
  echo "The browser needs a few system libraries. Installing them (Cloud Shell only), then trying again..."
  sudo npx playwright install-deps chromium
  node verify-new.mjs
fi

echo "Saving the report to the results repo..."
cd ../..
files=(video/out/verify/*)
RESULTS_MAX_BYTES=$((30 * 1024 * 1024)) bash infra/save_results.sh new-features-test "${files[@]}"
