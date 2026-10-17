// The browser's own speech tools: a recogniser that turns the microphone into text (Chrome and Edge),
// and a voice that reads text aloud. Neither is available in every browser, so callers check first.

export interface Recogniser {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function makeRecogniser(): Recogniser | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recogniser; webkitSpeechRecognition?: new () => Recogniser };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

// Reads the text aloud and resolves when it finishes (or straight away if the browser cannot speak).
export function speak(text: string, lang = "en-IN"): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1;
    const done = () => resolve();
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    // Some browsers never fire onend; never leave the call stuck.
    window.setTimeout(done, Math.min(20_000, 2_000 + text.length * 80));
  });
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
