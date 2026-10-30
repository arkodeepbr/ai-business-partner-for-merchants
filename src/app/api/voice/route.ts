import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "same_origin_required" }, { status: 403 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
  if (!apiKey || !voiceId) {
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

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.trim(), model_id: modelId }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "voice_provider_unavailable" }, { status: 502 });
    }
    return new Response(response.body, {
      headers: { "Content-Type": response.headers.get("content-type") || "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "voice_provider_unavailable" }, { status: 502 });
  }
}
