import * as SecureStore from 'expo-secure-store';
import type { components } from '@/api/schema.generated';
import { demoApi } from '@/services/demo';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
export type Sales = components['schemas']['SalesSummary'];
export type Product = components['schemas']['ProductOut'];
export type ElevenLabsVoice = {voice_id: string; name: string; category: string; accent: string; gender: string};
export type ElevenLabsVoiceList = {voices: ElevenLabsVoice[]; default_voice_id: string};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await SecureStore.getItemAsync('session_token');
  if (token === 'offline-demo-workspace') return demoApi<T>(path, init);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  if (!response.ok) {
    let detail: string | undefined;
    try { detail = (await response.json() as {detail?: string}).detail; } catch { /* Use the HTTP status when no JSON detail is available. */ }
    throw new Error(detail || (response.status === 401 ? 'Sign in is required to view merchant data.' : `Service returned ${response.status}.`));
  }
  return response.json() as Promise<T>;
}

export async function requestElevenLabsSpeech(text: string, voiceId?: string): Promise<Uint8Array> {
  const token = await SecureStore.getItemAsync('session_token');
  if (!token || token === 'offline-demo-workspace') {
    throw new Error('ElevenLabs playback needs a signed-in app connected to the backend.');
  }
  const response = await fetch(`${API_BASE_URL}/assistant/speech`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({text, ...(voiceId ? {voice_id: voiceId} : {})}),
  });
  if (!response.ok) {
    let message = `ElevenLabs speech is unavailable (service ${response.status}).`;
    try {
      const body = await response.json() as {detail?: string};
      if (body.detail) message = body.detail;
    } catch { /* The service returned no readable error body. */ }
    throw new Error(message);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function establishLocalWorkspace(name: string): Promise<void> {
  if (process.env.EXPO_PUBLIC_LOCAL_BOOTSTRAP !== 'true') throw new Error('Local workspace setup is disabled. Configure the authorized sign-in provider.');
  const merchant = await api<{id: string}>('/merchants', { method: 'POST', body: JSON.stringify({name, tier:'qr'}) });
  const session = await api<{access_token: string}>(`/auth/local-session?merchant_id=${encodeURIComponent(merchant.id)}`, { method: 'POST' });
  await SecureStore.setItemAsync('session_token', session.access_token);
}
