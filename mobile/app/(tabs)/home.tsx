import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Card, Note, Screen } from '@/components/Screen';
import { api } from '@/services/api';
import { colors } from '@/theme/tokens';
import { useSampleWorkspace } from '@/hooks/useSampleWorkspace';

export type Transaction = {id: string; external_id?: string | null; amount: string; status: string; payment_method: string; occurred_at: string; source?: string; sender_name?: string | null; sender_reference?: string | null; sender_contact?: string | null};
type Briefing = {insights: Array<{kind: string; text: string}>; data_available: boolean; source: string; collections: string; successful_transactions: number; collections_are_not_profit: boolean};
const prompts = [
  {label: 'आज कितनी कमाई हुई?', question: "How much did I collect today?"},
  {label: 'Who owes me money?', question: 'Who owes me money?'},
  {label: "Show today's total", question: "Show today's total"},
];

export default function Home() {
  const sampleWorkspace = useSampleWorkspace();
  const [briefLanguage, setBriefLanguage] = useState<'en' | 'hi'>('en');
  useEffect(() => {
    SecureStore.getItemAsync('assistant_language').then(value => {
      if (value === 'hi-IN') setBriefLanguage('hi');
    }).catch(() => {});
  }, []);
  const transactions = useQuery({queryKey: ['transactions', 6], queryFn: () => api<Transaction[]>('/transactions?limit=6')});
  const briefing = useQuery({queryKey: ['daily-briefing', briefLanguage], queryFn: () => api<Briefing>(`/dashboard/briefing?language=${briefLanguage}`)});
  const total = briefing.data ? money(briefing.data.collections) : '—';
  return <Screen title="Paytm AI Business" subtitle="Your merchant workspace">
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2}}>
      <View style={{flex: 1}}>
        <Text style={{fontSize: 13, color: colors.muted}}>MERCHANT WORKSPACE</Text>
        <Text style={{fontSize: 18, fontWeight: '700', color: colors.navy}}>Store overview</Text>
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <Link href="/assistant" asChild><Pressable accessibilityRole="button" accessibilityLabel="Open voice assistant" style={{backgroundColor: '#EAF4FF', borderWidth: 1, borderColor: '#D6E8FB', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7}}><Text style={{fontSize: 12, fontWeight: '700', color: colors.blue}}>Voice assistant</Text></Pressable></Link>
        <Link href="/profile" asChild><Pressable accessibilityRole="button" accessibilityLabel="Open workspace settings" style={{width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border}}><Text style={{fontSize: 18, color: colors.navy}}>⚙</Text></Pressable></Link>
      </View>
    </View>

    <View style={{backgroundColor: colors.navy, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#164A88', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: {width: 0, height: 9}, elevation: 5}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <View style={{flex: 1}}>
          <Text style={{fontSize: 13, fontWeight: '700', color: '#B9E9FF'}}>Today's money received</Text>
          <Text style={{fontSize: 34, fontWeight: '800', color: '#FFFFFF', marginTop: 5}}>₹{total}</Text>
        </View>
        <View style={{width: 42, height: 42, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,186,242,0.18)', borderWidth: 1, borderColor: 'rgba(128,225,255,0.35)'}}>
          <Text style={{fontSize: 22, color: colors.cyan}}>₹</Text>
        </View>
      </View>
      {briefing.isLoading ? <ActivityIndicator color={colors.cyan} /> : briefing.isError ? <Text style={{color: '#FFD4D4'}}>{briefing.error.message}</Text> : <View style={{borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 11}}>
        <Text style={{fontSize: 13, color: '#E3F5FF'}}>{briefing.data?.successful_transactions ?? 0} successful payments today · {sampleWorkspace ? 'sample CSV records' : briefing.data?.data_available ? 'connected records' : 'no records yet'}</Text>
        <Text style={{fontSize: 11, color: '#AFC2D8', marginTop: 4}}>{sampleWorkspace ? 'Fictional sample records' : 'Collections are not profit.'}</Text>
      </View>}
    </View>

    <Card title={briefLanguage === 'hi' ? 'आज का व्यापार सार' : 'Daily business briefing'}>
      {briefing.isLoading ? <ActivityIndicator color={colors.blue} /> : briefing.isError ? <Note>{briefing.error.message}</Note> : <View style={{gap: 8}}>
        {briefing.data?.insights.map((insight, index) => <Text key={`${insight.kind}-${index}`} style={{fontSize: 13, lineHeight: 19, color: colors.ink}}>• {insight.text}</Text>)}
        <Text style={{fontSize: 10, color: colors.muted}}>{briefing.data?.source} · {briefing.data?.collections_are_not_profit ? 'Collections are not profit.' : ''}</Text>
      </View>}
    </Card>

    <View style={{alignItems: 'center', paddingTop: 6, paddingBottom: 5}}>
        <Link href={{pathname: '/assistant', params: {autostart: 'true'}}} asChild><Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel="Start voice conversation with your AI business partner" style={{width: 126, height: 126, alignItems: 'center', justifyContent: 'center', borderRadius: 64, backgroundColor: '#DDF5FF', borderWidth: 1, borderColor: '#B8E7FA'}}>
        <View pointerEvents="none" style={{width: 92, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 48, backgroundColor: colors.cyan, borderWidth: 5, borderColor: '#FFFFFF', elevation: 7, shadowColor: colors.blue, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: {width: 0, height: 6}}}>
          <Text pointerEvents="none" style={{fontSize: 38, color: '#FFFFFF'}}>🎙</Text>
        </View>
        </Pressable></Link>
      <Text style={{fontSize: 18, fontWeight: '800', color: colors.navy, textAlign: 'center', marginTop: 11}}>Talk to your AI business partner</Text>
      <Text style={{fontSize: 13, color: colors.muted, marginTop: 4, textAlign: 'center'}}>Ask in English or Hindi</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14}}>
        {prompts.map(prompt => <Link key={prompt.question} href={{pathname: '/assistant', params: {question: prompt.question}}} asChild><Pressable style={{backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, shadowColor: colors.navy, shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: {width: 0, height: 2}, elevation: 1}}>
          <Text style={{fontSize: 12, fontWeight: '600', color: colors.navy}}>{prompt.label}</Text>
        </Pressable></Link>)}
      </View>
    </View>

    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2}}>
      <Text style={{fontSize: 18, fontWeight: '800', color: colors.navy}}>Recent payments</Text>
      <Link href="/wallet" asChild><Pressable accessibilityRole="button"><Text style={{fontSize: 13, color: colors.blue, fontWeight: '700'}}>View all</Text></Pressable></Link>
    </View>
    {transactions.isLoading ? <ActivityIndicator color={colors.blue} /> : transactions.isError ? <Card title="Payment records"><Note>{transactions.error.message}</Note></Card> : transactions.data?.length ? transactions.data.slice(0, 4).map(tx => <TransactionRow key={tx.id} transaction={tx} />) : <Card title="No payment records"><Note>Connected payment activity will appear here when available.</Note></Card>}
  </Screen>;
}

export function TransactionRow({transaction}: {transaction: Transaction}) {
  const refunded = transaction.status === 'refunded';
  return <Link href={{pathname: '/transactions/[id]', params: {id: transaction.id}}} asChild><Pressable accessibilityRole="button" accessibilityLabel={`Open payment details for ${transaction.external_id ?? transaction.id}`} style={{backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12}}>
    <View style={{width: 40, height: 40, borderRadius: 20, backgroundColor: '#E6F3FA', alignItems: 'center', justifyContent: 'center'}}><Text style={{fontSize: 19, color: colors.blue}}>{transaction.payment_method?.toLowerCase().includes('card') ? '▣' : '↗'}</Text></View>
    <View style={{flex: 1}}>
      <Text style={{fontSize: 15, fontWeight: '700', color: colors.navy}}>{refunded ? '−' : '+'}₹{money(transaction.amount)}</Text>
      <Text style={{fontSize: 12, color: colors.muted, marginTop: 3}}>{transaction.payment_method || 'Payment'} · {new Date(transaction.occurred_at).toLocaleString([], {hour: 'numeric', minute: '2-digit'})}</Text>
    </View>
    <Text style={{fontSize: 17, color: refunded ? colors.amber : colors.green}}>{refunded ? '↩' : '✓'}</Text>
  </Pressable></Link>;
}

export function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00';
}
