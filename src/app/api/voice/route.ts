import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "same_origin_required" }, { status: 403 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "voice_provider_not_configured" }, { status: 503 });
  }

  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim() || text.length > 1200) {
    return NextResponse.json({ error: "text_must_be_between_1_and_1200_characters" }, { status: 422 });
  }

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v4";
  try {
    const client = new ElevenLabsClient();
    const audio = await client.textToSpeech.convert(voiceId, {
      text: text.trim(),
      modelId,
      outputFormat: "mp3_44100_128",
    });
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "voice_provider_unavailable" }, { status: 502 });
  }
}
