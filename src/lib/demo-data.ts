import type { Transaction } from "@/lib/api";

export const DEMO_RANGE = "24–30 Oct 2026";

export const DEMO_TRANSACTIONS: Transaction[] = [
  { id: "demo-2301", occurred_at: "2026-10-30T11:42:00+05:30", amount_minor: 245000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2302", occurred_at: "2026-10-30T10:18:00+05:30", amount_minor: 125000, currency: "INR", status: "succeeded", payment_method: "QR" },
  { id: "demo-2303", occurred_at: "2026-10-30T09:54:00+05:30", amount_minor: 79900, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2304", occurred_at: "2026-10-30T09:11:00+05:30", amount_minor: 45000, currency: "INR", status: "failed", payment_method: "UPI" },
  { id: "demo-2298", occurred_at: "2026-10-29T18:25:00+05:30", amount_minor: 389900, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2297", occurred_at: "2026-10-29T16:10:00+05:30", amount_minor: 245000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2295", occurred_at: "2026-10-29T13:43:00+05:30", amount_minor: 120000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2294", occurred_at: "2026-10-29T11:07:00+05:30", amount_minor: 59000, currency: "INR", status: "succeeded", payment_method: "QR" },
  { id: "demo-2291", occurred_at: "2026-10-28T18:02:00+05:30", amount_minor: 399900, currency: "INR", status: "succeeded", payment_method: "QR" },
  { id: "demo-2290", occurred_at: "2026-10-28T15:20:00+05:30", amount_minor: 220000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2289", occurred_at: "2026-10-28T12:16:00+05:30", amount_minor: 150000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2288", occurred_at: "2026-10-28T10:02:00+05:30", amount_minor: 85000, currency: "INR", status: "failed", payment_method: "Card" },
  { id: "demo-2282", occurred_at: "2026-10-27T19:20:00+05:30", amount_minor: 650000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2280", occurred_at: "2026-10-27T15:04:00+05:30", amount_minor: 285000, currency: "INR", status: "succeeded", payment_method: "QR" },
  { id: "demo-2279", occurred_at: "2026-10-27T12:32:00+05:30", amount_minor: 112000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2276", occurred_at: "2026-10-26T17:11:00+05:30", amount_minor: 225000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2274", occurred_at: "2026-10-26T13:23:00+05:30", amount_minor: 179900, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2272", occurred_at: "2026-10-26T10:06:00+05:30", amount_minor: 49900, currency: "INR", status: "succeeded", payment_method: "QR" },
  { id: "demo-2267", occurred_at: "2026-10-25T14:48:00+05:30", amount_minor: 145000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2265", occurred_at: "2026-10-25T11:25:00+05:30", amount_minor: 98000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2260", occurred_at: "2026-10-24T17:41:00+05:30", amount_minor: 320000, currency: "INR", status: "succeeded", payment_method: "UPI" },
  { id: "demo-2258", occurred_at: "2026-10-24T13:10:00+05:30", amount_minor: 210000, currency: "INR", status: "succeeded", payment_method: "QR" },
  { id: "demo-2256", occurred_at: "2026-10-24T10:52:00+05:30", amount_minor: 75500, currency: "INR", status: "succeeded", payment_method: "UPI" },
];

export const DEMO_DAILY_SALES = [
  { label: "24 Oct", amountMinor: 605500, count: 3 },
  { label: "25 Oct", amountMinor: 243000, count: 2 },
  { label: "26 Oct", amountMinor: 454800, count: 3 },
  { label: "27 Oct", amountMinor: 1047000, count: 3 },
  { label: "28 Oct", amountMinor: 769900, count: 3 },
  { label: "29 Oct", amountMinor: 813900, count: 4 },
  { label: "30 Oct", amountMinor: 449900, count: 3 },
];

export const DEMO_PENDING_SETTLEMENT = { amountMinor: 864000, payoutCount: 2, expected: "31 Oct" };

const successfulTransactions = DEMO_TRANSACTIONS.filter((item) => item.status === "succeeded");
export const DEMO_SALES_SUMMARY = {
  grossCollectionsMinor: successfulTransactions.reduce((sum, item) => sum + item.amount_minor, 0),
  transactionCount: successfulTransactions.length,
  failedCount: DEMO_TRANSACTIONS.length - successfulTransactions.length,
  averageTransactionMinor: Math.round(successfulTransactions.reduce((sum, item) => sum + item.amount_minor, 0) / successfulTransactions.length),
};

const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const dayLabel = (timestamp: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(timestamp));

export function answerDemoQuestion(question: string): string {
  const query = question.toLocaleLowerCase();
  const disclaimer = " These are sample demo figures, not live Paytm account data.";
  const successful = DEMO_TRANSACTIONS.filter((item) => item.status === "succeeded");
  const todaySales = DEMO_DAILY_SALES[DEMO_DAILY_SALES.length - 1];
  const yesterdaySales = DEMO_DAILY_SALES[DEMO_DAILY_SALES.length - 2];
  const bestDay = DEMO_DAILY_SALES.reduce((best, item) => item.amountMinor > best.amountMinor ? item : best);

  if (/\b(stock|inventory|staff|customer|customers|loan|credit|gst|tax|campaign|marketing)\b/.test(query)) {
    return `This demo has sample payment, transaction and settlement data for ${DEMO_RANGE}. It does not include mock stock, staff, customer, lending or tax records yet.`;
  }
  if (/settle|payout|cash flow|cashflow/.test(query)) {
    return `Demo cash flow: ${rupees(DEMO_PENDING_SETTLEMENT.amountMinor)} across ${DEMO_PENDING_SETTLEMENT.payoutCount} pending payouts, expected ${DEMO_PENDING_SETTLEMENT.expected}.` + disclaimer;
  }
  if (/failed|declined|unsuccessful/.test(query)) {
    const failed = DEMO_TRANSACTIONS.filter((item) => item.status === "failed");
    const failedTotal = failed.reduce((sum, item) => sum + item.amount_minor, 0);
    const details = failed.map((item) => `${rupees(item.amount_minor)} ${item.payment_method} on ${dayLabel(item.occurred_at)}`).join(" and ");
    return `${failed.length} demo payments failed, totaling ${rupees(failedTotal)}: ${details}. No failed amount is included in gross collections.` + disclaimer;
  }
  if (/\btoday\b|आज/.test(query)) {
    return `Today (${todaySales.label}), sample sales are ${rupees(todaySales.amountMinor)} from ${todaySales.count} successful payments.` + disclaimer;
  }
  if (/yesterday|कल/.test(query)) {
    return `Yesterday (${yesterdaySales.label}), sample sales were ${rupees(yesterdaySales.amountMinor)} from ${yesterdaySales.count} successful payments.` + disclaimer;
  }
  if (/best|highest|top day|peak/.test(query)) {
    return `${bestDay.label} was the strongest sample day with ${rupees(bestDay.amountMinor)} from ${bestDay.count} successful payments.` + disclaimer;
  }
  if (/daily|each day|day by day|trend|breakdown|weekly|this week/.test(query)) {
    const details = DEMO_DAILY_SALES.map((item) => `${item.label}: ${rupees(item.amountMinor)} (${item.count} payments)`).join("; ");
    return `Daily demo sales for ${DEMO_RANGE}: ${details}.` + disclaimer;
  }
  if (/average|avg/.test(query)) {
    return `The sample average payment was ${rupees(DEMO_SALES_SUMMARY.averageTransactionMinor)}, based on ${DEMO_SALES_SUMMARY.transactionCount} successful payments.` + disclaimer;
  }
  if (/method|upi|qr|card/.test(query)) {
    const byMethod = new Map<string, number>();
    successful.forEach((item) => byMethod.set(item.payment_method ?? "Other", (byMethod.get(item.payment_method ?? "Other") ?? 0) + item.amount_minor));
    return `Sample collections by method: UPI ${rupees(byMethod.get("UPI") ?? 0)}, QR ${rupees(byMethod.get("QR") ?? 0)}. The failed card payment is excluded.` + disclaimer;
  }
  if (/recent|latest|transaction|payment/.test(query)) {
    const recent = DEMO_TRANSACTIONS.slice(0, 5).map((item) => `${rupees(item.amount_minor)} ${item.payment_method} (${item.status})`).join("; ");
    return `Recent sample payments: ${recent}.` + disclaimer;
  }
  return `For ${DEMO_RANGE}, sample gross sales were ${rupees(DEMO_SALES_SUMMARY.grossCollectionsMinor)} from ${DEMO_SALES_SUMMARY.transactionCount} successful payments. The average was ${rupees(DEMO_SALES_SUMMARY.averageTransactionMinor)}; ${DEMO_SALES_SUMMARY.failedCount} payments failed; ${DEMO_PENDING_SETTLEMENT.payoutCount} payouts totaling ${rupees(DEMO_PENDING_SETTLEMENT.amountMinor)} are pending. ${bestDay.label} was the strongest day at ${rupees(bestDay.amountMinor)}.` + disclaimer;
}
