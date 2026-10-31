"use client";

import { useState } from "react";
import { ChartNoAxesCombined, CircleAlert, Download, FileSpreadsheet, Printer, ReceiptText } from "lucide-react";
import type { FinanceRecord, Transaction } from "@/lib/api";
import { DEMO_PROFIT_DAILY, DEMO_PROFIT_SUMMARY, DEMO_TRANSACTIONS } from "@/lib/demo-data";

type Period = "7" | "30" | "90" | "all";
const cash = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(minor / 100);
const rupees = (minor: number) => (minor / 100).toFixed(2);
const currentTimestamp = () => Date.now();
function startOfPeriod(anchor: number, days: number) { const date = new Date(anchor); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - days + 1); return date.getTime(); }
const dayKey = (value: string) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const escapeCsv = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};
function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export function ReportsPage({ demo, transactions, records }: { demo: boolean; transactions: Transaction[]; records: FinanceRecord[] }) {
  const [period, setPeriod] = useState<Period>("7");
  const hasSavedProfitRecords = records.some((record) => ["inventory_item", "inventory_sale", "inventory_return", "expense_recorded"].includes(record.kind));
  const useSampleProfit = demo && !hasSavedProfitRecords;
  const rows = demo ? DEMO_TRANSACTIONS : transactions;
  const latestTransactionTime = demo && rows.length ? Math.max(...rows.map((row) => new Date(row.occurred_at).getTime())) : currentTimestamp();
  const cutoff = period === "all" ? null : startOfPeriod(latestTransactionTime, Number(period));
  const filteredTransactions = rows.filter((row) => cutoff === null || new Date(row.occurred_at).getTime() >= cutoff);
  const profitRecords = records.filter((record) => ["inventory_sale", "inventory_return", "expense_recorded"].includes(record.kind) && (cutoff === null || new Date(record.occurred_at).getTime() >= cutoff));
  const filteredSales = filteredTransactions.filter((row) => row.status === "succeeded");
  const collections = filteredSales.reduce((sum, row) => sum + row.amount_minor, 0);
  const failed = filteredTransactions.filter((row) => row.status === "failed").length;
  const periodProfit = useSampleProfit ? DEMO_PROFIT_SUMMARY.netProfitMinor : profitRecords.reduce((sum, record) => {
    if (record.kind === "inventory_sale") return sum + record.amount_minor - (record.unit_cost_minor ?? 0) * (record.quantity ?? 0) - (record.fees_minor ?? 0);
    if (record.kind === "inventory_return") return sum + (record.unit_cost_minor ?? 0) * (record.quantity ?? 0) - record.amount_minor;
    return sum - record.amount_minor;
  }, 0);
  const chart = (() => {
    if (useSampleProfit) return DEMO_PROFIT_DAILY.map((day) => ({ label: day.label.split(" ")[0], collections: day.amountMinor, profit: day.profitMinor }));
    const dayMap = new Map<string, { collections: number; profit: number }>();
    for (const row of filteredSales) { const key = dayKey(row.occurred_at); const item = dayMap.get(key) ?? { collections: 0, profit: 0 }; item.collections += row.amount_minor; dayMap.set(key, item); }
    for (const record of profitRecords) { const key = dayKey(record.occurred_at); const item = dayMap.get(key) ?? { collections: 0, profit: 0 }; if (record.kind === "inventory_sale") item.profit += record.amount_minor - (record.unit_cost_minor ?? 0) * (record.quantity ?? 0) - (record.fees_minor ?? 0); else if (record.kind === "inventory_return") item.profit += (record.unit_cost_minor ?? 0) * (record.quantity ?? 0) - record.amount_minor; else item.profit -= record.amount_minor; dayMap.set(key, item); }
    return [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => ({ label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${key}T12:00:00`)), ...values }));
  })();
  const periodLabel = period === "all" ? "All available history" : `Last ${period} days`;
  const stamp = new Date(currentTimestamp()).toISOString().slice(0, 10);
  const statementHeaders = ["Transaction ID", "Date and time (IST)", "Payment method", "Status", "Currency", "Amount", "Data source"];
  const statementRows = filteredTransactions.slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map((row) => [row.id, new Date(row.occurred_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), row.payment_method ?? "Payment", row.status, row.currency, rupees(row.amount_minor), demo ? "Illustrative demo data" : "Connected API"]);
  const statementFilename = `paytm-saathi-${demo ? "sample-" : ""}transactions-${stamp}.csv`;
  const ledgerRows = profitRecords.slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map((row) => [new Date(row.occurred_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), row.kind.replaceAll("_", " "), row.name, row.quantity ?? "", rupees(row.amount_minor), row.discount_minor == null ? "" : rupees(row.discount_minor), row.fees_minor == null ? "" : rupees(row.fees_minor), row.note ?? ""]);
  const max = Math.max(1, ...chart.map((point) => point.collections));

  return <section className="business-page reports-page">
    <header className="business-heading"><div><div className="eyebrow"><ReceiptText size={15}/> PAYTM SAATHI</div><h1>Reports &amp; statements</h1><p>Review collections, saved sales and costs; download a transaction statement for your records.</p></div><span className="business-demo-tag">{demo ? "SAMPLE DATA" : "ACCOUNT DATA"}</span></header>
    <div className="report-toolbar"><label>Reporting period<select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All available history</option></select></label><button type="button" className="report-button" disabled={!filteredTransactions.length} onClick={() => downloadCsv(statementFilename, statementHeaders, statementRows)}><Download size={15}/> Download transaction statement</button><button type="button" className="report-button secondary" disabled={!profitRecords.length} onClick={() => downloadCsv(`paytm-saathi-sales-cost-ledger-${stamp}.csv`, ["Date and time (IST)", "Entry type", "Product or category", "Quantity", "Amount (INR)", "Discount (INR)", "Fees (INR)", "Note"], ledgerRows)}><FileSpreadsheet size={15}/> Download sales &amp; costs</button><button type="button" className="report-button secondary" onClick={() => window.print()}><Printer size={15}/> Print / save report PDF</button></div>
    <div className="business-notice"><CircleAlert size={17}/><span><strong>{demo ? "Sample collections · not a merchant statement" : "Report data and coverage"}</strong><small>{demo ? `Payment rows are illustrative sample data. ${useSampleProfit ? "The profit figures are also sample P&L amounts for 24–30 Oct 2026." : "Profit figures come from your saved manual sales and cost ledger."} Exports preserve that distinction in the file name and report notes.` : "Transactions come from the available payment API. Profit uses your saved manual product sales, returns, fees and expenses; it does not include costs you have not entered."}</small></span></div>
    <div className="business-metrics"><Metric label="Successful collections" value={cash(collections)} caption={`${filteredSales.length} ${demo ? "sample payments" : "successful payments"} · ${periodLabel.toLowerCase()}`}/><Metric label="Transactions" value={String(filteredTransactions.length)} caption={`${failed} failed attempts in this period${demo ? " · sample" : ""}`}/><Metric label="Estimated profit" value={useSampleProfit || profitRecords.length ? cash(periodProfit) : "—"} caption={useSampleProfit ? "Sample P&L · 24–30 Oct 2026" : "Saved sales less saved costs and expenses"}/><Metric label="Profit margin" value={useSampleProfit ? `${(DEMO_PROFIT_SUMMARY.netProfitMinor / DEMO_PROFIT_SUMMARY.netSalesMinor * 100).toFixed(1)}%` : "—"} caption={useSampleProfit ? "Illustrative net profit ÷ net sales" : "Available with a complete sales and cost ledger"}/></div>
    <article className="panel report-chart-panel"><div className="panel-header"><div><h3>Collections &amp; profit trend</h3><p>{useSampleProfit ? "Daily sample collections and estimated profit · 24–30 Oct 2026" : `${periodLabel} · grouped by transaction / ledger date`}</p></div><ChartNoAxesCombined size={17}/></div>{chart.length ? <div className="report-chart" role="img" aria-label="Daily collections and profit chart">{chart.map((point) => <div className="report-chart-day" key={point.label}><div className="report-chart-values"><span title={`Collections ${cash(point.collections)}`}>{cash(point.collections)}</span><b title={`Profit ${cash(point.profit)}`}>{cash(point.profit)}</b></div><div className="report-chart-bars"><i style={{ height: `${Math.max(5, point.collections / max * 100)}%` }}/><i className="profit-bar" style={{ height: `${Math.max(5, Math.max(0, point.profit) / max * 100)}%` }}/></div><small>{point.label}</small></div>)}</div> : <div className="business-empty">No transactions or saved sales records in this period yet. When data is available, daily collections and profit will appear here.</div>}<div className="report-legend"><span><i/> Collections</span><span><i/> Estimated profit</span></div></article>
    <article className="panel business-table-panel"><div className="panel-header"><div><h3>Transaction statement</h3><p>{filteredTransactions.length} available payment records · amounts shown in original currency</p></div><button type="button" className="report-button compact" disabled={!filteredTransactions.length} onClick={() => downloadCsv(statementFilename, statementHeaders, statementRows)}><Download size={14}/> CSV</button></div><div className="business-table-wrap"><table className="business-table"><thead><tr><th>Date &amp; time</th><th>Reference</th><th>Method</th><th>Status</th><th>Amount</th></tr></thead><tbody>{filteredTransactions.slice().sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)).map((row)=><tr key={row.id}><td>{new Date(row.occurred_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{row.id}</td><td>{row.payment_method ?? "Payment"}</td><td><span className={`record-status ${row.status}`}>{row.status}</span></td><td>{new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency, maximumFractionDigits: 2 }).format(row.amount_minor / 100)}</td></tr>)}</tbody></table>{!filteredTransactions.length&&<div className="business-empty">No payment transactions are available in this reporting period.</div>}</div><p className="business-footnote"><CircleAlert size={14}/>{demo ? "Illustrative records only. This file is a sample statement, not a bank or Paytm-issued statement." : "This CSV contains the transaction fields returned by the connected API. Verify against your official payment-provider statement."}</p></article>
    <article className="panel business-table-panel"><div className="panel-header"><div><h3>Sales, returns &amp; costs ledger</h3><p>Account-saved product sales, discounts, payment fees, returns and expenses</p></div></div>{profitRecords.length ? <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Date</th><th>Entry</th><th>Item / category</th><th>Qty</th><th>Amount</th><th>Discount</th><th>Fees</th></tr></thead><tbody>{profitRecords.slice().sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)).map((row)=><tr key={row.id}><td>{new Date(row.occurred_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{row.kind.replaceAll("_", " ")}</td><td>{row.name}</td><td>{row.quantity ?? "—"}</td><td>{cash(row.amount_minor)}</td><td>{row.discount_minor == null ? "—" : cash(row.discount_minor)}</td><td>{row.fees_minor == null ? "—" : cash(row.fees_minor)}</td></tr>)}</tbody></table><p className="report-empty-hint">Expenses and manual stock/sales entries appear here after you save them in Stock &amp; staff.</p></div> : <div className="business-empty">No manual sales or cost entries in this period. Add products, sales, discounts, returns, fees and expenses in Stock &amp; staff to build a profit report.</div>}</article>
  </section>;
}

function Metric({ label, value, caption }: { label: string; value: string; caption: string }) { return <article className="metric-card"><div className="metric-head">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{caption}</div></article>; }

