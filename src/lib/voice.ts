export type VoiceLocale = "en" | "hi" | "kn";
let activeAudio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let playbackRequest = 0;

/** Resume audio synchronously from a user gesture so later AI replies can autoplay. */
export function prepareVoicePlayback() {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume().catch(() => undefined);
  } catch { /* Speech synthesis remains the fallback on browsers without Web Audio. */ }
}

/** Try the server-side ElevenLabs proxy first, then fall back to browser speech. */
export async function speakSaathi(text: string, locale: VoiceLocale): Promise<"elevenlabs" | "browser" | "unavailable"> {
  if (typeof window === "undefined") return "unavailable";
  const requestId = ++playbackRequest;
  prepareVoicePlayback();
  window.speechSynthesis?.cancel();
  activeAudio?.pause();
  activeAudio = null;
  try { activeSource?.stop(); } catch { /* It may have already finished. */ }
  activeSource = null;

  try {
    const response = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: locale }),
    });
    if (!response.ok) throw new Error("Voice service is not configured");
    const audioData = await response.arrayBuffer();
    if (requestId !== playbackRequest) return "unavailable";
    if (!audioContext) throw new Error("Web Audio unavailable");
    if (audioContext.state === "suspended") await audioContext.resume();
    const buffer = await audioContext.decodeAudioData(audioData);
    if (requestId !== playbackRequest) return "unavailable";
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => { if (activeSource === source) activeSource = null; };
    activeSource = source;
    source.start();
    return "elevenlabs";
  } catch {
    if (requestId !== playbackRequest) {
      return "unavailable";
    }
    activeAudio = null;
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return "unavailable";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "hi" ? "hi-IN" : locale === "kn" ? "kn-IN" : "en-IN";
    window.speechSynthesis.speak(utterance);
    return "browser";
  }
}
