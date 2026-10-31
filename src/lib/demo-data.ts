import type { FinanceRecord, Transaction } from "@/lib/api";

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

// Illustrative, internally reconciled sample P&L used when there is no connected merchant account.
// Values are in paise; amounts are never written to the signed-in account.
export const DEMO_PROFIT_DAILY = [
  { label: "24 Oct", amountMinor: 605500, count: 3, discountsMinor: 12000, refundsMinor: 5000, cogsMinor: 340000, returnedCogsMinor: 5000, feesMinor: 9100, expensesMinor: 85000, profitMinor: 176400 },
  { label: "25 Oct", amountMinor: 243000, count: 2, discountsMinor: 8000, refundsMinor: 0, cogsMinor: 135000, returnedCogsMinor: 0, feesMinor: 3600, expensesMinor: 35000, profitMinor: 69400 },
  { label: "26 Oct", amountMinor: 454800, count: 3, discountsMinor: 7500, refundsMinor: 6000, cogsMinor: 260000, returnedCogsMinor: 5000, feesMinor: 6800, expensesMinor: 70000, profitMinor: 123000 },
  { label: "27 Oct", amountMinor: 1047000, count: 3, discountsMinor: 20000, refundsMinor: 10000, cogsMinor: 580000, returnedCogsMinor: 5000, feesMinor: 15700, expensesMinor: 150000, profitMinor: 306300 },
  { label: "28 Oct", amountMinor: 769900, count: 3, discountsMinor: 12500, refundsMinor: 0, cogsMinor: 430000, returnedCogsMinor: 0, feesMinor: 11500, expensesMinor: 95000, profitMinor: 233400 },
  { label: "29 Oct", amountMinor: 813900, count: 4, discountsMinor: 15000, refundsMinor: 10000, cogsMinor: 465000, returnedCogsMinor: 5000, feesMinor: 12200, expensesMinor: 115000, profitMinor: 226700 },
  { label: "30 Oct", amountMinor: 449900, count: 3, discountsMinor: 10000, refundsMinor: 5000, cogsMinor: 280000, returnedCogsMinor: 0, feesMinor: 6900, expensesMinor: 70000, profitMinor: 93000 },
];
export const DEMO_PROFIT_SUMMARY = DEMO_PROFIT_DAILY.reduce((totals, day) => ({
  grossSalesMinor: totals.grossSalesMinor + day.amountMinor + day.discountsMinor + day.refundsMinor,
  discountsMinor: totals.discountsMinor + day.discountsMinor,
  refundsMinor: totals.refundsMinor + day.refundsMinor,
  netSalesMinor: totals.netSalesMinor + day.amountMinor,
  cogsMinor: totals.cogsMinor + day.cogsMinor,
  returnedCogsMinor: totals.returnedCogsMinor + day.returnedCogsMinor,
  netCogsMinor: totals.netCogsMinor + day.cogsMinor - day.returnedCogsMinor,
  feesMinor: totals.feesMinor + day.feesMinor,
  expensesMinor: totals.expensesMinor + day.expensesMinor,
  netProfitMinor: totals.netProfitMinor + day.profitMinor,
}), { grossSalesMinor: 0, discountsMinor: 0, refundsMinor: 0, netSalesMinor: 0, cogsMinor: 0, returnedCogsMinor: 0, netCogsMinor: 0, feesMinor: 0, expensesMinor: 0, netProfitMinor: 0 });

// Anonymous customer purchase events illustrate retention analytics; never treated as real or saved.
export const DEMO_CUSTOMER_PURCHASES: FinanceRecord[] = [
  { id: "demo-c104-1", kind: "customer_purchase", name: "Snack boxes", customer_name: "Asha Rao", phone: null, amount_minor: 18500, discount_minor: 1500, occurred_at: "2026-10-03T10:00:00+05:30", category: "Snacks", quantity: 1, related_record_id: "demo-snacks" },
  { id: "demo-c104-2", kind: "customer_purchase", name: "Snack boxes", customer_name: "Asha Rao", phone: null, amount_minor: 21000, discount_minor: 0, occurred_at: "2026-10-10T10:00:00+05:30", category: "Snacks", quantity: 1, related_record_id: "demo-snacks" },
  { id: "demo-c104-3", kind: "customer_purchase", name: "Snack boxes", customer_name: "Asha Rao", phone: null, amount_minor: 19500, discount_minor: 2000, occurred_at: "2026-10-17T10:00:00+05:30", category: "Snacks", quantity: 1, related_record_id: "demo-snacks" },
  { id: "demo-c104-4", kind: "customer_purchase", name: "Snack boxes", customer_name: "Asha Rao", phone: null, amount_minor: 14000, discount_minor: 0, occurred_at: "2026-10-24T10:00:00+05:30", category: "Snacks", quantity: 1, related_record_id: "demo-snacks" },
  { id: "demo-c211-1", kind: "customer_purchase", name: "Tea packs", customer_name: "Ravi Kumar", phone: null, amount_minor: 42000, discount_minor: 0, occurred_at: "2026-10-10T12:00:00+05:30", category: "Tea & coffee", quantity: 2, related_record_id: "demo-tea" },
  { id: "demo-c211-2", kind: "customer_purchase", name: "Tea packs", customer_name: "Ravi Kumar", phone: null, amount_minor: 39000, discount_minor: 1000, occurred_at: "2026-10-17T12:00:00+05:30", category: "Tea & coffee", quantity: 2, related_record_id: "demo-tea" },
  { id: "demo-c211-3", kind: "customer_purchase", name: "Tea packs", customer_name: "Ravi Kumar", phone: null, amount_minor: 45000, discount_minor: 0, occurred_at: "2026-10-24T12:00:00+05:30", category: "Tea & coffee", quantity: 2, related_record_id: "demo-tea" },
  { id: "demo-c312-1", kind: "customer_purchase", name: "Household staples", customer_name: "Meera Shah", phone: null, amount_minor: 125000, discount_minor: 0, occurred_at: "2026-10-01T15:00:00+05:30", category: "Household staples", quantity: 5 },
  { id: "demo-c408-1", kind: "customer_purchase", name: "Snack boxes", customer_name: "Arjun Nair", phone: null, amount_minor: 26000, discount_minor: 0, occurred_at: "2026-10-02T16:00:00+05:30", category: "Snacks", quantity: 2, related_record_id: "demo-snacks" },
  { id: "demo-c408-2", kind: "customer_purchase", name: "Snack boxes", customer_name: "Arjun Nair", phone: null, amount_minor: 24000, discount_minor: 0, occurred_at: "2026-10-09T16:00:00+05:30", category: "Snacks", quantity: 2, related_record_id: "demo-snacks" },
  { id: "demo-c408-3", kind: "customer_purchase", name: "Snack boxes", customer_name: "Arjun Nair", phone: null, amount_minor: 28000, discount_minor: 2000, occurred_at: "2026-10-16T16:00:00+05:30", category: "Snacks", quantity: 2, related_record_id: "demo-snacks" },
  { id: "demo-c408-4", kind: "customer_purchase", name: "Snack boxes", customer_name: "Arjun Nair", phone: null, amount_minor: 25000, discount_minor: 0, occurred_at: "2026-10-23T16:00:00+05:30", category: "Snacks", quantity: 2, related_record_id: "demo-snacks" },
  { id: "demo-c509-1", kind: "customer_purchase", name: "Tea packs", customer_name: "Priya Iyer", phone: null, amount_minor: 68000, discount_minor: 0, occurred_at: "2026-10-05T11:00:00+05:30", category: "Beverages", quantity: 3, related_record_id: "demo-tea" },
  { id: "demo-c509-2", kind: "customer_purchase", name: "Tea packs", customer_name: "Priya Iyer", phone: null, amount_minor: 72000, discount_minor: 5000, occurred_at: "2026-10-20T11:00:00+05:30", category: "Beverages", quantity: 3, related_record_id: "demo-tea" },
  { id: "demo-c620-1", kind: "customer_purchase", name: "Snack boxes", customer_name: "Kavya Menon", phone: null, amount_minor: 15000, discount_minor: 0, occurred_at: "2026-10-01T09:00:00+05:30", category: "Snacks", quantity: 1, related_record_id: "demo-snacks" },
  { id: "demo-c620-2", kind: "customer_purchase", name: "Snack boxes", customer_name: "Kavya Menon", phone: null, amount_minor: 16000, discount_minor: 500, occurred_at: "2026-10-05T09:00:00+05:30", category: "Snacks", quantity: 1, related_record_id: "demo-snacks" },
];

export const DEMO_INVENTORY_PRODUCTS = [
  { id: "demo-tea", name: "Tea packs", quantity: 32, unit_cost_minor: 1200, unit_price_minor: 2000 },
  { id: "demo-notebooks", name: "Notebooks", quantity: 24, unit_cost_minor: 2800, unit_price_minor: 4500 },
  { id: "demo-snacks", name: "Snack boxes", quantity: 15, unit_cost_minor: 3500, unit_price_minor: 5200 },
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

  if (/profit|margin|cogs|cost of goods|discount|refund|returns?|expenses?|net income|लाभ|मुनाफा|खर्च|ರಫ್ತು|ಲಾಭ|ಖರ್ಚು/u.test(query)) {
    const netProfit = DEMO_PROFIT_SUMMARY.netProfitMinor;
    const grossProfit = DEMO_PROFIT_SUMMARY.netSalesMinor - DEMO_PROFIT_SUMMARY.netCogsMinor;
    const netMargin = DEMO_PROFIT_SUMMARY.netSalesMinor ? (netProfit / DEMO_PROFIT_SUMMARY.netSalesMinor * 100).toFixed(1) : "0.0";
    return `Illustrative demo profit for ${DEMO_RANGE}: gross sales ${rupees(DEMO_PROFIT_SUMMARY.grossSalesMinor)}, discounts ${rupees(DEMO_PROFIT_SUMMARY.discountsMinor)}, refunds ${rupees(DEMO_PROFIT_SUMMARY.refundsMinor)}, net sales ${rupees(DEMO_PROFIT_SUMMARY.netSalesMinor)}, cost of goods after returns ${rupees(DEMO_PROFIT_SUMMARY.netCogsMinor)}, gross profit ${rupees(grossProfit)}, payment fees ${rupees(DEMO_PROFIT_SUMMARY.feesMinor)}, operating expenses ${rupees(DEMO_PROFIT_SUMMARY.expensesMinor)}, and estimated net profit ${rupees(netProfit)} (${netMargin}% net margin). These are sample figures, not Paytm account data. Stock & staff lets you record product cost, sales, discounts, fees, returns and expenses.`;
  }

  if (/\b(stock|inventory|staff|customer|customers|loan|credit|gst|tax|campaign|marketing)\b/.test(query)) {
    return `This demo has sample payment, transaction, stock and profit figures for ${DEMO_RANGE}. Three example products are shown in Stock & staff; these are illustrative and are not saved as your real inventory.`;
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
