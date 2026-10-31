import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { api, establishLocalWorkspace } from '@/services/api';
import { enterDemoWorkspace, isDemoBuild } from '@/services/demo';
import { colors } from '@/theme/tokens';

export default function Index() {
  const [ready, setReady] = useState(false); const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { SecureStore.getItemAsync('session_token').then(token => { setHasSession(Boolean(token)); setReady(true); }).catch(() => setReady(true)); }, []);
  if (!ready) return <View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={colors.blue}/></View>;
  if (hasSession) return <Redirect href="/(tabs)/home"/>;
  async function googleSignIn() {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!webClientId) { setError('Google sign-in needs the Google Web OAuth client ID in mobile/.env and GOOGLE_OAUTH_CLIENT_ID in the backend environment.'); return; }
    setBusy(true); setError('');
    try {
      GoogleSignin.configure({webClientId});
      await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;
      if (!response.data.idToken) throw new Error('Google did not return an identity token. Check the Web OAuth client ID and Android SHA-1 configuration.');
      const session = await api<{access_token: string}>('/auth/google', {method: 'POST', body: JSON.stringify({id_token: response.data.idToken})});
      await SecureStore.setItemAsync('session_token', session.access_token);
      setHasSession(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in could not be completed.');
    } finally { setBusy(false); }
  }
  async function openDemo() { setBusy(true); setError(''); try { await enterDemoWorkspace(); setHasSession(true); } catch (e) { setError(e instanceof Error?e.message:'Could not open the sample workspace.'); } finally { setBusy(false); } }
  async function openLocalAiWorkspace() {
    setBusy(true); setError('');
    try { await establishLocalWorkspace('Local AI Merchant'); setHasSession(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not connect to the local AI workspace.'); }
    finally { setBusy(false); }
  }
  return <ScrollView style={{flex:1,backgroundColor:colors.bg}} contentContainerStyle={{flexGrow:1,justifyContent:'center',paddingHorizontal:23,paddingTop:28,paddingBottom:30,gap:17}}>
    <View style={{alignItems:'center',gap:10,marginBottom:3}}>
      <View style={{width:90,height:90,borderRadius:25,backgroundColor:colors.navy,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#164A88',shadowColor:colors.navy,shadowOpacity:0.18,shadowRadius:15,shadowOffset:{width:0,height:7},elevation:5}}>
        <Image source={require('../assets/icon.png')} resizeMode="contain" style={{width:67,height:67}} />
      </View>
      <Text style={{fontSize:31,fontWeight:'800',color:colors.navy,textAlign:'center',lineHeight:38}}>Paytm AI Business Partner</Text>
      <Text style={{fontSize:15,color:colors.muted,lineHeight:22,textAlign:'center'}}>Your merchant workspace and business assistant.</Text>
    </View>
    <View style={{backgroundColor:'#FFFFFF',borderRadius:24,padding:18,borderWidth:1,borderColor:'#E6ECF4',gap:14,shadowColor:colors.navy,shadowOpacity:0.05,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:2}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:11}}><View style={{width:43,height:43,borderRadius:16,backgroundColor:'#DDF5FF',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:20,color:colors.blue}}>✦</Text></View><View style={{flex:1}}><Text style={{fontSize:16,fontWeight:'800',color:colors.navy}}>Made for merchant work</Text><Text style={{fontSize:12,color:colors.muted,marginTop:2}}>Payments, insights and voice in one place</Text></View></View>
      <View style={{height:1,backgroundColor:colors.border}}/>
      {['Review transaction history and sender details','Explore recorded sales and settlement trends','Ask questions in English or Hindi'].map(feature=><View key={feature} style={{flexDirection:'row',alignItems:'center',gap:10}}><Text style={{width:23,height:23,textAlign:'center',textAlignVertical:'center',borderRadius:13,overflow:'hidden',color:colors.blue,backgroundColor:'#E3F5FF',fontWeight:'800'}}>✓</Text><Text style={{flex:1,color:colors.ink,fontSize:13,lineHeight:19}}>{feature}</Text></View>)}
    </View>
    <View style={{gap:10,marginTop:2}}>
      <Pressable disabled={busy} onPress={googleSignIn} accessibilityRole="button" style={{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:colors.border,padding:16,borderRadius:17,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:10,elevation:2}}>
        {busy ? <ActivityIndicator color={colors.blue}/> : <Text style={{fontSize:18,fontWeight:'800',color:colors.blue}}>G</Text>}
        <Text style={{color:colors.navy,fontWeight:'800'}}>{busy?'Signing in…':'Continue with Google'}</Text>
      </Pressable>
      {!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ? <Text style={{fontSize:11,color:colors.muted,lineHeight:16,textAlign:'center'}}>Google sign-in needs your OAuth Web client ID and the Android app fingerprint configured in Google Cloud.</Text> : null}
      {process.env.EXPO_PUBLIC_LOCAL_BOOTSTRAP === 'true' ? <Pressable disabled={busy} onPress={openLocalAiWorkspace} accessibilityRole="button" style={{backgroundColor:colors.navy,padding:16,borderRadius:17,alignItems:'center',gap:4,elevation:2}}>
        <Text style={{color:'#FFFFFF',fontWeight:'800'}}>{busy ? 'Connecting…' : 'Connect to local AI workspace'}</Text>
        <Text style={{color:'#D5E8FA',fontSize:11}}>Private Qwen3 model running on this computer</Text>
      </Pressable> : null}
    </View>
    <View style={{height:1,backgroundColor:colors.border,marginVertical:1}}/>
    <View style={{backgroundColor:'#FFF9E8',borderWidth:1,borderColor:'#F1E3B7',padding:15,borderRadius:18,gap:6}}>
      <Text style={{fontSize:12,fontWeight:'800',color:colors.amber}}>{isDemoBuild ? 'OFFLINE SAMPLE WORKSPACE' : 'PRESENTATION DATA'}</Text>
      <Text style={{fontSize:12,color:colors.muted,lineHeight:18}}>Explore the app with fictional CSV records. The sample workspace sends no payments and connects no Paytm account.</Text>
      <Pressable disabled={busy} onPress={openDemo} style={{backgroundColor:colors.navy,padding:14,borderRadius:14,alignItems:'center',marginTop:3}}><Text style={{color:'white',fontWeight:'800'}}>{busy?'Opening…':isDemoBuild?'Explore sample workspace':'Open presentation sample'}</Text></Pressable>
    </View>
    {error?<Text style={{color:colors.red,fontSize:13}}>{error}</Text>:null}
    <Text style={{fontSize:11,color:colors.muted,textAlign:'center'}}>Your merchant login uses Google. This app does not ask for your Paytm password.</Text>
  </ScrollView>;
}
