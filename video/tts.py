"""Turns the narration into spoken audio with Google Cloud Text-to-Speech. Run it in Cloud Shell.

  python3 video/tts.py            # makes audio for any scene whose text changed
  python3 video/tts.py --force    # makes all of it again

It writes one WAV file per scene into video/public/audio/ and records how long each one is, so the animated
scenes can be timed to the voice. It uses the Cloud Shell sign-in (no keys), and sends only the narration text,
which is the same text shown in the video. The voice is a synthetic Google voice, so say so in the video notes.
"""

import base64
import hashlib
import io
import json
import subprocess
import sys
import urllib.error
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
NARRATION = HERE / "narration.json"
AUDIO = HERE / "public" / "audio"
DURATIONS = AUDIO / "durations.json"

URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
VOICES = ["en-US-Neural2-D", "en-US-Wavenet-D", "en-US-Standard-D"]  # tried in this order
SAMPLE_RATE = 24000
SPEAKING_RATE = 0.96  # a little slower than normal, so it is easy to follow


def gcloud(*arguments):
    return subprocess.run(["gcloud", *arguments], check=True, capture_output=True, text=True).stdout.strip()


def synthesize(text, voice, project, token):
    body = {
        "input": {"text": text},
        "voice": {"languageCode": "en-US", "name": voice},
        "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": SAMPLE_RATE, "speakingRate": SPEAKING_RATE},
    }
    request = urllib.request.Request(
        URL, data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {token}", "x-goog-user-project": project, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return base64.b64decode(json.load(response)["audioContent"])


def seconds_in(wav_bytes):
    with wave.open(io.BytesIO(wav_bytes)) as handle:
        return handle.getnframes() / float(handle.getframerate())


def main():
    force = "--force" in sys.argv
    project = gcloud("config", "get-value", "project")
    token = gcloud("auth", "print-access-token")
    scenes = json.loads(NARRATION.read_text(encoding="utf-8"))["scenes"]
    AUDIO.mkdir(parents=True, exist_ok=True)
    known = json.loads(DURATIONS.read_text(encoding="utf-8")) if DURATIONS.exists() else {}

    characters = 0
    for scene in scenes:
        name = scene["id"]
        digest = hashlib.sha256(scene["text"].encode("utf-8")).hexdigest()[:16]
        path = AUDIO / f"{name}.wav"
        if not force and path.exists() and known.get(name, {}).get("hash") == digest:
            print(f"  {name}: unchanged, kept ({known[name]['seconds']:.1f} s)")
            continue
        audio, last_error = None, None
        for voice in VOICES:
            try:
                audio = synthesize(scene["text"], voice, project, token)
                known[name] = {"seconds": round(seconds_in(audio), 2), "hash": digest, "voice": voice}
                break
            except urllib.error.HTTPError as error:
                last_error = f"{voice}: HTTP {error.code} {error.read().decode('utf-8', 'replace')[:200]}"
                print(f"  {name}: {last_error}")
        if audio is None:
            sys.exit(f"Could not make audio for {name}. Last error: {last_error}")
        path.write_bytes(audio)
        characters += len(scene["text"])
        print(f"  {name}: {known[name]['seconds']:.1f} s with {known[name]['voice']}")

    DURATIONS.write_text(json.dumps(known, indent=2) + "\n", encoding="utf-8")
    total = sum(item["seconds"] for item in known.values())
    print(f"Characters sent this run: {characters}. Total narration: {total:.0f} s ({total / 60:.1f} min).")


if __name__ == "__main__":
    main()
