"use client";

import { useState, type FormEvent } from "react";
import { Bot, Clipboard, MessageCircle, PackageCheck, Plus, Sparkles, Users } from "lucide-react";
import type { FinanceRecord } from "@/lib/api";
import { api } from "@/lib/api";
import { DEMO_CUSTOMER_PURCHASES, DEMO_INVENTORY_PRODUCTS } from "@/lib/demo-data";
import { getInventoryProducts, type TrackedProduct } from "@/lib/inventory";
import type { Locale } from "@/lib/locale";

type Draft = Omit<FinanceRecord, "id" | "occurred_at">;
type CustomerActivity = { id: string; orders: FinanceRecord[]; lastAt: string; favoriteCategory: string; total: number; avgInterval: number; daysSince: number; risk: number; segment: string; stopped: boolean; offer: string; discountTotal: number; discountRate: number; discountedOrders: number; avgBasket: number; recentSpendDown: boolean; inventory: TrackedProduct | undefined; safeOfferPercent: number; testOfferPercent: number };
const dayMs = 86_400_000;
const money = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);
const now = () => Date.now();
const langName = (locale: Locale) => locale === "hi" ? "Hindi" : locale === "kn" ? "Kannada" : "English";

function findMatchingProduct(category: string, products: TrackedProduct[]) {
  const normalized = category.toLocaleLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").trim();
  return products.find((product) => {
    const name = product.name.toLocaleLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").trim();
    const terms = normalized.split(/\s+/).map((word) => word.replace(/s$/, ""));
    const productTerms = name.split(/\s+/).map((word) => word.replace(/s$/, ""));
    return name === normalized || name.includes(normalized) || normalized.includes(name) || terms.some((word) => word.length > 3 && productTerms.includes(word));
  });
}

export function analyzeCustomerPurchases(records: FinanceRecord[], currentTime: number, products: TrackedProduct[] = []): CustomerActivity[] {
  const grouped = new Map<string, FinanceRecord[]>();
  records.filter((record) => record.kind === "customer_purchase").forEach((record) => {
    const customer = record.customer_name?.trim() || record.name;
    grouped.set(customer, [...(grouped.get(customer) ?? []), record]);
  });
  return [...grouped.entries()].map(([id, orders]) => {
    const sorted = orders.slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const intervals = sorted.slice(1).map((order, index) => (new Date(order.occurred_at).getTime() - new Date(sorted[index].occurred_at).getTime()) / dayMs);
    const avgInterval = intervals.length ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length : 14;
    const last = sorted[sorted.length - 1];
    const daysSince = Math.max(0, Math.floor((currentTime - new Date(last.occurred_at).getTime()) / dayMs));
    const ratio = daysSince / Math.max(7, avgInterval);
    const risk = Math.max(5, Math.min(95, Math.round(sorted.length < 2 ? (daysSince > 21 ? 78 : daysSince > 10 ? 48 : 25) : (ratio - 0.7) * 40 + 25)));
    const categories = new Map<string, number>();
    for (const order of sorted) { const category = order.category?.trim() || order.name; categories.set(category, (categories.get(category) ?? 0) + (order.quantity ?? 1)); }
    const favoriteCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "their usual items";
    const discountTotal = sorted.reduce((sum, order) => sum + (order.discount_minor ?? 0), 0);
    const grossTotal = sorted.reduce((sum, order) => sum + order.amount_minor + (order.discount_minor ?? 0), 0);
    const discountedOrders = sorted.filter((order) => (order.discount_minor ?? 0) > 0).length;
    const split = Math.floor(sorted.length / 2);
    const earlier = sorted.slice(0, split);
    const recent = sorted.slice(split);
    const avg = (rows: FinanceRecord[]) => rows.length ? rows.reduce((sum, order) => sum + order.amount_minor, 0) / rows.length : 0;
    const recentSpendDown = sorted.length >= 4 && avg(recent) < avg(earlier) * 0.85;
    const inventory = findMatchingProduct(favoriteCategory, products);
    const marginPercent = inventory?.unit_price_minor ? Math.max(0, (inventory.unit_price_minor - inventory.unit_cost_minor) / inventory.unit_price_minor * 100) : 0;
    const safeOfferPercent = inventory && inventory.quantity > 0 ? Math.min(10, Math.max(0, Math.floor(marginPercent - 5))) : 0;
    const discountRate = grossTotal ? discountTotal / grossTotal * 100 : 0;
    const testOfferPercent = safeOfferPercent > 0 ? Math.min(safeOfferPercent, Math.max(5, Math.ceil(discountRate + 3))) : 0;
    const offer = inventory && inventory.quantity <= 0
      ? `Pause discounts on ${favoriteCategory} until stock is replenished; ${inventory.name} is out of stock.`
      : inventory && inventory.quantity <= 5
        ? `Only ${inventory.quantity} ${inventory.name} remain. Replenish first; avoid a promotion that could sell out.`
        : safeOfferPercent > 0 && (risk >= 60 || recentSpendDown)
          ? "Test a " + testOfferPercent + "% comeback offer on " + favoriteCategory + (discountRate > 0 && testOfferPercent > discountRate ? " (above their " + discountRate.toFixed(1) + "% historical average)" : "") + "; never exceed the " + safeOfferPercent + "% margin-based cap. Compare with a no-discount group before increasing it."
          : inventory
            ? `Their most frequent category is ${favoriteCategory}. Try a relevant bundle or reminder; tracked stock is ${inventory.quantity} units and margin does not support a discount safely.`
            : `Their most frequent category is ${favoriteCategory}. Try a relevant reminder or bundle; add a matching stocked item and cost before recommending discounts.`;
    return {
      id, orders: sorted, lastAt: last.occurred_at, favoriteCategory,
      total: sorted.reduce((sum, order) => sum + order.amount_minor, 0),
      avgBasket: sorted.reduce((sum, order) => sum + order.amount_minor, 0) / sorted.length,
      avgInterval, daysSince, risk,
      segment: sorted.length === 1 ? "New" : risk >= 60 ? "At risk" : risk >= 35 ? "Watch" : "Regular",
      stopped: daysSince >= Math.max(21, avgInterval * 2) || risk >= 75,
      offer, discountTotal, discountRate, discountedOrders,
      recentSpendDown, inventory, safeOfferPercent, testOfferPercent,
    };
  }).sort((a, b) => b.risk - a.risk || b.total - a.total);
}

export function CustomerRetention({ records, canSave, onAdd, locale }: { records: FinanceRecord[]; canSave: boolean; onAdd: (record: Draft) => Promise<void>; locale: Locale }) {
  const [customerName, setCustomerName] = useState(""); const [productId, setProductId] = useState(""); const [category, setCategory] = useState(""); const [amount, setAmount] = useState(""); const [quantity, setQuantity] = useState("1"); const [discount, setDiscount] = useState("0");
  const [notice, setNotice] = useState(""); const [saving, setSaving] = useState(false); const [generating, setGenerating] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [insights, setInsights] = useState<Record<string, string>>({}); const [message, setMessage] = useState("");
  const savedPurchases = records.filter((record) => record.kind === "customer_purchase");
  const sample = savedPurchases.length === 0;
  const purchases = sample ? DEMO_CUSTOMER_PURCHASES : savedPurchases;
  const inventoryRecords = getInventoryProducts(records);
  const inventory = sample ? DEMO_INVENTORY_PRODUCTS : inventoryRecords;
  const productsForForm = inventoryRecords;
  const people = analyzeCustomerPurchases(purchases, now(), inventory);
  const churned = people.filter((person) => person.stopped);
  const atRisk = people.filter((person) => person.risk >= 60);
  const repeated = people.filter((person) => person.orders.length > 1).length;
  const topCustomers = people.slice().sort((a, b) => b.total - a.total).slice(0, 3);
  const selectedProduct = productsForForm.find((product) => product.id === productId);
  const units = Math.max(0, Number(quantity) || 0);
  const grossMinor = selectedProduct ? selectedProduct.unit_price_minor * units : Math.round(Number(amount) * 100);
  const discountMinor = Math.round(Number(discount) * 100);

  async function addPurchase(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    if (!customerName.trim() || !category.trim() || !Number.isInteger(units) || units <= 0 || !Number.isFinite(grossMinor) || grossMinor <= 0 || !Number.isFinite(discountMinor) || discountMinor < 0 || discountMinor > grossMinor) { setNotice("Enter a customer name, category, valid purchase amount and a discount no greater than the item total."); return; }
    if (selectedProduct && units > selectedProduct.quantity) { setNotice(`Only ${selectedProduct.quantity} ${selectedProduct.name} are in stock. Restock before recording more.`); return; }
    setSaving(true); setNotice("Saving purchase and updating linked stock…");
    try {
      await onAdd({ kind: "customer_purchase", name: selectedProduct?.name || category.trim(), customer_name: customerName.trim(), phone: null, amount_minor: grossMinor - discountMinor, discount_minor: discountMinor, quantity: units, category: category.trim(), related_record_id: selectedProduct?.id || null, unit_cost_minor: selectedProduct?.unit_cost_minor ?? null, unit_price_minor: selectedProduct?.unit_price_minor ?? null, due_date: null, note: null });
      setNotice(selectedProduct ? "Purchase saved, customer totals updated, and stock reduced." : "Purchase saved to customer history. No inventory item was linked, so stock was unchanged.");
      setCustomerName(""); setProductId(""); setCategory(""); setAmount(""); setQuantity("1"); setDiscount("0");
    } catch { setNotice("Could not save the purchase. Check your connection and try again."); }
    finally { setSaving(false); }
  }

  async function generateDraft(person: CustomerActivity) {
    setGenerating(person.id); setMessage("");
    const prompt = `Write a warm, concise re-engagement message in ${langName(locale)} for ${person.id}. They most often buy ${person.favoriteCategory}, have ${person.orders.length} visits, last visited ${person.daysSince} days ago. Suggested offer ceiling: ${person.safeOfferPercent} percent, based on available stock margin; if 0, make no discount promise. Avoid inventing products, availability, or a larger offer. Return only a draft; do not send it.`;
    try { const result = await api.chat([{ role: "user", content: prompt }], locale); setDrafts((items) => ({ ...items, [person.id]: result.answer })); }
    catch { setDrafts((items) => ({ ...items, [person.id]: `Hi ${person.id.split(" ")[0]}! We’ve missed seeing you. Your favourites in ${person.favoriteCategory} are waiting at our shop. Ask us about this week’s special.` })); setMessage("AI draft service was unavailable; showing a local message template instead."); }
    finally { setGenerating(""); }
  }

  async function generateInsight(person: CustomerActivity) {
    setGenerating(person.id); setMessage("");
    const evidence = { visits: person.orders.length, favorite_category: person.favoriteCategory, total_spend_minor: person.total, days_since_visit: person.daysSince, typical_return_interval_days: Math.round(person.avgInterval), recent_purchase_value_down: person.recentSpendDown, discounted_visits: person.discountedOrders, discount_total_minor: person.discountTotal, average_discount_rate_percent: Number(person.discountRate.toFixed(1)), matched_stock_units: person.inventory?.quantity ?? null, estimated_unit_cost_minor: person.inventory?.unit_cost_minor ?? null, estimated_unit_price_minor: person.inventory?.unit_price_minor ?? null, safe_offer_ceiling_percent: person.safeOfferPercent, suggested_test_discount_percent: person.testOfferPercent };
    const prompt = `In ${langName(locale)}, explain what this customer seems to prefer and give one practical, inventory-aware retention experiment. Separate observed facts from possible reasons; a discount and a purchase occurring together do not prove the discount caused it. If purchase value is falling and a safe offer is available, suggest testing a discount slightly above their historical average but no higher than the safe offer ceiling, with a no-discount comparison. Say the reason for a decline is unknown. Never recommend exceeding the safe offer ceiling or promoting out-of-stock goods. Keep to 3 short sentences. Facts: ${JSON.stringify(evidence)}`;
    try { const result = await api.chat([{ role: "user", content: prompt }], locale); setInsights((items) => ({ ...items, [person.id]: result.answer })); }
    catch { setInsights((items) => ({ ...items, [person.id]: `Observed: ${person.favoriteCategory} is the most frequent category across ${person.orders.length} visits. ${person.recentSpendDown ? "Purchase value has fallen in the latest recorded visits, but these records cannot show why; test an offer against a no-discount comparison." : "There is not enough evidence to know what causes repeat visits."} ${person.inventory ? `${person.inventory.quantity} units are tracked; the margin-aware discount ceiling is ${person.safeOfferPercent}%.` : "Add a matching product with cost and stock to calculate a safe offer."}` })); setMessage("AI insight service was unavailable; showing the evidence-based summary instead."); }
    finally { setGenerating(""); }
  }

  async function copyDraft(person: CustomerActivity) {
    const content = drafts[person.id] ?? `Hi ${person.id.split(" ")[0]}! We’ve missed seeing you. Your favourites in ${person.favoriteCategory} are waiting at our shop. Ask us about this week’s special.`;
    try { await navigator.clipboard.writeText(content); setMessage(`Draft for ${person.id} copied. Review before sending.`); }
    catch { setMessage("Copy was blocked by the browser. Select and copy the draft text manually."); }
  }

  return <section className="retention-section">
    <header className="business-heading"><div><div className="eyebrow"><Users size={15}/> CUSTOMER RETENTION</div><h2>Re-engage customers</h2><p>Rank your best customers, spot changes in repeat visits, and plan inventory-safe offers.</p></div><span className="business-demo-tag">{sample ? "MOCK CUSTOMER DATA" : "SAVED PURCHASE HISTORY"}</span></header>
    <div className="business-notice"><Bot size={17}/><span><strong>{sample ? "Illustrative sample · fictional customer names and discount history" : "Private, saved purchase activity"}</strong><small>{sample ? "Names, purchases, discounts and stock below are mock examples only, not real Paytm data." : "Churn scores are estimates from recorded recency and visit intervals. Causes are hypotheses; no campaign is sent."}</small></span></div>
    <div className="business-metrics"><Metric label="Customers analysed" value={String(people.length)} caption={sample ? "Fictional sample names" : "From saved purchase records"}/><Metric label="May have stopped visiting" value={String(churned.length)} caption="Past expected return interval"/><Metric label="Higher churn risk" value={String(atRisk.length)} caption="Estimated score 60% or higher"/><Metric label="Repeat customers" value={String(repeated)} caption="At least two recorded visits"/></div>
    <article className="panel top-customers-panel"><div className="panel-header"><div><h3>Top customers by purchases</h3><p>Ranked by recorded net purchase spend. Discounts are shown separately.</p></div><Sparkles size={17}/></div><div className="top-customer-grid">{topCustomers.map((person, index) => <div className="top-customer-card" key={person.id}><div className="retention-head"><div><span className="top-rank">#{index + 1}</span><strong>{person.id}</strong></div><b>{money(person.total)}</b></div><div className="retention-facts"><span>{person.orders.length} visits</span><span>Prefers {person.favoriteCategory}</span></div><small>{person.discountedOrders ? `${person.discountedOrders} discounted visits · ${money(person.discountTotal)} discount total (${person.discountRate.toFixed(1)}% of gross)` : "No discount used in recorded visits"}</small></div>)}</div></article>
    <div className="business-two-col retention-layout"><article className="panel"><div className="panel-header"><div><h3>Customer activity &amp; tailored offers</h3><p>Purchase decreases are visible; the cause is not assumed. Offer ceiling uses tracked product margin.</p></div></div>{people.map((person) => <div className="retention-card" key={person.id}><div className="retention-head"><div><strong>{person.id}</strong><span className={`retention-segment ${person.risk >= 60 ? "risk" : person.risk >= 35 ? "watch" : "regular"}`}>{person.segment}</span></div><b>{person.risk}% risk</b></div><div className="retention-facts"><span>{person.orders.length} visits</span><span>Last visit {person.daysSince} days ago</span><span>Typical gap {Math.round(person.avgInterval)} days</span><span>Spend {money(person.total)}</span></div><p className="retention-offer"><b>Preference:</b> buys {person.favoriteCategory} most often. {person.recentSpendDown ? "Recent purchase value is down; why is not established." : "No clear drop in recent purchase value from this short history."}</p><p className="retention-offer"><b>Offer / inventory:</b> {person.offer}{person.inventory ? ` Stock: ${person.inventory.quantity} ${person.inventory.name} at ${money(person.inventory.unit_price_minor)} each.` : ""}</p><small className="retention-discount-history">Discount history: {person.discountedOrders} of {person.orders.length} visits had discounts · {money(person.discountTotal)} total · {person.discountRate.toFixed(1)}% average of gross sales. This alone does not prove discount effectiveness.</small>{insights[person.id] && <div className="retention-draft" role="status">{insights[person.id]}</div>}<div className="retention-draft">{drafts[person.id] ?? `Hi ${person.id.split(" ")[0]}! We’ve missed seeing you. Your favourites in ${person.favoriteCategory} are waiting at our shop. Ask us about this week’s special.`}</div><div className="retention-actions"><button type="button" disabled={generating === person.id} onClick={() => void generateInsight(person)}><Sparkles size={14}/>{generating === person.id ? "Thinking…" : "Ask AI what attracts them"}</button><button type="button" disabled={generating === person.id} onClick={() => void generateDraft(person)}><Bot size={14}/>{generating === person.id ? "Generating…" : "Generate message"}</button><button type="button" onClick={() => void copyDraft(person)}><Clipboard size={14}/> Copy draft</button></div></div>)}</article>
      <article className="panel"><div className="panel-header"><div><h3>Record a customer purchase</h3><p>Link a saved product to deduct stock and include the sale in your profit reports.</p></div><Plus size={17}/></div><form className="business-form retention-form" onSubmit={addPurchase}><label>Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="e.g. Asha Rao" required/></label><label>Link inventory item (optional)<select value={productId} onChange={(event) => { const product = productsForForm.find((item) => item.id === event.target.value); setProductId(event.target.value); if (product) setCategory(product.name); }}><option value="">Manual category only · no stock change</option>{productsForForm.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.quantity} in stock · {money(product.unit_price_minor)}</option>)}</select></label><label>Product / category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Snacks" required/></label><label>Quantity<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>{selectedProduct ? <p className="retention-price-preview">Gross price {money(grossMinor)} · tracked cost {money((selectedProduct.unit_cost_minor || 0) * units)} · stock after sale {Math.max(0, selectedProduct.quantity - units)}</p> : <label>Purchase total before discount (₹)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="250.00" required/></label>}<label>Discount given (₹)<input type="number" min="0" max={grossMinor > 0 ? grossMinor / 100 : undefined} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} required/></label>{grossMinor > 0 && <p className="retention-price-preview">Net purchase recorded: {money(grossMinor - discountMinor)} · discount: {money(discountMinor)}</p>}{notice && <p className="business-form-notice" role="status">{notice}</p>}<button className="business-primary" disabled={!canSave || saving || !!(selectedProduct && units > selectedProduct.quantity)}><Plus size={15}/>{saving ? "Saving…" : canSave ? "Save purchase and update" : "Sign in to save"}</button></form>{selectedProduct ? <p className="business-footnote"><PackageCheck size={14}/> This linked purchase updates customer history, available inventory and recorded sales/profit.</p> : <p className="business-footnote">Category-only purchases update customer insights, but cannot change stock or inventory profit. Select a saved product to link inventory.</p>}{message && <p className="business-form-notice" role="status">{message}</p>}</article></div>
    <p className="business-footnote"><MessageCircle size={14}/> Re-engagement drafts are for merchant review only. Discounts are capped by tracked item margin with a buffer. The app never sends a campaign.</p>
  </section>;
}

function Metric({ label, value, caption }: { label: string; value: string; caption: string }) { return <article className="metric-card"><div className="metric-head">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{caption}</div></article>; }
