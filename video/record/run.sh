#!/usr/bin/env bash
# Records the live site and takes screenshots. Run it in Google Cloud Shell, from anywhere:
#   bash video/record/run.sh                    video and screenshots
#   ONLY=shots bash video/record/run.sh         screenshots only: a quick check, then saved to the results repo
# Nothing is installed on a laptop. Everything here runs on Google's machine, and the browser only visits the site.
set -euo pipefail
cd "$(dirname "$0")"

echo "Installing the recorder (install scripts are switched off)..."
npm install --ignore-scripts --no-audit --no-fund

echo "Getting the browser it uses (one download, about 150 MB)..."
npx playwright install chromium

code=0
node record.mjs || code=$?
if [ "${code}" -eq 42 ]; then
  echo "The browser needs a few system libraries. Installing them (Cloud Shell only), then trying again..."
  sudo npx playwright install-deps chromium
  node record.mjs
elif [ "${code}" -ne 0 ]; then
  exit "${code}"
fi

if [ "${ONLY:-all}" = "dashboard" ]; then
  echo "Saving the dashboard screenshot to the results repo..."
  cd ../..
  RESULTS_MAX_BYTES=$((30 * 1024 * 1024)) bash infra/save_results.sh dashboard video/out/shots/dashboard.png
elif [ "${ONLY:-all}" = "shots" ]; then
  echo "Saving the screenshots to the results repo..."
  cd ../..
  files=(video/out/shots/*.png)
  RESULTS_MAX_BYTES=$((30 * 1024 * 1024)) bash infra/save_results.sh screenshots "${files[@]}"
fi
