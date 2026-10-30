import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "same_origin_required" }, { status: 403 });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "speech_service_not_configured" }, { status: 503 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    const language = form.get("language");
    if (!(file instanceof File) || file.size < 100 || file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "audio_must_be_between_100_bytes_and_8_mb" }, { status: 413 });
    }
    const languageCode = language === "hi" ? "hin" : language === "kn" ? "kan" : language === "en" ? "eng" : undefined;
    const client = new ElevenLabsClient();
    const result = await client.speechToText.convert({ file, modelId: "scribe_v2", ...(languageCode ? { languageCode } : {}) });
    return NextResponse.json({ text: result.text, languageCode: result.languageCode ?? languageCode ?? null });
  } catch {
    return NextResponse.json({ error: "transcription_failed" }, { status: 502 });
  }
}
