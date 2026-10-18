#!/usr/bin/env bash
# Makes the narration audio, records the live site, renders the video, and saves the video to the results repo.
# Run it in Google Cloud Shell, from anywhere:   bash video/build.sh
# To render only some parts:                      SCENES="Scene1 Scene2" bash video/build.sh   (default: the whole video, "Full")
# To skip recording and reuse the last footage:   SKIP_RECORD=1 bash video/build.sh
# Nothing is installed on a laptop. Everything here runs on Google's machine.
set -euo pipefail
cd "$(dirname "$0")"
SCENES="${SCENES:-Full}"

echo "1/6 Making the narration audio with Google Text-to-Speech (unchanged scenes are kept)..."
gcloud services enable texttospeech.googleapis.com
python3 tts.py

if [ -z "${SKIP_RECORD:-}" ]; then
  echo "2/6 Recording the live site (about 2 minutes). Screenshots are taken separately: ONLY=shots bash video/record/run.sh"
  ONLY=video bash record/run.sh
else
  echo "2/6 Skipping the recording: using the footage already here."
fi
[ -f public/footage/demo.webm ] || { echo "There is no footage (video/public/footage/demo.webm). Run without SKIP_RECORD first." >&2; exit 1; }

echo "3/6 Installing the video tools (in Cloud Shell only; install scripts are switched off)..."
npm install --ignore-scripts --no-audit --no-fund

echo "3b/6 Measuring how far the recording runs behind the clock..."
node record/measure-lag.mjs

echo "4/6 Getting the headless browser the renderer uses..."
npx remotion browser ensure

echo "5/6 Rendering: ${SCENES}  (this takes a few minutes)..."
mkdir -p out
for id in ${SCENES}; do
  npx remotion render src/index.ts "$id" "out/$id.mp4" --crf=26
done

echo "6/6 Saving to the results repo..."
cd ..
files=()
for id in ${SCENES}; do files+=("video/out/$id.mp4"); done
RESULTS_MAX_BYTES=$((40 * 1024 * 1024)) bash infra/save_results.sh video-final "${files[@]}" video/public/audio/durations.json video/public/footage/marks.json
