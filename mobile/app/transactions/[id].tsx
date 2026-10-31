import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Card, Note, Screen } from '@/components/Screen';
import { api } from '@/services/api';
import { colors } from '@/theme/tokens';
import { money, type Transaction } from '../(tabs)/home';

export default function TransactionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const transaction = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api<Transaction>(`/transactions/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  const row = transaction.data;

  return <Screen title="Payment details" subtitle="Transaction and sender information">
    <Pressable onPress={() => router.back()} accessibilityRole="button" style={{alignSelf: 'flex-start', paddingVertical: 5}}>
      <Text style={{fontSize: 14, fontWeight: '700', color: colors.blue}}>← Back to payment history</Text>
    </Pressable>
    {transaction.isLoading ? <ActivityIndicator color={colors.blue} /> : transaction.isError ? <Card title="Payment unavailable"><Note>{transaction.error.message}</Note></Card> : row ? <>
      <View style={{backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 20, gap: 7, alignItems: 'center'}}>
        <Text style={{fontSize: 13, color: colors.muted, textTransform: 'capitalize'}}>{row.status.replaceAll('_', ' ')}</Text>
        <Text style={{fontSize: 34, fontWeight: '800', color: colors.navy}}>₹{money(row.amount)}</Text>
        <Text style={{fontSize: 13, color: colors.muted}}>{row.payment_method || 'Payment method unavailable'}</Text>
      </View>
      <Card title="PAYMENT">
        <Detail label="Transaction ID" value={row.external_id || row.id} />
        <Detail label="Date and time" value={formatDate(row.occurred_at)} />
        <Detail label="Payment method" value={row.payment_method || 'Not provided'} />
        <Detail label="Status" value={row.status.replaceAll('_', ' ')} />
        <Detail label="Data source" value={sourceLabel(row.source)} />
      </Card>
      <Card title="SENDER">
        {row.sender_name || row.sender_reference || row.sender_contact ? <>
          <Detail label="Name" value={row.sender_name || 'Not provided'} />
          <Detail label="Reference" value={row.sender_reference || 'Not provided'} />
          <Detail label="Contact" value={row.sender_contact || 'Not provided'} />
          {row.source === 'sample_data' ? <Note>Fictional sender information from the sample CSV.</Note> : null}
        </> : <Note>This record does not contain sender details. If the merchant-authorized source provides them, include sender_name, sender_reference, or sender_contact in its CSV.</Note>}
      </Card>
    </> : <Card title="Payment not found"><Note>This transaction is not available in the current workspace.</Note></Card>}
  </Screen>;
}

function Detail({label, value}: {label: string; value: string}) {
  return <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9}}>
    <Text style={{fontSize: 12, color: colors.muted, flex: 1}}>{label}</Text>
    <Text selectable style={{fontSize: 12, color: colors.ink, fontWeight: '600', flex: 2, textAlign: 'right'}}>{value}</Text>
  </View>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
}

function sourceLabel(source?: string) {
  if (!source) return 'Not provided';
  if (source === 'sample_data') return 'Fictional sample CSV';
  if (source === 'merchant_import') return 'Merchant-authorized CSV import';
  return source.replaceAll('_', ' ');
}
