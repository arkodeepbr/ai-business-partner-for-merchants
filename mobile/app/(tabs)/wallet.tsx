import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Card, Note, Screen } from '@/components/Screen';
import { api, Sales } from '@/services/api';
import { colors } from '@/theme/tokens';
import { useSampleWorkspace } from '@/hooks/useSampleWorkspace';
import { money, TransactionRow } from './home';

type Transaction = {id: string; external_id?: string | null; amount: string; status: string; payment_method: string; occurred_at: string; source?: string; sender_name?: string | null; sender_reference?: string | null; sender_contact?: string | null};
type Settlement = {id: string; amount: string; status: string; expected_at: string; settled_at: string | null};
type Receivable = {id: string; customer_name: string; amount: string; status: string; created_at: string};
const periods = [{days: 1, label: 'Today'}, {days: 7, label: '7 days'}, {days: 30, label: '30 days'}];

export default function Wallet() {
  const sampleWorkspace = useSampleWorkspace();
  const [days, setDays] = useState(7);
  const sales = useQuery({queryKey: ['sales', days], queryFn: () => api<Sales>(`/dashboard/sales?days=${days}`)});
  const transactions = useQuery({queryKey: ['transactions', 100], queryFn: () => api<Transaction[]>('/transactions?limit=100')});
  const settlements = useQuery({queryKey: ['settlements'], queryFn: () => api<Settlement[]>('/cashflow/settlements')});
  const receivables = useQuery({queryKey: ['receivables', 'pending'], queryFn: () => api<Receivable[]>('/receivables?status=pending&limit=100')});
  const summary = sales.data;
  return <Screen title="Wallet & Cash Flow" subtitle={sampleWorkspace ? 'Collections and settlement status · sample records' : 'Collections and settlement status'}>
    <View style={{flexDirection: 'row', gap: 8, backgroundColor: '#E8EDF5', padding: 5, borderRadius: 14}}>
      {periods.map(period => <Pressable key={period.days} onPress={() => setDays(period.days)} style={{flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 10, backgroundColor: days === period.days ? '#FFFFFF' : 'transparent'}}><Text style={{fontWeight: '700', color: days === period.days ? colors.blue : colors.muted}}>{period.label}</Text></Pressable>)}
    </View>
    <View style={{backgroundColor: '#EAF4FF', borderRadius: 20, padding: 19, borderWidth: 1, borderColor: '#D6E8FB', gap: 14}}>
      <Text style={{fontSize: 13, fontWeight: '700', color: colors.blue}}>COLLECTIONS AFTER RECORDED REFUNDS</Text>
      {sales.isLoading ? <ActivityIndicator color={colors.blue} /> : sales.isError ? <Note>{sales.error.message}</Note> : <>
        <Text style={{fontSize: 32, fontWeight: '800', color: colors.navy}}>₹{money((Number(summary?.collection_total ?? 0) - Number(summary?.refunds_total ?? 0)).toFixed(2))}</Text>
        <Text style={{fontSize: 13, color: colors.muted}}>₹{money(summary?.collection_total ?? '0')} collected − ₹{money(summary?.refunds_total ?? '0')} refunded</Text>
      </>}
      <View style={{borderTopWidth: 1, borderTopColor: '#CFDDED', paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between'}}>
        <View><Text style={{fontSize: 11, color: colors.muted}}>PAYMENTS</Text><Text style={{fontWeight: '700', color: colors.navy, marginTop: 3}}>{summary?.successful_transactions ?? '—'}</Text></View>
        <View style={{alignItems: 'flex-end'}}><Text style={{fontSize: 11, color: colors.muted}}>PENDING SETTLEMENT</Text><Text style={{fontWeight: '700', color: colors.navy, marginTop: 3}}>₹{money(summary?.pending_settlements ?? '0')}</Text></View>
      </View>
    </View>

    <Card title="Settlement status">
      {settlements.isLoading ? <ActivityIndicator color={colors.blue} /> : settlements.isError ? <Note>{settlements.error.message}</Note> : settlements.data?.length ? settlements.data.slice(0, 4).map(item => <View key={item.id} style={{flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10}}>
        <View><Text style={{fontWeight: '700', color: colors.navy}}>₹{money(item.amount)}</Text><Text style={{fontSize: 12, color: colors.muted, marginTop: 3}}>{item.status === 'pending' ? `Expected ${new Date(item.expected_at).toLocaleDateString()}` : `Settled ${item.settled_at ? new Date(item.settled_at).toLocaleDateString() : ''}`}</Text></View>
        <Text style={{color: item.status === 'pending' ? colors.amber : colors.green, fontWeight: '700', textTransform: 'capitalize'}}>{item.status}</Text>
      </View>) : <Note>No settlement records are available.</Note>}
    </Card>

    <Card title="Customer dues recorded">
      <Note>These are internal notes you confirm in the assistant. They are separate from Paytm payments and settlements.</Note>
      {receivables.isLoading ? <ActivityIndicator color={colors.blue}/> : receivables.isError ? <Note>{receivables.error.message}</Note> : receivables.data?.length ? receivables.data.slice(0, 8).map(item => <View key={item.id} style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 10}}>
        <View style={{flex: 1}}><Text style={{fontWeight: '700', color: colors.navy}}>{item.customer_name}</Text><Text style={{fontSize: 11, color: colors.muted, marginTop: 3}}>Recorded {new Date(item.created_at).toLocaleDateString()}</Text></View>
        <Text style={{fontWeight: '800', color: colors.blue}}>₹{money(item.amount)}</Text>
      </View>) : <Note>No customer dues have been recorded.</Note>}
      <Link href={{pathname: '/assistant', params: {autostart: 'true'}}} asChild><Pressable accessibilityRole="button" style={{backgroundColor: '#E4F6FE', padding: 12, borderRadius: 14, alignItems: 'center'}}><Text style={{fontWeight: '800', color: colors.navy}}>Add a due by voice</Text></Pressable></Link>
    </Card>

    <Text style={{fontSize: 18, fontWeight: '800', color: colors.navy}}>Payment history</Text>
    {transactions.isLoading ? <ActivityIndicator color={colors.blue} /> : transactions.isError ? <Card title="Payment records"><Note>{transactions.error.message}</Note></Card> : transactions.data?.length ? transactions.data.slice(0, 12).map(tx => <TransactionRow key={tx.id} transaction={tx} />) : <Card title="No payment history"><Note>Transactions from connected sources will appear here.</Note></Card>}
    <Note>Collections minus refunds is not profit. Pending settlements reflect recorded provider status, not a guaranteed arrival time.</Note>
  </Screen>;
}
