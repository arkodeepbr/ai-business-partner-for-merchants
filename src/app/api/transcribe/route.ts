import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { isSameOriginRequest } from "@/lib/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
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
  } catch (error) {
    const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
    const reason = status === 401 || status === 403 ? "speech_service_auth_failed" : status === 429 || status === 402 ? "speech_service_quota_exhausted" : "transcription_failed";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
