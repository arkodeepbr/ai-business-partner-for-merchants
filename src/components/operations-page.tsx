"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Activity, Boxes, ChartNoAxesCombined, CircleAlert, Plus, Sparkles, Undo2 } from "lucide-react";
import type { FinanceRecord } from "@/lib/api";
import { api } from "@/lib/api";
import { DEMO_INVENTORY_PRODUCTS, DEMO_PROFIT_DAILY, DEMO_PROFIT_SUMMARY } from "@/lib/demo-data";
import { getInventoryProducts } from "@/lib/inventory";
import type { Locale } from "@/lib/locale";

type Draft = Omit<FinanceRecord, "id" | "occurred_at">;
type EntryMode = "product" | "sale" | "return" | "expense";
const money = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(minor / 100);
const rupeesToMinor = (value: string) => Math.round(Number(value) * 100);
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function OperationsPage({ records, canSave, onAdd, onSpeak, locale }: { records: FinanceRecord[]; canSave: boolean; onAdd: (record: Draft) => Promise<void>; onSpeak: (text: string) => Promise<void>; locale: Locale }) {
  const [mode, setMode] = useState<EntryMode>("product");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [saleFees, setSaleFees] = useState("0");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [advice, setAdvice] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [targetLift, setTargetLift] = useState("10");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanRate, setLoanRate] = useState("12");
  const [loanMonths, setLoanMonths] = useState("12");

  const realProducts = useMemo(() => getInventoryProducts(records), [records]);
  const hasProfitRecords = records.some((record) => ["inventory_item", "inventory_sale", "inventory_return", "expense_recorded"].includes(record.kind) || (record.kind === "customer_purchase" && !!record.related_record_id));
  const sample = !hasProfitRecords;
  const products = sample ? DEMO_INVENTORY_PRODUCTS : realProducts;
  const selectedProduct = products.find((product) => product.name === name);
  const now = new Date();
  const firstDay = new Date(now); firstDay.setDate(now.getDate() - 6); firstDay.setHours(0, 0, 0, 0);
  const allSales = records.filter((record) => record.kind === "inventory_sale" || (record.kind === "customer_purchase" && !!record.related_record_id));
  const sales = allSales.filter((record) => new Date(record.occurred_at) >= firstDay);
  const allReturns = records.filter((record) => record.kind === "inventory_return");
  const returns = allReturns.filter((record) => new Date(record.occurred_at) >= firstDay);
  const expenses = records.filter((record) => record.kind === "expense_recorded" && new Date(record.occurred_at) >= firstDay);
  const revenue = sample ? DEMO_PROFIT_SUMMARY.netSalesMinor : sales.reduce((total, record) => total + record.amount_minor, 0) - returns.reduce((total, record) => total + record.amount_minor, 0);
  const grossSales = sample ? DEMO_PROFIT_SUMMARY.grossSalesMinor : sales.reduce((total, record) => total + record.amount_minor + (record.discount_minor ?? 0), 0);
  const discounts = sample ? DEMO_PROFIT_SUMMARY.discountsMinor : sales.reduce((total, record) => total + (record.discount_minor ?? 0), 0);
  const refunds = sample ? DEMO_PROFIT_SUMMARY.refundsMinor : returns.reduce((total, record) => total + record.amount_minor, 0);
  const costOfGoods = sample ? DEMO_PROFIT_SUMMARY.netCogsMinor : sales.reduce((total, record) => total + (record.unit_cost_minor ?? 0) * (record.quantity ?? 0), 0) - returns.reduce((total, record) => total + (record.unit_cost_minor ?? 0) * (record.quantity ?? 0), 0);
  const paymentFees = sample ? DEMO_PROFIT_SUMMARY.feesMinor : sales.reduce((total, record) => total + (record.fees_minor ?? 0), 0);
  const enteredExpenses = sample ? DEMO_PROFIT_SUMMARY.expensesMinor : expenses.reduce((total, record) => total + record.amount_minor, 0);
  const grossProfit = revenue - costOfGoods;
  const netProfit = grossProfit - enteredExpenses - paymentFees;
  const margin = revenue > 0 ? grossProfit / revenue * 100 : 0;
  const targetRevenue = Math.round(revenue * (1 + Math.max(0, Number(targetLift) || 0) / 100));
  const trend = sample ? DEMO_PROFIT_DAILY.map((day) => day.profitMinor) : Array.from({ length: 7 }, (_, index) => {
    const day = new Date(firstDay); day.setDate(firstDay.getDate() + index); const key = dateKey(day);
    const daySales = sales.filter((record) => dateKey(new Date(record.occurred_at)) === key);
    const dayExpenses = expenses.filter((record) => dateKey(new Date(record.occurred_at)) === key).reduce((total, record) => total + record.amount_minor, 0);
    const dayReturns = returns.filter((record) => dateKey(new Date(record.occurred_at)) === key);
    return daySales.reduce((total, record) => total + record.amount_minor - (record.unit_cost_minor ?? 0) * (record.quantity ?? 0) - (record.fees_minor ?? 0), 0) + dayReturns.reduce((total, record) => total + (record.unit_cost_minor ?? 0) * (record.quantity ?? 0) - record.amount_minor, 0) - dayExpenses;
  });
  const maxTrend = Math.max(1, ...trend.map(Math.abs));
  const avgMonthlyProfit = netProfit * 30 / 7;
  const principalMinor = rupeesToMinor(loanAmount);
  const rate = Math.max(0, Number(loanRate) || 0) / 100 / 12;
  const term = Math.max(1, Number(loanMonths) || 1);
  const emi = principalMinor > 0 ? Math.round(rate === 0 ? principalMinor / term : principalMinor * rate * Math.pow(1 + rate, term) / (Math.pow(1 + rate, term) - 1)) : 0;
  const loanCoverage = emi > 0 ? avgMonthlyProfit / emi : 0;
  const returnableUnits = name ? Math.max(0, allSales.filter((record) => record.name === name).reduce((sum, record) => sum + (record.quantity ?? 0), 0) - allReturns.filter((record) => record.name === name).reduce((sum, record) => sum + (record.quantity ?? 0), 0)) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const units = Number(quantity);
    let entry: Draft;
    if (!name.trim()) { setNotice("Enter or select an item name."); return; }
    if (mode === "product") {
      const unitCost = rupeesToMinor(cost); const unitPrice = rupeesToMinor(price);
      if (unitCost < 0 || unitPrice <= 0) { setNotice("Enter a valid unit cost and selling price."); return; }
      const previous = realProducts.find((product) => product.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
      entry = { kind: "inventory_item", name: name.trim(), phone: null, amount_minor: 0, quantity: previous?.quantity ?? 0, unit_cost_minor: unitCost, unit_price_minor: unitPrice, due_date: null, related_record_id: null, note: null };
    } else if (mode === "sale") {
      if (!realProducts.some((product) => product.name === name) || !Number.isInteger(units) || units <= 0 || !selectedProduct) { setNotice("Select a saved product and enter a whole number of units."); return; }
      const discountMinor = rupeesToMinor(discount); const feesMinor = rupeesToMinor(saleFees); const grossMinor = selectedProduct.unit_price_minor * units;
      if (discountMinor < 0 || discountMinor > grossMinor || feesMinor < 0) { setNotice("Discount must be between zero and the item total. Fees cannot be negative."); return; }
      entry = { kind: "inventory_sale", name, phone: null, amount_minor: grossMinor - discountMinor, discount_minor: discountMinor, fees_minor: feesMinor, quantity: units, unit_cost_minor: selectedProduct.unit_cost_minor, unit_price_minor: selectedProduct.unit_price_minor, due_date: null, related_record_id: null, note: note.trim() || null };
    } else if (mode === "return") {
      const refundMinor = rupeesToMinor(amount);
      if (!realProducts.some((product) => product.name === name) || !Number.isInteger(units) || units <= 0 || units > returnableUnits || !selectedProduct || refundMinor < 0) { setNotice(`Enter a valid return quantity (up to ${returnableUnits}) and refund amount.`); return; }
      entry = { kind: "inventory_return", name, phone: null, amount_minor: refundMinor, quantity: units, unit_cost_minor: selectedProduct.unit_cost_minor, unit_price_minor: selectedProduct.unit_price_minor, due_date: null, related_record_id: null, note: note.trim() || "Customer return" };
    } else {
      const expense = rupeesToMinor(amount);
      if (expense <= 0) { setNotice("Enter a positive expense amount."); return; }
      entry = { kind: "expense_recorded", name: name.trim(), phone: null, amount_minor: expense, due_date: null, related_record_id: null, note: note.trim() || null };
    }
    setSaving(true); setNotice("Saving to your account…");
    try { await onAdd(entry); setNotice(mode === "product" ? "Product costs saved." : mode === "sale" ? "Sale saved with discount and fee details." : mode === "return" ? "Return saved with its refund amount." : "Expense saved."); setName(""); setQuantity("1"); setCost(""); setPrice(""); setAmount(""); setDiscount("0"); setSaleFees("0"); setNote(""); }
    catch (error) { console.error("Could not save inventory entry", error); setNotice("Could not save this entry. Check the connection and retry; nothing was recorded."); }
    finally { setSaving(false); }
  }

  async function askAdvice() {
    setAdviceLoading(true); setAdvice("");
    const facts = { sample_data: sample, seven_day_gross_sales_minor: grossSales, discounts_minor: discounts, refunds_minor: refunds, net_sales_after_discounts_and_refunds_minor: revenue, cost_of_goods_sold_net_of_returns_minor: costOfGoods, payment_fees_minor: paymentFees, operating_expenses_minor: enteredExpenses, seven_day_net_profit_minor: netProfit, gross_margin_percent: Number(margin.toFixed(1)), suggested_next_seven_day_sales_target_minor: targetRevenue, monthly_profit_run_rate_minor: Math.round(avgMonthlyProfit), loan_scenario: { principal_minor: principalMinor, annual_rate_percent: Number(loanRate) || 0, duration_months: term, estimated_monthly_payment_minor: emi, profit_to_payment_ratio: Number(loanCoverage.toFixed(2)) } };
    try { const result = await api.chat([{ role: "user", content: `Give concise, cautious business guidance in the same language as the interface preference. Use only these figures; clearly label sample data. Explain gross sales, discounts/refunds, net sales, cost of goods, fees, operating expenses, net profit and margin; suggest a next-week sales target, and comment on whether this loan scenario appears affordable from the recorded profit. If records are insufficient, say what is missing. Do not claim loan eligibility or guarantee outcomes. Facts: ${JSON.stringify(facts)}` }], locale); setAdvice(result.answer); void onSpeak(result.answer).catch(() => undefined); }
    catch { setAdvice("Saathi’s AI provider did not respond. The figures below remain local calculations from your entries; enter real sales, costs, and expenses before using them for a decision."); }
    finally { setAdviceLoading(false); }
  }

  const modeName = mode === "product" ? "Add / update product" : mode === "sale" ? "Record a sale" : mode === "return" ? "Record a return" : "Record an expense";
  return <section className="business-page">
    <header className="business-heading"><div><div className="eyebrow"><Boxes size={15}/> PAYTM SAATHI</div><h1>Profit planner</h1><p>Record product costs, sales, discounts, refunds and expenses to understand profit and plan your next sales target.</p></div><span className="business-demo-tag">{sample ? "SAMPLE STARTER DATA" : "YOUR SAVED RECORDS"}</span></header>
    <div className="business-notice"><CircleAlert size={17}/><span><strong>{sample ? "Illustrative sample P&L · 24–30 Oct 2026" : "Profit uses your saved entries"}</strong><small>{sample ? "Sample sales reconcile to the demo collection total. Discounts, refunds, product cost, payment fees and shop expenses are included; samples are never saved to your account." : "Net sales subtract discounts and refunds; profit subtracts returned-item-adjusted cost of goods, payment fees and entered expenses."}</small></span></div>
    <div className="business-metrics"><Metric label="Products tracked" value={String(products.length)} caption={sample ? "Illustrative sample products" : "Your saved product costs"}/><Metric label="Net sales · last 7 days" value={money(revenue)} caption="After discounts and refunds"/><Metric label="Net profit · last 7 days" value={money(netProfit)} caption="After COGS, fees and expenses"/><Metric label="Net margin" value={sample || revenue ? `${(netProfit / Math.max(1, revenue) * 100).toFixed(1)}%` : "—"} caption="Net profit ÷ net sales"/></div>

    <div className="business-two-col"><article className="panel"><div className="panel-header"><div><h3>{modeName}</h3><p>Sales record unit cost, discounts and fees; entries save to your account.</p></div></div><form className="business-form" onSubmit={submit}><label>Entry type<select value={mode} onChange={(event) => { setMode(event.target.value as EntryMode); setNotice(""); setName(""); }}><option value="product">Add / update product</option><option value="sale" disabled={!realProducts.length}>Record a sale</option><option value="return" disabled={!realProducts.length}>Record a return</option><option value="expense">Record an expense</option></select></label><label>{mode === "expense" ? "Expense category" : "Product name"}{["sale", "return"].includes(mode) ? <select value={name} onChange={(event) => setName(event.target.value)} required><option value="">Choose a saved product</option>{realProducts.map((product) => <option key={product.id} value={product.name}>{product.name} · cost {money(product.unit_cost_minor)} · sells {money(product.unit_price_minor)}</option>)}</select> : <input value={name} onChange={(event) => setName(event.target.value)} placeholder={mode === "expense" ? "e.g. Rent, packaging, wages" : "e.g. Tea packs"} required/>}</label>{mode === "product" && <><label>Cost per unit (₹)<input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="18.00" required/></label><label>Selling price per unit (₹)<input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="25.00" required/></label></>}{(mode === "sale" || mode === "return") && <label>{mode === "sale" ? "Units sold" : `Units returned (up to ${returnableUnits})`}<input type="number" min="1" max={mode === "return" ? returnableUnits : 1000000} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>}{mode === "sale" && <><label>Discount on this sale (₹)<input type="number" min="0" max={selectedProduct ? selectedProduct.unit_price_minor * Number(quantity) / 100 : undefined} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)}/></label><label>Payment / delivery fees (₹)<input type="number" min="0" step="0.01" value={saleFees} onChange={(event) => setSaleFees(event.target.value)}/></label></>}{mode === "return" && <label>Refund paid (₹)<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Actual refund amount" required/></label>}{mode === "expense" && <label>Expense amount (₹)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1500.00" required/></label>}{mode !== "product" && <label>Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder={mode === "sale" ? "Invoice or customer note" : mode === "return" ? "Return reason / reference" : "Details"}/></label>}{notice && <p className="business-form-notice" role="status">{notice}</p>}<button className="business-primary" disabled={!canSave || saving}><Plus size={16}/>{saving ? "Saving…" : !canSave ? "Sign in to save" : modeName}</button></form></article>
      <article className="panel"><div className="panel-header"><div><h3>Products &amp; unit margins</h3><p>{sample ? "Illustrative product costs and prices · sample only" : "Saved unit costs and selling prices used to calculate gross profit"}</p></div><Boxes size={17}/></div>{products.map((product) => <div className="contact-row" key={product.id ?? product.name}><span className="contact-avatar"><Boxes size={15}/></span><div><strong>{product.name}</strong><small>Cost {money(product.unit_cost_minor)} · sells {money(product.unit_price_minor)}</small></div><b className={product.unit_price_minor > product.unit_cost_minor ? "settled" : "owed"}>{product.unit_price_minor > product.unit_cost_minor ? `${((product.unit_price_minor - product.unit_cost_minor) / product.unit_price_minor * 100).toFixed(1)}% margin` : "Review price"}</b></div>)}{sample && <p className="business-footnote">Sample products are examples only. Add your products and real costs to replace them.</p>}</article></div>

    <article className="panel"><div className="panel-header"><div><h3>{sample ? "Sample profit breakdown" : "Your 7-day profit breakdown"}</h3><p>Sales ledger shows discounts, refunds, product costs, payment fees and operating expenses.</p></div></div><div className="profit-breakdown"><div><span>Gross sales before discounts</span><b>{money(grossSales)}</b></div><div><span>Discounts</span><b>−{money(discounts)}</b></div><div><span>Customer refunds</span><b>−{money(refunds)}</b></div><div className="total"><span>Net sales</span><b>{money(revenue)}</b></div><div><span>Cost of goods sold (net of returns)</span><b>−{money(costOfGoods)}</b></div><div><span>Payment / delivery fees</span><b>−{money(paymentFees)}</b></div><div><span>Operating expenses</span><b>−{money(enteredExpenses)}</b></div><div className="total profit"><span>Estimated net profit</span><b>{money(netProfit)}</b></div></div>{sample ? <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Sample day</th><th>Net sales</th><th>Discounts / refunds</th><th>COGS</th><th>Fees + expenses</th><th>Profit</th></tr></thead><tbody>{DEMO_PROFIT_DAILY.map((day)=><tr key={day.label}><td>{day.label} · {day.count} payments</td><td>{money(day.amountMinor)}</td><td>−{money(day.discountsMinor + day.refundsMinor)}</td><td>−{money(day.cogsMinor - day.returnedCogsMinor)}</td><td>−{money(day.feesMinor + day.expensesMinor)}</td><td>{money(day.profitMinor)}</td></tr>)}</tbody></table></div> : <div className="recent-sale-ledger">{records.filter((record)=>["inventory_sale","customer_purchase","inventory_return","expense_recorded"].includes(record.kind)).slice().reverse().slice(0,6).map((record)=><div className="cashflow-row" key={record.id}><span className="cashflow-icon">{record.kind==="inventory_return"?<Undo2 size={15}/>:<Boxes size={15}/>}</span><div><strong>{record.name} · {(record.kind==="inventory_sale"||record.kind==="customer_purchase")?"Sale":record.kind==="inventory_return"?"Return":"Expense"}{record.customer_name?` · ${record.customer_name}`:""}</strong><small>{record.quantity??""} {record.quantity?"units · ":""}{new Date(record.occurred_at).toLocaleDateString("en-IN")}{record.discount_minor?` · discount ${money(record.discount_minor)}`:""}{record.fees_minor?` · fees ${money(record.fees_minor)}`:""}{record.note?` · ${record.note}`:""}</small></div><b>{money(record.amount_minor)}</b></div>)}</div>}</article>

    <div className="business-two-col"><article className="panel"><div className="panel-header"><div><h3>Profit trend</h3><p>{sample ? "Illustrative daily net profit · sample only" : "Daily profit after returns, fees and entered expenses · last 7 days"}</p></div><ChartNoAxesCombined size={17}/></div>{trend.length ? <div className="business-bars profit-bars">{trend.map((profit, index) => { const day = new Date(firstDay); day.setDate(firstDay.getDate() + index); const label = sample ? DEMO_PROFIT_DAILY[index]?.label.split(" ")[0] ?? "Day" : day.toLocaleDateString("en-IN", { weekday: "short" }); return <div key={`${label}-${index}`}><span>{money(profit)}</span><i className={profit < 0 ? "loss" : ""} style={{ height: `${Math.max(8, Math.abs(profit) / maxTrend * 68)}%` }} title={`${label}: ${money(profit)}`}/><small>{label}</small></div>; })}</div> : <p className="business-empty">Record product sales to see daily profit here.</p>}</article>
      <article className="panel"><div className="panel-header"><div><h3>Next 7-day sales target</h3><p>{sample ? "Based on sample sales; replace with your own records" : "A simple target based on the last 7 recorded days"}</p></div><Activity size={17}/></div><div className="target-value">{money(targetRevenue)}</div><label className="target-lift">Raise target by <input type="number" min="0" max="500" value={targetLift} onChange={(event) => setTargetLift(event.target.value)}/> %</label><p className="business-footnote">This target is a planning scenario, not a forecast or guarantee. Adjust it for your demand, promotions and seasonality.</p></article></div>

    <article className="panel"><div className="panel-header"><div><h3>Can profit cover a loan EMI?</h3><p>Compare your entered profit run-rate with an estimated monthly repayment.</p></div></div><div className="loan-planner"><label>Loan amount (₹)<input type="number" min="1" step="0.01" value={loanAmount} onChange={(event) => setLoanAmount(event.target.value)} placeholder="100000"/></label><label>Annual rate (%)<input type="number" min="0" max="1000" step="0.01" value={loanRate} onChange={(event) => setLoanRate(event.target.value)}/></label><label>Term (months)<input type="number" min="1" max="600" step="1" value={loanMonths} onChange={(event) => setLoanMonths(event.target.value)}/></label><div><small>Estimated monthly EMI</small><strong>{emi ? money(emi) : "—"}</strong></div><div><small>Monthly profit run-rate</small><strong>{sample || sales.length ? money(Math.round(avgMonthlyProfit)) : "—"}</strong></div><div><small>Profit / EMI coverage</small><strong>{emi && (sample || sales.length) ? `${loanCoverage.toFixed(2)}×` : "—"}</strong></div></div><p className="business-footnote">{!emi ? "Enter a loan amount, rate and term to compare its estimated EMI with your profit." : !sales.length && !sample ? "No sales baseline yet. Record sales before using this comparison." : avgMonthlyProfit <= 0 ? "Recorded net profit is not positive; this history does not support taking on a new EMI." : loanCoverage < 1 ? "Recorded profit run-rate is below this estimated EMI. The payment may be difficult to cover." : loanCoverage < 2 ? "The estimated payment uses a large share of the recorded profit. Check rent, household needs, seasonality and other debts." : "The estimated EMI is below the recorded profit run-rate, but this is not an eligibility decision. Keep a cash buffer and confirm lender terms."}</p><button type="button" className="business-primary advice-button" disabled={adviceLoading || !canSave} onClick={() => void askAdvice()}><Sparkles size={16}/>{adviceLoading ? "Saathi is reviewing your figures…" : "Ask Saathi AI for guidance"}</button><small className="business-footnote">Your saved figures are sent to the configured AI provider only when you press this button. {sample ? "The analysis will be labeled as sample data." : "The AI can explain, not approve a loan or guarantee profit."}</small>{advice && <div className="business-ai-advice" role="status"><strong>Saathi’s guidance</strong><p>{advice}</p></div>}</article>
  </section>;
}

function Metric({ label, value, caption }: { label: string; value: string; caption: string }) { return <article className="metric-card"><div className="metric-head">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{caption}</div></article>; }
