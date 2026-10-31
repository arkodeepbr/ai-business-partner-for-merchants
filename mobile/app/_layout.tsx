import { Stack, usePathname, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Component, useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';
import '@/i18n';

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

export default function RootLayout() {
  return <SafeAreaProvider><QueryClientProvider client={client}><RootErrorBoundary><StatusBar style="auto" /><SessionGate><Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="assistant" options={{
      presentation: 'transparentModal',
      animation: 'slide_from_bottom',
      contentStyle: {backgroundColor: 'transparent'},
      gestureEnabled: true,
      gestureDirection: 'vertical',
      statusBarTranslucent: true,
      navigationBarTranslucent: true,
    }} />
  </Stack></SessionGate></RootErrorBoundary></QueryClientProvider></SafeAreaProvider>;
}

function SessionGate({children}:PropsWithChildren){
 const pathname=usePathname();const router=useRouter();const [checked,setChecked]=useState(false);
 useEffect(()=>{let active=true;void SecureStore.getItemAsync('session_token').then(token=>{
  if(!active)return;
  if(pathname!=='/'&&!token)router.replace('/');
  else if(pathname==='/'&&token)router.replace('/(tabs)/home');
  setChecked(true);
 }).catch(()=>{if(active){if(pathname!=='/')router.replace('/');setChecked(true);}});
 return()=>{active=false;};},[pathname,router]);
 if(!checked)return <View style={{flex:1,justifyContent:'center',alignItems:'center',gap:12,backgroundColor:colors.bg}}><ActivityIndicator color={colors.blue}/><Text style={{color:colors.muted,fontSize:14}}>Opening Business Partner…</Text></View>;
 return <>{children}</>;
}

class RootErrorBoundary extends Component<PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <View style={{flex:1,justifyContent:'center',padding:24,gap:16,backgroundColor:colors.bg}}>
        <Text style={{fontSize:26,fontWeight:'700',color:colors.navy}}>Business Partner couldn’t open</Text>
        <Text style={{fontSize:15,lineHeight:22,color:colors.muted}}>{this.state.error.message || 'The app hit a startup error.'}</Text>
        <Pressable onPress={()=>this.setState({error:null})} style={{backgroundColor:colors.blue,padding:16,borderRadius:12,alignItems:'center'}}><Text style={{color:'white',fontWeight:'700'}}>Try again</Text></Pressable>
      </View>;
    }
    return this.props.children;
  }
}
