import {Platform} from 'react-native';
import {requireNativeModule} from 'expo-modules-core';

type SaathiNativeModule = {
  start(token: string, baseUrl: string, language: 'en' | 'hi', conversationId: string | null, voiceId: string | null): Promise<{running: boolean}>;
  stop(): Promise<void>;
  isRunning(): boolean;
};

function nativeSaathi(): SaathiNativeModule {
  if (Platform.OS !== 'android') throw new Error('Background Saathi is available on Android only.');
  return requireNativeModule<SaathiNativeModule>('Saathi');
}

export async function startBackgroundSaathi(
  token: string,
  baseUrl: string,
  language: 'en' | 'hi',
  conversationId: string | null,
  voiceId: string | null,
): Promise<void> {
  await nativeSaathi().start(token, baseUrl, language, conversationId, voiceId);
}

export async function stopBackgroundSaathi(): Promise<void> {
  if (Platform.OS === 'android') await nativeSaathi().stop();
}

export function isBackgroundSaathiRunning(): boolean {
  return Platform.OS === 'android' && nativeSaathi().isRunning();
}
