"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Activity, Boxes, ChartNoAxesCombined, CircleAlert, PackagePlus, Plus, Sparkles } from "lucide-react";
import type { FinanceRecord } from "@/lib/api";
import { api } from "@/lib/api";
import type { Locale } from "@/lib/locale";

type Draft = Omit<FinanceRecord, "id" | "occurred_at">;
type EntryMode = "product" | "sale" | "adjustment" | "expense";
const money = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(minor / 100);
const rupeesToMinor = (value: string) => Math.round(Number(value) * 100);
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const demoProducts = [
  { id: "demo-tea", name: "Tea packs", quantity: 32, unit_cost_minor: 1200, unit_price_minor: 2000 },
  { id: "demo-notebooks", name: "Notebooks", quantity: 24, unit_cost_minor: 2800, unit_price_minor: 4500 },
  { id: "demo-snacks", name: "Snack boxes", quantity: 15, unit_cost_minor: 3500, unit_price_minor: 5200 },
];
const demoProfitByDay = [43000, 56000, 39000, 71000, 48000, 62000, 84000];

export function OperationsPage({ records, canSave, onAdd, locale }: { records: FinanceRecord[]; canSave: boolean; onAdd: (record: Draft) => Promise<void>; locale: Locale }) {
  const [mode, setMode] = useState<EntryMode>("product");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [advice, setAdvice] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [targetLift, setTargetLift] = useState("10");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanRate, setLoanRate] = useState("12");
  const [loanMonths, setLoanMonths] = useState("12");

  const productEntries = records.filter((record) => record.kind === "inventory_item").slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const realProducts = useMemo(() => {
    const latest = new Map<string, FinanceRecord>();
    for (const record of productEntries) latest.set(record.name.trim().toLocaleLowerCase(), record);
    return [...latest.values()].map((item) => {
      const key = item.name.trim().toLocaleLowerCase();
      const restocked = records.filter((record) => record.kind === "inventory_adjustment" && record.name.trim().toLocaleLowerCase() === key).reduce((total, record) => total + (record.quantity_delta ?? 0), 0);
      const sold = records.filter((record) => record.kind === "inventory_sale" && record.name.trim().toLocaleLowerCase() === key).reduce((total, record) => total + (record.quantity ?? 0), 0);
      return { id: item.id, name: item.name, quantity: Math.max(0, (item.quantity ?? 0) + restocked - sold), unit_cost_minor: item.unit_cost_minor ?? 0, unit_price_minor: item.unit_price_minor ?? 0 };
    });
  }, [productEntries, records]);
  const sample = realProducts.length === 0;
  const products = sample ? demoProducts : realProducts;
  const selectedProduct = products.find((product) => product.name === name);
  const now = new Date();
  const firstDay = new Date(now); firstDay.setDate(now.getDate() - 6); firstDay.setHours(0, 0, 0, 0);
  const sales = records.filter((record) => record.kind === "inventory_sale" && new Date(record.occurred_at) >= firstDay);
  const expenses = records.filter((record) => record.kind === "expense_recorded" && new Date(record.occurred_at) >= firstDay);
  const revenue = sample ? 642000 : sales.reduce((total, record) => total + record.amount_minor, 0);
  const costOfGoods = sample ? 352000 : sales.reduce((total, record) => total + (record.unit_cost_minor ?? 0) * (record.quantity ?? 0), 0);
  const enteredExpenses = sample ? 91000 : expenses.reduce((total, record) => total + record.amount_minor, 0);
  const grossProfit = revenue - costOfGoods;
  const netProfit = grossProfit - enteredExpenses;
  const margin = revenue > 0 ? grossProfit / revenue * 100 : 0;
  const stockValue = products.reduce((total, product) => total + product.quantity * product.unit_cost_minor, 0);
  const targetRevenue = Math.round(revenue * (1 + Math.max(0, Number(targetLift) || 0) / 100));
  const trend = sample ? demoProfitByDay : Array.from({ length: 7 }, (_, index) => {
    const day = new Date(firstDay); day.setDate(firstDay.getDate() + index); const key = dateKey(day);
    const daySales = sales.filter((record) => dateKey(new Date(record.occurred_at)) === key);
    const dayExpenses = expenses.filter((record) => dateKey(new Date(record.occurred_at)) === key).reduce((total, record) => total + record.amount_minor, 0);
    return daySales.reduce((total, record) => total + record.amount_minor - (record.unit_cost_minor ?? 0) * (record.quantity ?? 0), 0) - dayExpenses;
  });
  const maxTrend = Math.max(1, ...trend.map(Math.abs));
  const avgMonthlyProfit = netProfit * 30 / 7;
  const principalMinor = rupeesToMinor(loanAmount);
  const rate = Math.max(0, Number(loanRate) || 0) / 100 / 12;
  const term = Math.max(1, Number(loanMonths) || 1);
  const emi = principalMinor > 0 ? Math.round(rate === 0 ? principalMinor / term : principalMinor * rate * Math.pow(1 + rate, term) / (Math.pow(1 + rate, term) - 1)) : 0;
  const loanCoverage = emi > 0 ? avgMonthlyProfit / emi : 0;
  const stockoutItems = products.filter((product) => product.quantity <= 5).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const units = Number(quantity);
    let entry: Draft;
    if (!name.trim()) { setNotice("Enter or select an item name."); return; }
    if (mode === "product") {
      const unitCost = rupeesToMinor(cost); const unitPrice = rupeesToMinor(price);
      if (!Number.isInteger(units) || units < 0 || unitCost < 0 || unitPrice <= 0) { setNotice("Enter valid stock, cost, and selling price."); return; }
      const previous = realProducts.find((product) => product.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
      entry = { kind: "inventory_item", name: name.trim(), phone: null, amount_minor: 0, quantity: previous?.quantity ?? units, unit_cost_minor: unitCost, unit_price_minor: unitPrice, due_date: null, related_record_id: null, note: null };
    } else if (mode === "adjustment") {
      if (!realProducts.some((product) => product.name === name) || !Number.isInteger(units) || units === 0) { setNotice("Select a saved item and enter a non-zero stock change."); return; }
      if (selectedProduct && selectedProduct.quantity + units < 0) { setNotice(`Stock change would take ${name} below zero.`); return; }
      entry = { kind: "inventory_adjustment", name, phone: null, amount_minor: 0, quantity_delta: units, due_date: null, related_record_id: null, note: note.trim() || null };
    } else if (mode === "sale") {
      if (!realProducts.some((product) => product.name === name) || !Number.isInteger(units) || units <= 0 || !selectedProduct) { setNotice("Select a saved product and enter a whole number of units."); return; }
      if (units > selectedProduct.quantity) { setNotice(`Only ${selectedProduct.quantity} ${name} in stock.`); return; }
      entry = { kind: "inventory_sale", name, phone: null, amount_minor: selectedProduct.unit_price_minor * units, quantity: units, unit_cost_minor: selectedProduct.unit_cost_minor, unit_price_minor: selectedProduct.unit_price_minor, due_date: null, related_record_id: null, note: note.trim() || null };
    } else {
      const expense = rupeesToMinor(amount);
      if (expense <= 0) { setNotice("Enter a positive expense amount."); return; }
      entry = { kind: "expense_recorded", name: name.trim(), phone: null, amount_minor: expense, due_date: null, related_record_id: null, note: note.trim() || null };
    }
    setSaving(true); setNotice("Saving to your account…");
    try { await onAdd(entry); setNotice(mode === "product" ? "Inventory item saved." : mode === "sale" ? "Sale saved and stock reduced." : mode === "adjustment" ? "Stock adjustment saved." : "Expense saved."); setName(""); setQuantity("1"); setCost(""); setPrice(""); setAmount(""); setNote(""); }
    catch (error) { console.error("Could not save inventory entry", error); setNotice("Could not save this entry. Check the connection and retry; nothing was recorded."); }
    finally { setSaving(false); }
  }

  async function askAdvice() {
    setAdviceLoading(true); setAdvice("");
    const facts = { sample_data: sample, seven_day_revenue_minor: revenue, seven_day_cost_of_goods_minor: costOfGoods, seven_day_expenses_minor: enteredExpenses, seven_day_net_profit_minor: netProfit, gross_margin_percent: Number(margin.toFixed(1)), suggested_next_seven_day_sales_target_minor: targetRevenue, stockout_items: products.filter((product) => product.quantity <= 5).map((product) => ({ name: product.name, remaining_units: product.quantity })), monthly_profit_run_rate_minor: Math.round(avgMonthlyProfit), loan_scenario: { principal_minor: principalMinor, annual_rate_percent: Number(loanRate) || 0, duration_months: term, estimated_monthly_payment_minor: emi, profit_to_payment_ratio: Number(loanCoverage.toFixed(2)) } };
    try { const result = await api.chat([{ role: "user", content: `Give concise, cautious business guidance in the same language as the interface preference. Use only these figures; clearly label sample data. Explain profit and margin, suggest a next-week sales target, identify stock priorities, and comment on whether this loan scenario appears affordable from the recorded profit. If records are insufficient, say what is missing. Do not claim loan eligibility or guarantee outcomes. Facts: ${JSON.stringify(facts)}` }], locale); setAdvice(result.answer); }
    catch { setAdvice("Saathi’s AI provider did not respond. The figures below remain local calculations from your entries; enter real sales, costs, and expenses before using them for a decision."); }
    finally { setAdviceLoading(false); }
  }

  const modeName = mode === "product" ? "Add / update item" : mode === "sale" ? "Record a sale" : mode === "adjustment" ? "Adjust stock" : "Record an expense";
  return <section className="business-page">
    <header className="business-heading"><div><div className="eyebrow"><Boxes size={15}/> PAYTM SAATHI</div><h1>Inventory &amp; profit planner</h1><p>Track stock and sales, see recorded profit, plan a sales target, and test a loan EMI against your cash earnings.</p></div><span className="business-demo-tag">{sample ? "SAMPLE STARTER DATA" : "YOUR SAVED RECORDS"}</span></header>
    <div className="business-notice"><CircleAlert size={17}/><span><strong>{sample ? "Starter examples are illustrative" : "Profit uses your saved entries"}</strong><small>{sample ? "Add your own products to replace the sample view. Sample items and charts are never saved to your account." : "Product sales use saved selling prices and costs. Profit is an estimate and excludes costs you have not entered."}</small></span></div>
    <div className="business-metrics"><Metric label="Inventory at cost" value={money(stockValue)} caption={`${products.length} ${sample ? "sample items" : "tracked items"}`}/><Metric label="Sales · last 7 days" value={money(revenue)} caption="Recorded product sales only"/><Metric label="Net profit · last 7 days" value={money(netProfit)} caption="Sales − product cost − entered expenses"/><Metric label="Gross margin" value={sample || revenue ? `${margin.toFixed(1)}%` : "—"} caption="Gross profit ÷ product sales"/></div>

    <div className="business-two-col"><article className="panel"><div className="panel-header"><div><h3>{modeName}</h3><p>Items, stock movements, sales and operating expenses are saved to your account.</p></div></div><form className="business-form" onSubmit={submit}><label>Entry type<select value={mode} onChange={(event) => { setMode(event.target.value as EntryMode); setNotice(""); if (event.target.value === "product") { setName(""); } }}><option value="product">Add / update product</option><option value="sale" disabled={!realProducts.length}>Record a sale</option><option value="adjustment" disabled={!realProducts.length}>Stock adjustment</option><option value="expense">Record an expense</option></select></label><label>{mode === "expense" ? "Expense category" : "Product name"}{mode === "sale" || mode === "adjustment" ? <select value={name} onChange={(event) => setName(event.target.value)} required><option value="">Choose a saved product</option>{realProducts.map((product) => <option key={product.id} value={product.name}>{product.name} · {product.quantity} in stock</option>)}</select> : <input value={name} onChange={(event) => setName(event.target.value)} placeholder={mode === "expense" ? "e.g. Rent, packaging, wages" : "e.g. Tea packs"} required/>}</label>{mode === "product" && <><label>Opening stock (units)<input type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label><label>Cost per unit (₹)<input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="18.00" required/></label><label>Selling price per unit (₹)<input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="25.00" required/></label></>}{mode === "sale" && <label>Units sold<input type="number" min="1" max={selectedProduct?.quantity ?? 0} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>}{mode === "adjustment" && <label>Stock change (+ restock / − correction)<input type="number" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>}{mode === "expense" && <label>Expense amount (₹)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1500.00" required/></label>}{mode !== "product" && <label>Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder={mode === "sale" ? "Invoice or customer note" : "Details"}/></label>}{notice && <p className="business-form-notice" role="status">{notice}</p>}<button className="business-primary" disabled={!canSave || saving}><Plus size={16}/>{saving ? "Saving…" : !canSave ? "Sign in to save" : modeName}</button></form></article>
      <article className="panel"><div className="panel-header"><div><h3>Stock on hand</h3><p>{sample ? "Example stock positions · sample only" : "Opening stock + adjustments − recorded sales"}</p></div><PackagePlus size={17}/></div>{products.map((product) => <div className="contact-row" key={product.id ?? product.name}><span className="contact-avatar"><Boxes size={15}/></span><div><strong>{product.name}</strong><small>{product.quantity} units · cost {money(product.unit_cost_minor)} · sells {money(product.unit_price_minor)} · {product.unit_price_minor > product.unit_cost_minor ? `${((product.unit_price_minor - product.unit_cost_minor) / product.unit_price_minor * 100).toFixed(1)}% gross margin` : "check price"}</small></div><b className={product.quantity <= 5 ? "owed" : "settled"}>{product.quantity <= 5 ? "Low stock" : `${product.quantity} left`}</b></div>)}{sample && <p className="business-footnote">Create your first product above to start recording real stock and sales.</p>}</article></div>

    <div className="business-two-col"><article className="panel"><div className="panel-header"><div><h3>Profit trend</h3><p>{sample ? "Illustrative daily net profit · sample only" : "Daily gross profit less entered expenses · last 7 days"}</p></div><ChartNoAxesCombined size={17}/></div>{trend.length ? <div className="business-bars profit-bars">{trend.map((profit, index) => { const day = new Date(firstDay); day.setDate(firstDay.getDate() + index); const label = sample ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index] : day.toLocaleDateString("en-IN", { weekday: "short" }); return <div key={`${label}-${index}`}><span>{money(profit)}</span><i className={profit < 0 ? "loss" : ""} style={{ height: `${Math.max(8, Math.abs(profit) / maxTrend * 68)}%` }} title={`${label}: ${money(profit)}`}/><small>{label}</small></div>; })}</div> : <p className="business-empty">Record product sales to see daily profit here.</p>}</article>
      <article className="panel"><div className="panel-header"><div><h3>Next 7-day sales target</h3><p>{sample ? "Based on sample sales; replace with your own records" : "A simple target based on the last 7 recorded days"}</p></div><Activity size={17}/></div><div className="target-value">{money(targetRevenue)}</div><label className="target-lift">Raise target by <input type="number" min="0" max="500" value={targetLift} onChange={(event) => setTargetLift(event.target.value)}/> %</label><p className="business-footnote">This target is a planning scenario, not a forecast or guarantee. Use your demand, stock and seasonality to adjust it.</p><div className="business-footnote">Low-stock products: {stockoutItems ? products.filter((product) => product.quantity <= 5).map((product) => product.name).join(", ") : "none based on current records"}</div></article></div>

    <article className="panel"><div className="panel-header"><div><h3>Can profit cover a loan EMI?</h3><p>Compare your entered profit run-rate with an estimated monthly repayment.</p></div></div><div className="loan-planner"><label>Loan amount (₹)<input type="number" min="1" step="0.01" value={loanAmount} onChange={(event) => setLoanAmount(event.target.value)} placeholder="100000"/></label><label>Annual rate (%)<input type="number" min="0" max="1000" step="0.01" value={loanRate} onChange={(event) => setLoanRate(event.target.value)}/></label><label>Term (months)<input type="number" min="1" max="600" step="1" value={loanMonths} onChange={(event) => setLoanMonths(event.target.value)}/></label><div><small>Estimated monthly EMI</small><strong>{emi ? money(emi) : "—"}</strong></div><div><small>Monthly profit run-rate</small><strong>{sample || sales.length ? money(Math.round(avgMonthlyProfit)) : "—"}</strong></div><div><small>Profit / EMI coverage</small><strong>{emi && (sample || sales.length) ? `${loanCoverage.toFixed(2)}×` : "—"}</strong></div></div><p className="business-footnote">{!sales.length && !sample ? "No sales baseline yet. Record sales before using this comparison." : avgMonthlyProfit <= 0 ? "Recorded net profit is not positive; this history does not support taking on a new EMI." : loanCoverage < 1 ? "Recorded profit run-rate is below this estimated EMI. The payment may be difficult to cover." : loanCoverage < 2 ? "The estimated payment uses a large share of the recorded profit. Check rent, household needs, seasonality and other debts." : "The estimated EMI is below the recorded profit run-rate, but this is not an eligibility decision. Keep a cash buffer and confirm lender terms."}</p><button type="button" className="business-primary advice-button" disabled={adviceLoading || !canSave} onClick={() => void askAdvice()}><Sparkles size={16}/>{adviceLoading ? "Saathi is reviewing your figures…" : "Ask Saathi AI for guidance"}</button><small className="business-footnote">Your saved figures are sent to the configured AI provider only when you press this button. {sample ? "The analysis will be labeled as sample data." : "The AI can explain, not approve a loan or guarantee profit."}</small>{advice && <div className="business-ai-advice" role="status"><strong>Saathi’s guidance</strong><p>{advice}</p></div>}</article>
  </section>;
}

function Metric({ label, value, caption }: { label: string; value: string; caption: string }) { return <article className="metric-card"><div className="metric-head">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{caption}</div></article>; }
