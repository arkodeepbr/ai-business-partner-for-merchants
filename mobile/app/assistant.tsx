import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Note } from '@/components/Screen';
import { api, API_BASE_URL, ElevenLabsVoiceList, requestElevenLabsSpeech } from '@/services/api';
import type { components } from '@/api/schema.generated';
import { colors } from '@/theme/tokens';
import { assistantRequestSchema } from '@/utils/validation';
import { spokenCurrencyText } from '@/utils/spokenCurrency';
import { useSampleWorkspace } from '@/hooks/useSampleWorkspace';
import * as Notifications from 'expo-notifications';
import { isBackgroundSaathiRunning, startBackgroundSaathi, stopBackgroundSaathi } from '@/services/saathi';

type Answer = components['schemas']['AssistantResponse'];
type ChatMessage = {id: string; role: string; content: string; sources: string[]};
type PendingDraft = NonNullable<Answer['pending_receivable_draft']> & {idempotency_key: string};
const englishQuestions = ["How much did I collect today?", 'What settlements are pending?', 'Which products need reordering?'];
const hindiQuestions = ['आज कितना कलेक्शन हुआ?', 'कितने सेटलमेंट लंबित हैं?', 'किन चीज़ों का स्टॉक कम है?'];

export default function Assistant() {
  const sampleWorkspace = useSampleWorkspace();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{question?: string; autostart?: string}>();
  const queryClient = useQueryClient();
  const audioPlayer = useAudioPlayer(null);
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const audioFile = useRef<File | null>(null);
  const pendingPlaybackFallback = useRef<{text: string; messageId: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [error, setError] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [listening, setListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedDraftMessage, setSavedDraftMessage] = useState('');
  const [backgroundListening, setBackgroundListening] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | undefined>();
  const voiceSubmitPending = useRef(false);
  const routeHandled = useRef(false);
  const {control, handleSubmit, reset, setValue, formState} = useForm<z.infer<typeof assistantRequestSchema>>({
    resolver: zodResolver(assistantRequestSchema), defaultValues: {question: ''},
  });

  useSpeechRecognitionEvent('start', () => { setListening(true); setVoiceError(''); });
  useSpeechRecognitionEvent('end', () => { setListening(false); voiceSubmitPending.current = false; });
  useSpeechRecognitionEvent('result', event => {
    const transcript = event.results[0]?.transcript?.trim();
    if (!transcript) return;
    setValue('question', transcript, {shouldDirty: true, shouldValidate: event.isFinal});
    if (event.isFinal && !voiceSubmitPending.current) {
      voiceSubmitPending.current = true;
      void submitQuestion(transcript);
    }
  });
  useSpeechRecognitionEvent('error', event => {
    setListening(false);
    voiceSubmitPending.current = false;
    setVoiceError(event.error === 'not-allowed'
      ? 'Microphone access was denied. Enable it in Android Settings to use voice input.'
      : event.error === 'service-not-allowed'
        ? 'No Android speech recognition service is available. Enable Speech Recognition & Synthesis in Android settings.'
        : event.error === 'network' || /server disconnected/i.test(event.message ?? '')
          ? 'Android speech recognition lost its network connection. Check the device connection or enable an offline English or Hindi speech pack, then try again.'
        : `Voice input stopped: ${event.message || event.error}.`);
  });

  useEffect(() => { SecureStore.getItemAsync('conversation_id').then(setConversationId).catch(() => {}); }, []);
  useEffect(() => {
    SecureStore.getItemAsync('assistant_language').then(value => {
      if (value === 'hi-IN') setSpeechLanguage('hi-IN');
    }).catch(() => {});
  }, []);
  useEffect(() => { SecureStore.getItemAsync('elevenlabs_voice_id').then(value => { if (value) setVoiceId(value); }).catch(() => {}); }, []);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const refresh = () => {
      try { setBackgroundListening(isBackgroundSaathiRunning()); }
      catch { setBackgroundListening(false); }
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!routeHandled.current && params.question) {
      routeHandled.current = true;
      setValue('question', params.question, {shouldDirty: true, shouldValidate: true});
      void submitQuestion(params.question);
    } else if (!routeHandled.current && params.autostart === 'true') {
      routeHandled.current = true;
      const timer = setTimeout(() => void startVoice(), 450);
      return () => clearTimeout(timer);
    }
  }, [params.autostart, params.question, setValue]);
  useEffect(() => () => {
    Speech.stop();
    try { ExpoSpeechRecognitionModule.abort(); } catch { /* Native service may already be stopped. */ }
    try { audioPlayer.pause(); audioPlayer.replace(null); } catch { /* Player may already be released. */ }
    try { audioFile.current?.delete(); } catch { /* Cache cleanup is best effort. */ }
  }, [audioPlayer]);
  useEffect(() => {
    if (audioStatus.didJustFinish) {
      setSpeakingMessageId(null);
      pendingPlaybackFallback.current = null;
      try { audioFile.current?.delete(); } catch { /* Cache cleanup is best effort. */ }
      audioFile.current = null;
    }
    if (audioStatus.error && pendingPlaybackFallback.current) {
      const pending = pendingPlaybackFallback.current;
      pendingPlaybackFallback.current = null;
      void speakOnDevice(pending.text, pending.messageId, 'ElevenLabs audio could not be played. Using the installed device voice.');
    }
  }, [audioStatus.didJustFinish, audioStatus.error]);

  const voices = useQuery({queryKey: ['elevenlabs-voices'], queryFn: () => api<ElevenLabsVoiceList>('/assistant/voices'), enabled: !sampleWorkspace, retry: false, staleTime: 300_000});
  const voiceOptions = Array.isArray(voices.data?.voices) ? voices.data.voices : [];
  useEffect(() => {
    if (!voiceId && voices.data?.default_voice_id) setVoiceId(voices.data.default_voice_id);
    else if (voiceId && voices.data && !voiceOptions.some(voice => voice.voice_id === voiceId)) {
      setVoiceId(voices.data.default_voice_id);
    }
  }, [voiceId, voices.data]);
  const history = useQuery({queryKey: ['conversation', conversationId], enabled: Boolean(conversationId), queryFn: () => api<ChatMessage[]>(`/conversations/${conversationId}/messages`)});

  function cleanupAudio() {
    try { audioPlayer.pause(); audioPlayer.replace(null); } catch { /* Player may not have loaded a clip yet. */ }
    try { audioFile.current?.delete(); } catch { /* Cache cleanup is best effort. */ }
    audioFile.current = null;
    setSpeakingMessageId(null);
  }

  async function speakOnDevice(text: string, messageId: string, reason?: string) {
    const speechText = spokenCurrencyText(text);
    if (reason) setVoiceError(reason);
    cleanupAudio();
    const language = /[\u0900-\u097f]/i.test(speechText) ? 'hi-IN' : 'en-IN';
    const available = await Speech.getAvailableVoicesAsync().catch(() => []);
    const localVoice = available.find(voice => voice.language.toLowerCase() === language.toLowerCase() && /embedded|local|offline/i.test(voice.identifier));
    setSpeakingMessageId(messageId);
    Speech.speak(speechText, {
      language: localVoice?.language ?? language, ...(localVoice ? {voice: localVoice.identifier} : {}), rate: 0.94, pitch: 1, volume: 1,
      onDone: () => setSpeakingMessageId(null), onStopped: () => setSpeakingMessageId(null),
      onError: () => { setSpeakingMessageId(null); setVoiceError('Android could not play the fallback voice. Check the installed speech service and media volume.'); },
    });
  }

  async function speakAnswer(text: string, messageId: string) {
    const speechText = spokenCurrencyText(text);
    setVoiceError('');
    setSpeechLoading(true);
    Speech.stop();
    try {
      if (sampleWorkspace) throw new Error('ElevenLabs is available after the app is connected to a signed-in backend.');
      const bytes = await requestElevenLabsSpeech(speechText.slice(0, 2500), voiceId);
      await setAudioModeAsync({playsInSilentMode: true});
      cleanupAudio();
      const file = new File(Paths.cache, `business-partner-${Date.now()}.mp3`);
      file.create({intermediates: true, overwrite: true});
      await file.write(bytes);
      audioFile.current = file;
      pendingPlaybackFallback.current = {text: speechText, messageId};
      audioPlayer.replace({uri: file.uri});
      setSpeakingMessageId(messageId);
      audioPlayer.play();
    } catch (e) {
      pendingPlaybackFallback.current = null;
      const detail = e instanceof Error ? e.message : 'ElevenLabs speech could not be played.';
      if (/[\u0900-\u097f]/i.test(text)) {
        await speakOnDevice(speechText, messageId, sampleWorkspace ? 'Offline sample uses the installed Hindi voice. Configure the backend to enable ElevenLabs.' : 'ElevenLabs is unavailable. Using the installed Hindi voice for this reply.');
        return;
      }
      setVoiceError(sampleWorkspace ? 'Offline sample uses the installed Android voice. Configure the backend to enable ElevenLabs.' : `${detail} Using the installed device voice for this reply.`);
      cleanupAudio();
      const available = await Speech.getAvailableVoicesAsync().catch(() => []);
      const localEnglish = available.find(voice => voice.language.toLowerCase().startsWith('en') && /embedded|local|offline/i.test(voice.identifier));
      setSpeakingMessageId(messageId);
      Speech.speak(speechText, {
        language: localEnglish?.language ?? 'en-US', ...(localEnglish ? {voice: localEnglish.identifier} : {}), rate: 0.94, pitch: 1, volume: 1,
        onDone: () => setSpeakingMessageId(null), onStopped: () => setSpeakingMessageId(null),
        onError: () => { setSpeakingMessageId(null); setVoiceError(`${detail} Android could not play its fallback voice either.`); },
      });
    } finally {
      setSpeechLoading(false);
    }
  }

  function stopSpeech() { Speech.stop(); pendingPlaybackFallback.current = null; cleanupAudio(); }

  async function submitQuestion(question: string) {
    const parsed = assistantRequestSchema.safeParse({question});
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter a question first.'); return; }
    setBusy(true); setError(''); setPendingDraft(null); setSavedDraftMessage('');
    try {
      let id = conversationId;
      if (!id) {
        const conversation = await api<{id: string}>('/conversations', {method: 'POST'});
        id = conversation.id; setConversationId(id); await SecureStore.setItemAsync('conversation_id', id);
      }
      const answer = await api<Answer>('/assistant/query', {method: 'POST', body: JSON.stringify({
        question: parsed.data.question,
        conversation_id: id,
        response_language: speechLanguage === 'hi-IN' ? 'hi' : 'en',
      })});
      if (answer.pending_receivable_draft) {
        setPendingDraft({...answer.pending_receivable_draft,
          idempotency_key: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`});
      }
      reset({question: ''});
      const messages = await api<ChatMessage[]>(`/conversations/${id}/messages`).catch(() => []);
      const pairAlreadySaved = messages.at(-2)?.role === 'user' && messages.at(-2)?.content === parsed.data.question &&
        messages.at(-1)?.role === 'assistant' && messages.at(-1)?.content === answer.answer;
      queryClient.setQueryData<ChatMessage[]>(['conversation', id], pairAlreadySaved ? messages : [
        ...messages,
        {id: `local-user-${Date.now()}`, role: 'user', content: parsed.data.question, sources: []},
        {id: `local-assistant-${Date.now()}`, role: 'assistant', content: answer.answer, sources: answer.sources ?? []},
      ]);
      if (voiceReplies) void speakAnswer(answer.answer, `latest-${Date.now()}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reach the assistant.'); }
    finally { setBusy(false); }
  }

  async function confirmReceivable() {
    if (!pendingDraft || savingDraft) return;
    setSavingDraft(true); setError('');
    try {
      const saved = await api<{created: boolean}>('/receivables', {
        method: 'POST', body: JSON.stringify(pendingDraft),
      });
      queryClient.invalidateQueries({queryKey: ['receivables']});
      setSavedDraftMessage(sampleWorkspace
        ? 'Fictional sample due saved on this device.'
        : saved.created ? 'Pending customer due saved to this merchant workspace.' : 'This pending customer due was already saved.');
      setPendingDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the pending customer due.');
    } finally { setSavingDraft(false); }
  }

  async function newConversation() {
    try {
      stopSpeech();
      const row = await api<{id: string}>('/conversations', {method: 'POST'});
      setConversationId(row.id); await SecureStore.setItemAsync('conversation_id', row.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start a new conversation.'); }
  }

  async function startVoice() {
    setVoiceError('');
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) { setVoiceError('Speech recognition is unavailable. Enable an Android speech recognition service.'); return; }
      const permission = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
      if (!permission.granted) { setVoiceError('Microphone access is needed to transcribe a voice question.'); return; }
      stopSpeech();
      ExpoSpeechRecognitionModule.start({lang: speechLanguage, interimResults: true, continuous: false, addsPunctuation: true});
    } catch (e) { setVoiceError(e instanceof Error ? e.message : 'Could not start voice input.'); }
  }

  async function toggleBackgroundSaathi() {
    if (backgroundBusy) return;
    setBackgroundBusy(true);
    setVoiceError('');
    try {
      if (backgroundListening) {
        await stopBackgroundSaathi();
        setBackgroundListening(false);
        return;
      }
      if (Platform.OS !== 'android') throw new Error('Background Saathi is available on Android only.');
      if (sampleWorkspace) throw new Error('Sign in to your merchant account to use background Saathi.');
      const token = await SecureStore.getItemAsync('session_token');
      if (!token || token === 'offline-demo-workspace') throw new Error('Sign in to your merchant account before enabling background Saathi.');
      const microphone = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
      if (!microphone.granted) throw new Error('Allow microphone access before enabling background listening.');
      if (Platform.Version >= 33) {
        let notificationPermission = await Notifications.getPermissionsAsync();
        if (!notificationPermission.granted) notificationPermission = await Notifications.requestPermissionsAsync();
        if (!notificationPermission.granted) throw new Error('Allow notifications so Android can keep Saathi’s microphone service visible and give you a Stop control.');
      }
      await startBackgroundSaathi(token, API_BASE_URL, speechLanguage === 'hi-IN' ? 'hi' : 'en', conversationId, voiceId ?? null);
      setBackgroundListening(true);
      setVoiceError('Saathi is listening in the background. Android will keep a notification visible; use its Stop button to turn the microphone off.');
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : 'Could not start background Saathi.');
      try { setBackgroundListening(isBackgroundSaathiRunning()); } catch { setBackgroundListening(false); }
    } finally {
      setBackgroundBusy(false);
    }
  }

  const activeVoice = voiceOptions.find(voice => voice.voice_id === voiceId);
  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/home');
  const listeningLanguage = speechLanguage === 'hi-IN' ? 'Hindi' : 'English';
  return <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 20, 58, 0.28)'}}>
    <Pressable accessibilityLabel="Close voice assistant" onPress={close} style={{position: 'absolute', top: 0, right: 0, bottom: 0, left: 0}} />
    <View style={{height: '88%', maxHeight: '92%', backgroundColor: '#F4F7FB', borderTopLeftRadius: 36, borderTopRightRadius: 36, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', shadowColor: '#001E49', shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: {width: 0, height: -8}, elevation: 16}}>
      <View style={{alignItems: 'center', paddingTop: 9, paddingBottom: 4}}><View style={{width: 42, height: 5, borderRadius: 4, backgroundColor: '#CFD4DF'}}/></View>
      <View style={{flex: 1, paddingBottom: Math.max(10, insets.bottom + 6)}}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 14, gap: 14}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <View style={{backgroundColor: '#E7EDFF', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Text style={{fontSize: 17, color: colors.cyan}}>✦</Text><Text style={{fontSize: 15, fontWeight: '800', color: colors.navy}}>Paytm AI Voice Partner</Text>
              <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: listening ? colors.green : colors.cyan}}/>
            </View>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close assistant" style={{width: 40, height: 40, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7EBF5'}}><Text style={{fontSize: 24, color: colors.navy}}>×</Text></Pressable>
          </View>

          <View style={{alignItems: 'center', gap: 11, paddingTop: 1}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DDF5FF', borderWidth: 1, borderColor: '#A9E7FF', borderRadius: 22, paddingVertical: 7, paddingHorizontal: 12}}>
              <Text style={{color: colors.blue, fontSize: 12, fontWeight: '700'}}>Listening in {listeningLanguage}</Text>
              {([{label: 'EN', value: 'en-IN' as const}, {label: 'हिंदी', value: 'hi-IN' as const}]).map(option => <Pressable key={option.value} onPress={() => { setSpeechLanguage(option.value); void SecureStore.setItemAsync('assistant_language', option.value); }} style={{paddingVertical: 4, paddingHorizontal: 9, borderRadius: 13, backgroundColor: speechLanguage === option.value ? colors.navy : 'transparent'}}><Text style={{fontSize: 11, fontWeight: '700', color: speechLanguage === option.value ? '#FFFFFF' : colors.navy}}>{option.label}</Text></Pressable>)}
            </View>
            {Platform.OS === 'android' ? <View style={{width: '100%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: backgroundListening ? '#A9E7D0' : '#DAE3F0', borderRadius: 19, padding: 13, gap: 8}}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <Text style={{fontSize: 14, fontWeight: '800', color: colors.navy}}>Saathi when the app is closed</Text>
                <View style={{width: 9, height: 9, borderRadius: 5, backgroundColor: backgroundListening ? colors.green : '#AEB9C8'}}/>
              </View>
              <Text style={{fontSize: 12, lineHeight: 17, color: colors.muted}}>{sampleWorkspace
                ? 'Background questions need a signed-in merchant session. Sign in with Google to enable this on your merchant data.'
                : backgroundListening
                  ? 'Background listening is on. Say “Saathi”, then ask your question. The microphone stays active until you stop it.'
                  : 'Turn this on once, then leave the app. Say “Saathi” followed by your question; the app will answer aloud.'}</Text>
              <Pressable onPress={() => void toggleBackgroundSaathi()} disabled={backgroundBusy || sampleWorkspace} accessibilityRole="button" style={{backgroundColor: sampleWorkspace ? '#9AA7B8' : backgroundListening ? '#FFF0F0' : colors.navy, borderRadius: 13, padding: 11, alignItems: 'center', opacity: backgroundBusy ? 0.65 : 1}}>
                <Text style={{fontSize: 13, fontWeight: '800', color: sampleWorkspace ? '#FFFFFF' : backgroundListening ? colors.red : '#FFFFFF'}}>{backgroundBusy ? 'Please wait…' : sampleWorkspace ? 'Sign in to enable background Saathi' : backgroundListening ? 'Stop background listening' : 'Enable background listening'}</Text>
              </Pressable>
              <Text style={{fontSize: 10, lineHeight: 15, color: colors.muted}}>Android keeps an ongoing microphone notification while listening. Offline speech recognition is preferred; Android may use its configured speech service if an offline language pack is unavailable. Force stopping the app or restarting the phone ends listening; enable it again from the app afterward.</Text>
            </View> : null}
            <View style={{height: 118, width: '100%', maxWidth: 310, alignItems: 'center', justifyContent: 'center'}}>
              <View pointerEvents="none" style={{position: 'absolute', width: 190, height: 112, borderRadius: 60, backgroundColor: 'rgba(0,186,242,0.08)', borderWidth: 1, borderColor: 'rgba(0,186,242,0.18)'}}/>
              <View pointerEvents="none" style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, position: 'absolute'}}>
                {[26, 44, 66, 38].map((height, index) => <View key={`left-${index}`} style={{width: 7, height: listening ? height + (index % 2 ? 9 : 0) : height * 0.65, borderRadius: 5, backgroundColor: index % 2 ? colors.navy : colors.cyan, opacity: 0.9}}/>)}
                <View style={{width: 92}}/>
                {[38, 66, 44, 26].map((height, index) => <View key={`right-${index}`} style={{width: 7, height: listening ? height + (index % 2 ? 0 : 9) : height * 0.65, borderRadius: 5, backgroundColor: index % 2 ? colors.cyan : colors.navy, opacity: 0.9}}/>)}
              </View>
              <Pressable onPress={() => listening ? ExpoSpeechRecognitionModule.stop() : void startVoice()} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Start listening'} style={{width: 78, height: 78, borderRadius: 42, backgroundColor: listening ? '#D84A4A' : '#E8FAFF', borderWidth: 3, borderColor: listening ? '#F4B5B5' : colors.blue, alignItems: 'center', justifyContent: 'center', elevation: 5}}>
                <Text style={{fontSize: 31, color: listening ? '#FFFFFF' : colors.cyan}}>{listening ? '■' : '🎙'}</Text>
              </Pressable>
            </View>
            <Text style={{fontSize: 16, fontWeight: '800', color: colors.blue}}>{listening ? 'Listening to your voice…' : busy ? 'Thinking about your business…' : 'Tap the mic to speak'}</Text>
          </View>

          <View style={{backgroundColor: '#F7F8FF', borderWidth: 1, borderColor: '#E5E9F4', borderRadius: 24, padding: 16, gap: 8}}>
            <Text style={{fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.blue}}>YOUR QUESTION</Text>
            <Controller control={control} name="question" render={({field: {onChange, onBlur, value}}) => <TextInput value={value} onChangeText={onChange} onBlur={onBlur} placeholder="Ask about sales or say ‘keep ₹500 pending from Mr Suresh’" multiline accessibilityLabel="Your business question" placeholderTextColor="#8290A5" style={{minHeight: 54, color: colors.ink, fontSize: 16, lineHeight: 23, textAlignVertical: 'top'}}/>}/>
            {formState.errors.question ? <Text style={{color: colors.red, fontSize: 12}}>{formState.errors.question.message}</Text> : null}
            <Pressable onPress={() => void handleSubmit(({question}) => submitQuestion(question))()} disabled={busy} style={{backgroundColor: colors.navy, borderRadius: 15, padding: 13, alignItems: 'center'}}><Text style={{color: '#FFFFFF', fontWeight: '800'}}>{busy ? 'Thinking…' : 'Ask business partner'}</Text></Pressable>
          </View>

          {pendingDraft ? <View style={{backgroundColor: '#EAF7FF', borderRadius: 22, borderWidth: 1, borderColor: '#9DDCFA', padding: 16, gap: 10}}>
            <Text style={{fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.blue}}>CONFIRM INTERNAL CUSTOMER DUE</Text>
            <Text style={{fontSize: 18, fontWeight: '800', color: colors.navy}}>{pendingDraft.customer_name} · ₹{Number(pendingDraft.amount).toLocaleString('en-IN', {minimumFractionDigits: 2})}</Text>
            <Text style={{fontSize: 12, lineHeight: 18, color: colors.muted}}>This creates a pending note in the merchant records. It does not send or record a Paytm payment.</Text>
            <Pressable disabled={savingDraft} onPress={() => void confirmReceivable()} style={{backgroundColor: colors.navy, borderRadius: 14, padding: 13, alignItems: 'center'}}><Text style={{color: '#FFFFFF', fontWeight: '800'}}>{savingDraft ? 'Saving…' : 'Confirm and save due'}</Text></Pressable>
            <Pressable disabled={savingDraft} onPress={() => setPendingDraft(null)} style={{borderRadius: 13, borderWidth: 1, borderColor: colors.border, padding: 11, alignItems: 'center'}}><Text style={{color: colors.navy, fontWeight: '700'}}>Cancel</Text></Pressable>
          </View> : null}
          {savedDraftMessage ? <View style={{backgroundColor: '#E5F7EF', borderRadius: 16, padding: 12}}><Text style={{fontWeight: '700', color: colors.green}}>{savedDraftMessage}</Text></View> : null}
          {error ? <View style={{backgroundColor: '#FDECEC', borderRadius: 14, padding: 12}}><Text style={{color: colors.red}}>{error}</Text></View> : null}
          {voiceError ? <Note>{voiceError}</Note> : null}

          {history.data?.length ? <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3}}><Text style={{fontSize: 17, fontWeight: '800', color: colors.navy}}>Conversation</Text><Pressable onPress={() => void newConversation()}><Text style={{fontSize: 12, fontWeight: '700', color: colors.blue}}>New chat</Text></Pressable></View> : null}
          {history.data?.map(message => <Card key={message.id} title={message.role === 'assistant' ? 'Business partner' : 'You'}>
            <Text style={{fontSize: 14, lineHeight: 21, color: colors.ink}}>{message.content}</Text>
            {message.role === 'assistant' ? <Pressable onPress={() => message.id === speakingMessageId ? stopSpeech() : void speakAnswer(message.content, message.id)} style={{alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9}}><Text style={{fontSize: 12, color: colors.blue, fontWeight: '700'}}>{message.id === speakingMessageId ? 'Stop speaking' : '🔊 Play reply'}</Text></Pressable> : null}
            {message.sources?.length ? <Text style={{fontSize: 10, color: colors.muted}}>Sources: {message.sources.join(', ')}</Text> : null}
          </Card>)}
          {busy ? <ActivityIndicator color={colors.blue}/> : null}
          {!sampleWorkspace && voiceOptions.length ? <View style={{gap: 8}}><Text style={{fontSize: 13, fontWeight: '700', color: colors.navy}}>Voice</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>{voiceOptions.slice(0, 12).map(voice => <Pressable key={voice.voice_id} onPress={() => { setVoiceId(voice.voice_id); void SecureStore.setItemAsync('elevenlabs_voice_id', voice.voice_id); }} style={{borderRadius: 18, borderWidth: 1, borderColor: voiceId === voice.voice_id ? colors.blue : colors.border, backgroundColor: voiceId === voice.voice_id ? '#EAF4FF' : colors.card, paddingHorizontal: 13, paddingVertical: 9}}><Text style={{fontSize: 12, fontWeight: '700', color: voiceId === voice.voice_id ? colors.blue : colors.navy}}>{voice.name}</Text></Pressable>)}</ScrollView></View> : null}
          <Pressable onPress={() => { setVoiceReplies(value => !value); if (voiceReplies) stopSpeech(); }} accessibilityRole="button" style={{alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 11, backgroundColor: '#FFFFFF'}}><Text style={{color: colors.navy, fontWeight: '700'}}>🔊 Spoken replies {voiceReplies ? 'on' : 'off'}</Text></Pressable>
          <Text style={{fontSize: 11, lineHeight: 16, color: colors.muted}}>{sampleWorkspace ? 'Sample mode uses fictional data and rule-based answers on this device.' : `Business questions use the configured backend model. Voice replies: ${speechLoading ? 'preparing audio…' : activeVoice?.name ?? 'Android voice fallback'}.`}</Text>
          <Text style={{fontSize: 11, lineHeight: 17, color: colors.muted}}>Try asking</Text>
          <View style={{gap: 7}}>{(speechLanguage === 'hi-IN' ? hindiQuestions : [...englishQuestions, 'Keep ₹500 pending from Mr Suresh']).map(question => <Pressable key={question} onPress={() => { setValue('question', question, {shouldDirty: true}); void submitQuestion(question); }} style={{borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11}}><Text style={{fontSize: 12, color: colors.navy}}>✦  {question}</Text></Pressable>)}</View>
        </ScrollView>
        <Pressable onPress={() => listening ? ExpoSpeechRecognitionModule.stop() : close()} style={{marginHorizontal: 20, marginTop: 8, borderRadius: 20, backgroundColor: colors.navy, padding: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 9}}>
          <Text style={{color: colors.cyan, fontSize: 18}}>{listening ? '■' : '✓'}</Text><Text style={{color: '#FFFFFF', fontWeight: '800', fontSize: 15}}>{listening ? 'Tap when done · पूरा करें' : 'Close assistant'}</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}
