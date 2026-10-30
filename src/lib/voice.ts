export type VoiceLocale = "en" | "hi" | "kn";
let activeAudio: HTMLAudioElement | null = null;

/** Try the server-side ElevenLabs proxy first, then fall back to browser speech. */
export async function speakSaathi(text: string, locale: VoiceLocale): Promise<"elevenlabs" | "browser" | "unavailable"> {
  if (typeof window === "undefined") return "unavailable";
  window.speechSynthesis?.cancel();
  activeAudio?.pause();
  if (activeAudio) URL.revokeObjectURL(activeAudio.src);
  activeAudio = null;
  let audioUrl: string | null = null;

  try {
    const response = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: locale }),
    });
    if (!response.ok) throw new Error("Voice service is not configured");
    audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl);
    activeAudio = audio;
    audio.addEventListener("ended", () => { URL.revokeObjectURL(audio.src); if(activeAudio===audio)activeAudio=null; }, { once: true });
    audio.addEventListener("error", () => { URL.revokeObjectURL(audio.src); if(activeAudio===audio)activeAudio=null; }, { once: true });
    await audio.play();
    return "elevenlabs";
  } catch {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    activeAudio = null;
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return "unavailable";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "hi" ? "hi-IN" : locale === "kn" ? "kn-IN" : "en-IN";
    window.speechSynthesis.speak(utterance);
    return "browser";
  }
}
