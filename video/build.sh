#!/usr/bin/env bash
# Makes the narration audio and the video, then saves them to the results repo.
# Run it in Google Cloud Shell, from anywhere:   bash video/build.sh
# To render only some parts:                      SCENES="Full" bash video/build.sh
# Nothing is installed on a laptop. Everything here runs on Google's machine.
set -euo pipefail
cd "$(dirname "$0")"
SCENES="${SCENES:-Scene1 Scene2 Scene3 Scene4 Scene5 Scene6 Scene7 Full}"

echo "1/5 Making the narration audio with Google Text-to-Speech (unchanged scenes are kept)..."
gcloud services enable texttospeech.googleapis.com
python3 tts.py

echo "2/5 Installing the video tools (in Cloud Shell only; install scripts are switched off)..."
npm install --ignore-scripts --no-audit --no-fund

echo "3/5 Getting the headless browser the renderer uses..."
npx remotion browser ensure

echo "4/5 Rendering: ${SCENES}  (this takes a few minutes)..."
mkdir -p out
for id in ${SCENES}; do
  npx remotion render src/index.ts "$id" "out/$id.mp4" --crf=28
done

echo "5/5 Saving to the results repo..."
cd ..
files=()
for id in ${SCENES}; do files+=("video/out/$id.mp4"); done
RESULTS_MAX_BYTES=$((30 * 1024 * 1024)) bash infra/save_results.sh video-full "${files[@]}" video/public/audio/durations.json
