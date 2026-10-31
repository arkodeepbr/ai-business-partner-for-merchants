import {Card, Note, Screen} from '@/components/Screen';
import {Alert, Pressable, Text, View} from 'react-native';
import {Link, router} from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import {colors} from '@/theme/tokens';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {api} from '@/services/api';
import {useSampleWorkspace} from '@/hooks/useSampleWorkspace';
import {stopBackgroundSaathi} from '@/services/saathi';

type Capability = {key: string; purpose: string; status: string; prerequisite: string};

export default function Profile() {
  const sampleWorkspace = useSampleWorkspace();
  const queryClient = useQueryClient();

  async function signOut() {
    await stopBackgroundSaathi().catch(() => {});
    await GoogleSignin.signOut().catch(() => {});
    queryClient.clear();
    await SecureStore.deleteItemAsync('session_token');
    await SecureStore.deleteItemAsync('conversation_id');
    router.replace('/');
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete merchant account?',
      'This permanently deletes the merchant workspace and its transactions, pending dues, inventory, customers, and assistant history from the connected database. This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Delete account', style: 'destructive', onPress: () => { void deleteAccount(); }},
      ],
    );
  }

  async function deleteAccount() {
    try {
      await api<{deleted: boolean}>('/account', {method: 'DELETE', body: JSON.stringify({confirm: true})});
      await stopBackgroundSaathi().catch(() => {});
      await GoogleSignin.signOut().catch(() => {});
      queryClient.clear();
      await SecureStore.deleteItemAsync('session_token');
      await SecureStore.deleteItemAsync('conversation_id');
      router.replace('/');
    } catch (error) {
      Alert.alert('Account not deleted', error instanceof Error ? error.message : 'The merchant account could not be deleted.');
    }
  }

  return <Screen title="Business profile" subtitle="Workspace, services and security">
    <View style={{backgroundColor: colors.navy, borderRadius: 24, padding: 19, gap: 7}}>
      <Text style={{color: '#B9E9FF', fontSize: 12, fontWeight: '800', letterSpacing: 0.7}}>PAYTM AI BUSINESS PARTNER</Text>
      <Text style={{color: '#FFFFFF', fontSize: 20, fontWeight: '800'}}>{sampleWorkspace ? 'Fictional sample workspace' : 'Merchant workspace'}</Text>
      <Text style={{color: '#D5E8FA', fontSize: 13, lineHeight: 19}}>{sampleWorkspace ? 'Local sample records · no Paytm account connected' : 'Signed in with Google · merchant data served by the authenticated API'}</Text>
    </View>
    <Card title="BUSINESS TOOLS">
      <Note>Open transactions, inventory, customers, campaigns, approvals, and other merchant tools.</Note>
      <Link href="/tools" asChild><Pressable accessibilityRole="button" style={{backgroundColor: '#EAF4FF', padding: 12, borderRadius: 10, alignItems: 'center'}}><Text style={{fontWeight: '700', color: colors.blue}}>Open business tools</Text></Pressable></Link>
    </Card>
    <Card title="Merchant account"><Note>{sampleWorkspace
      ? 'You are exploring an offline sample shop. Its transaction history comes from the bundled fictional CSV; no merchant account or Paytm data is connected.'
      : 'This workspace was opened with Google sign-in. Its merchant records come from the authenticated backend.'}</Note></Card>
    <Card title="Paytm API connection"><Note>{sampleWorkspace
      ? 'Paytm access is unavailable, so this workspace uses fictional sample transactions. The Paytm connection option remains here for later. Once authorized API access is available, credentials must be configured on the backend, never entered into or stored by this app.'
      : 'Paytm transaction and settlement sync is not connected. Once authorized API access is available, credentials must be configured on the backend, never entered into or stored by this app.'}</Note>
      <Link href={{pathname: '/tools/[module]', params: {module: 'imports'}}} asChild><Pressable accessibilityRole="button" style={{backgroundColor: '#EAF4FF', padding: 12, borderRadius: 10, alignItems: 'center'}}>
        <Text style={{fontWeight: '700', color: colors.blue}}>Import an authorized transaction CSV</Text>
      </Pressable></Link>
    </Card>
    <Card title="Privacy and security"><Note>{sampleWorkspace
      ? 'This workspace contains fictional records and has no Paytm connection. Voice recognition uses the Android speech service configured on this device.'
      : 'Merchant records are loaded through authenticated backend APIs. The local Ollama model is designed to analyze a bounded merchant data snapshot on the backend host. ElevenLabs receives reply text only when you request spoken playback and it is configured.'}</Note></Card>
    <Card title="Language & accessibility"><Note>English and Hindi voice questions use Android speech recognition. Spoken replies use your selected ElevenLabs voice when configured, with Android text-to-speech as fallback.</Note></Card>
    <ProviderStatus/>
    <Pressable onPress={signOut} accessibilityRole="button" style={{padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#F0CACA', backgroundColor: '#FFF8F8', alignItems: 'center'}}><Text style={{fontWeight: '800', color: colors.red}}>Log out</Text></Pressable>
    {!sampleWorkspace ? <Pressable onPress={confirmDeleteAccount} accessibilityRole="button" style={{padding: 15, borderRadius: 16, borderWidth: 1, borderColor: colors.red, alignItems: 'center'}}><Text style={{fontWeight: '800', color: colors.red}}>Delete merchant account</Text></Pressable> : null}
  </Screen>;
}

function ProviderStatus() {
  const query = useQuery({queryKey: ['integrations'], queryFn: () => api<Capability[]>('/integrations/status')});
  return <Card title="CONNECTED SERVICES">{query.isLoading ? <Note>Loading service status…</Note> : query.isError ? <Note>{query.error.message}</Note> : query.data?.map(item => <Text key={item.key} style={{fontSize: 12, color: colors.ink, lineHeight: 18}}>{item.purpose}: {item.status.replaceAll('_', ' ')}. {item.status === 'not_configured' || item.status === 'disabled' ? item.prerequisite : ''}</Text>)}</Card>;
}
