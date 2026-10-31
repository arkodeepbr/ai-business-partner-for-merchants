import { Fragment, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Card, Note, Screen } from '@/components/Screen';
import { api } from '@/services/api';
import type { components } from '@/api/schema.generated';
import { colors } from '@/theme/tokens';
import { useSampleWorkspace } from '@/hooks/useSampleWorkspace';
import { money } from './home';

type Period = 'day' | 'week' | 'month';
type Timeline = components['schemas']['SalesTimeline'];
type Peak = {period_days: number; hours: Array<{hour: number; successful_transactions: number}>; source: string};
type Comparison = {current_days: number; current_collections: string; previous_collections: string; change_percent: string | null; comparison_available: boolean; metric: string};
type Settlement = {amount: string; status: string};
type Anomalies = {available: boolean; reason?: string; alerts: Array<{type: string; priority: string; change_percent: string; action: string}>};

const periodOptions: Array<{key: Period; label: string; days: number}> = [
  {key: 'day', label: 'Daily', days: 1},
  {key: 'week', label: 'Weekly', days: 7},
  {key: 'month', label: 'Monthly', days: 30},
];

export default function Analytics() {
  const sampleWorkspace = useSampleWorkspace();
  const [period, setPeriod] = useState<Period>('day');
  const selected = periodOptions.find(item => item.key === period)!;
  const timeline = useQuery({queryKey: ['sales-timeline', period], queryFn: () => api<Timeline>(`/analytics/timeline?period=${period}`), refetchInterval: 60_000});
  const settlements = useQuery({queryKey: ['cashflow-settlements'], queryFn: () => api<Settlement[]>('/cashflow/settlements'), refetchInterval: 60_000});
  const peaks = useQuery({queryKey: ['peak-hours', selected.days], queryFn: () => api<Peak>(`/analytics/peak-hours?days=${selected.days}`)});
  const comparison = useQuery({queryKey: ['sales-comparison', selected.days], queryFn: () => api<Comparison>(`/analytics/period-comparison?days=${selected.days}`)});
  const alerts = useQuery({queryKey: ['sales-anomalies'], queryFn: () => api<Anomalies>('/analytics/anomalies')});
  const pending = settlements.data?.filter(row => row.status === 'pending').reduce((sum, row) => sum + Number(row.amount), 0) ?? null;
  const peak = peaks.data?.hours.reduce<Peak['hours'][number] | null>((best, row) => !best || row.successful_transactions > best.successful_transactions ? row : best, null) ?? null;
  const change = comparison.data?.comparison_available && comparison.data.change_percent !== null
    ? Number(comparison.data.change_percent) : null;

  return <Screen title="Business Analytics & Graphs" subtitle={sampleWorkspace ? 'Insights from fictional sample records' : 'Insights from connected transaction records'}>
    <View style={{backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 14, gap: 13}}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
        <View style={{flex: 1}}>
          <Text style={{fontSize: 12, fontWeight: '700', color: colors.navy}}>MERCHANT WORKSPACE</Text>
          <Text style={{fontSize: 11, color: colors.muted, marginTop: 3}}>India time · {timeline.data?.as_of ? new Date(timeline.data.as_of).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : 'Waiting for records'}</Text>
        </View>
        <View style={{backgroundColor: sampleWorkspace ? '#FFF4D6' : '#E8F6EF', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6}}>
          <Text style={{fontSize: 10, fontWeight: '800', color: sampleWorkspace ? colors.amber : colors.green}}>{sampleWorkspace ? 'SAMPLE' : 'UPDATED'}</Text>
        </View>
      </View>
      <View accessibilityRole="tablist" style={{flexDirection: 'row', backgroundColor: '#F0F3FF', borderRadius: 12, padding: 4}}>
        {periodOptions.map(option => <Pressable key={option.key} accessibilityRole="tab" accessibilityState={{selected: period === option.key}} onPress={() => setPeriod(option.key)} style={{flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: period === option.key ? colors.navy : 'transparent'}}>
          <Text style={{fontSize: 12, fontWeight: '700', color: period === option.key ? '#FFFFFF' : colors.muted}}>{option.label}</Text>
        </Pressable>)}
      </View>
    </View>

    <View style={{flexDirection: 'row', gap: 8}}>
      <Metric label="COLLECTED" value={timeline.data ? `₹${money(timeline.data.collections)}` : '—'} note={timeline.data ? `${timeline.data.successful_transactions} payments` : 'Recorded payments'} tone="blue" />
      <Metric label="REFUNDS" value={timeline.data ? `₹${money(timeline.data.refunds)}` : '—'} note="Recorded reversals" tone="amber" />
      <Metric label="PENDING" value={pending === null ? '—' : `₹${money(pending)}`} note="Settlements" tone="green" />
    </View>

    <Card title={period === 'day' ? 'Money inflow trend' : period === 'week' ? 'Weekly collection trend' : 'Monthly collection trend'}>
      <Text style={{fontSize: 11, color: colors.muted}}>{period === 'day' ? 'Successful collections by hour' : period === 'week' ? 'Successful collections by day · last 7 days' : 'Successful collections by day · last 30 days'}</Text>
      {timeline.isLoading ? <ActivityIndicator color={colors.blue} /> : timeline.isError ? <Note>{timeline.error.message}</Note> : timeline.data ? <TimelineChart buckets={timeline.data.buckets} period={period} /> : null}
      {peak ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F0F8FC', borderRadius: 12, padding: 11}}>
        <Text style={{fontSize: 16, color: colors.blue}}>↗</Text>
        <Text style={{flex: 1, fontSize: 11, lineHeight: 16, color: colors.ink}}>Busiest recorded hour: <Text style={{fontWeight: '800'}}>{hour(peak.hour)}</Text> · {peak.successful_transactions} successful payments</Text>
      </View> : <Note>There are not enough recorded payments to identify a busy hour.</Note>}
    </Card>

    <Card title="Collections & refunds">
      <Text style={{fontSize: 11, color: colors.muted}}>Recorded amounts over the selected period. Refunds are reversals, not operating expenses.</Text>
      {timeline.isLoading ? <ActivityIndicator color={colors.blue} /> : timeline.data ? <PeriodBars buckets={timeline.data.buckets} period={period} /> : null}
      <View style={{flexDirection: 'row', justifyContent: 'center', gap: 20}}><Legend color={colors.blue} label="Collections"/><Legend color="#F4B34E" label="Refunds"/></View>
    </Card>

    <Card title="Previous-period comparison">
      {comparison.isLoading ? <ActivityIndicator color={colors.blue} /> : comparison.isError ? <Note>{comparison.error.message}</Note> : comparison.data ? <>
        <Text style={{fontSize: 11, color: colors.muted}}>{selected.label} collections compared with the preceding {selected.days} {selected.days === 1 ? 'day' : 'days'}</Text>
        <ComparisonBars current={Number(comparison.data.current_collections)} previous={Number(comparison.data.previous_collections)} />
        <Text style={{textAlign: 'center', fontSize: 12, color: colors.ink}}>{change === null ? 'There is not enough history for a percentage comparison.' : `Collections ${Math.abs(change).toFixed(2)}% ${change >= 0 ? 'higher' : 'lower'} than the previous period.`}</Text>
      </> : null}
    </Card>

    <Card title="Paytm Business AI insight">
      {alerts.isLoading ? <ActivityIndicator color={colors.blue} /> : alerts.isError ? <Note>{alerts.error.message}</Note> : alerts.data?.alerts.length ? alerts.data.alerts.map((alert, index) => <View key={`${alert.type}-${index}`} style={{gap: 5}}><Text style={{color: colors.amber, fontWeight: '800'}}>{alert.priority.toUpperCase()} · {alert.type.replaceAll('_', ' ')}</Text><Note>{alert.action}</Note><Text style={{fontSize: 10, color: colors.muted}}>Evidence: {alert.change_percent}% change over the last 7 days.</Text></View>) : <Note>{change === null ? alerts.data?.reason ?? 'No alert threshold was triggered by the available records.' : `Collections are ${Math.abs(change).toFixed(2)}% ${change >= 0 ? 'up' : 'down'} versus the previous period. This is transaction history, not profit.`}</Note>}
    </Card>
    <Note>Collections, refunds, and settlements are shown separately. Expense data is not connected, so this screen does not calculate profit or available cash.</Note>
  </Screen>;
}

function Metric({label, value, note, tone}: {label: string; value: string; note: string; tone: 'blue' | 'amber' | 'green'}) {
  const accent = tone === 'blue' ? colors.blue : tone === 'amber' ? colors.amber : colors.green;
  return <View style={{flex: 1, minWidth: 0, minHeight: 102, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, borderTopWidth: 3, borderTopColor: accent, borderRadius: 15, padding: 9, justifyContent: 'space-between'}}>
    <Text numberOfLines={1} style={{fontSize: 9, letterSpacing: 0.4, fontWeight: '800', color: colors.muted}}>{label}</Text>
    <Text numberOfLines={1} adjustsFontSizeToFit style={{fontSize: 16, fontWeight: '800', color: colors.navy}}>{value}</Text>
    <Text numberOfLines={1} style={{fontSize: 9, color: colors.muted}}>{note}</Text>
  </View>;
}

function TimelineChart({buckets, period}: {buckets: Timeline['buckets']; period: Period}) {
  const values = buckets.map(bucket => Number(bucket.collections));
  const max = Math.max(...values, 1);
  const left = 16; const right = 304; const top = 18; const base = 116; const height = 84;
  const points = values.map((value, index) => ({x: left + (values.length <= 1 ? 0 : index * (right - left) / (values.length - 1)), y: base - value / max * height}));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${right} ${base} L ${left} ${base} Z`;
  const tickStep = period === 'day' ? 4 : period === 'week' ? 1 : 5;
  const tickIndexes = buckets.map((_, index) => index).filter(index => index % tickStep === 0 || index === buckets.length - 1);
  return <Svg width="100%" height="155" viewBox="0 0 320 155" accessibilityLabel="Line chart of recorded successful collections">
    {[0, 1, 2].map(index => <Line key={index} x1={left} x2={right} y1={top + index * 42} y2={top + index * 42} stroke="#E7EDF5" strokeWidth="1"/>)}
    <Path d={area} fill="#EAF4FF" />
    <Path d={line} fill="none" stroke={colors.blue} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    {points.filter((_, index) => tickIndexes.includes(index)).map((point, index) => <Circle key={`point-${index}`} cx={point.x} cy={point.y} r="3.5" fill="#FFFFFF" stroke={colors.blue} strokeWidth="2"/>)}
    {tickIndexes.map(index => <SvgText key={`label-${index}`} x={points[index].x} y="143" textAnchor="middle" fontSize="9" fill={colors.muted}>{period === 'day' ? buckets[index].label.slice(0, 2) : buckets[index].label}</SvgText>)}
  </Svg>;
}

function PeriodBars({buckets, period}: {buckets: Timeline['buckets']; period: Period}) {
  const max = Math.max(...buckets.flatMap(bucket => [Number(bucket.collections), Number(bucket.refunds)]), 1);
  const width = 320; const count = buckets.length; const group = 288 / count; const barWidth = Math.max(2, Math.min(12, group * 0.32)); const top = 15; const base = 110; const chartHeight = 82;
  const labelStep = period === 'day' ? 4 : period === 'week' ? 1 : 5;
  return <Svg width="100%" height="140" viewBox={`0 0 ${width} 140`} accessibilityLabel="Bar chart comparing recorded collections and refunds">
    {[0, 1, 2].map(index => <Line key={index} x1="16" x2="304" y1={top + index * 41} y2={top + index * 41} stroke="#E7EDF5" strokeWidth="1"/>)}
    {buckets.map((bucket, index) => {
      const x = 16 + index * group + (group - 2 * barWidth - 2) / 2;
      const collectionHeight = Number(bucket.collections) / max * chartHeight;
      const refundHeight = Number(bucket.refunds) / max * chartHeight;
      return <Fragment key={`${bucket.label}-${index}`}>
        <Rect x={x} y={base - collectionHeight} width={barWidth} height={Math.max(collectionHeight, Number(bucket.collections) > 0 ? 2 : 0)} rx="2" fill={colors.blue}/>
        <Rect x={x + barWidth + 2} y={base - refundHeight} width={barWidth} height={Math.max(refundHeight, Number(bucket.refunds) > 0 ? 2 : 0)} rx="2" fill="#F4B34E"/>
        {index % labelStep === 0 || index === count - 1 ? <SvgText x={16 + index * group + group / 2} y="130" textAnchor="middle" fontSize="8" fill={colors.muted}>{period === 'day' ? bucket.label.slice(0, 2) : bucket.label}</SvgText> : null}
      </Fragment>;
    })}
  </Svg>;
}

function ComparisonBars({current, previous}: {current: number; previous: number}) {
  const max = Math.max(current, previous, 1);
  const currentHeight = current / max * 86; const previousHeight = previous / max * 86;
  return <Svg width="100%" height="126" viewBox="0 0 320 126" accessibilityLabel="Bar chart comparing this period with the previous period">
    <Line x1="36" x2="284" y1="104" y2="104" stroke="#E7EDF5" strokeWidth="1"/>
    <Rect x="83" y={104 - previousHeight} width="54" height={Math.max(4, previousHeight)} rx="8" fill="#84D7EF"/>
    <Rect x="183" y={104 - currentHeight} width="54" height={Math.max(4, currentHeight)} rx="8" fill={colors.blue}/>
    <SvgText x="110" y="121" textAnchor="middle" fontSize="10" fill={colors.muted}>Previous</SvgText>
    <SvgText x="210" y="121" textAnchor="middle" fontSize="10" fill={colors.muted}>Current</SvgText>
  </Svg>;
}

function Legend({color, label}: {color: string; label: string}) {
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><View style={{width: 9, height: 9, borderRadius: 5, backgroundColor: color}}/><Text style={{fontSize: 10, color: colors.muted}}>{label}</Text></View>;
}

function hour(value: number) {
  const suffix = value >= 12 ? 'PM' : 'AM';
  return `${value % 12 || 12} ${suffix}`;
}
