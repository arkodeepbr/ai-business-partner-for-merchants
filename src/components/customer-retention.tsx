"use client";

import { useState, type FormEvent } from "react";
import { Bot, Clipboard, MessageCircle, Plus, Users } from "lucide-react";
import type { FinanceRecord } from "@/lib/api";
import { api } from "@/lib/api";
import { DEMO_CUSTOMER_PURCHASES } from "@/lib/demo-data";
import type { Locale } from "@/lib/locale";

type Draft = Omit<FinanceRecord, "id" | "occurred_at">;
type CustomerActivity = { id: string; orders: FinanceRecord[]; lastAt: string; lastCategory: string; total: number; avgInterval: number; daysSince: number; risk: number; segment: string; stopped: boolean; offer: string };
const dayMs = 86_400_000;
const money = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);
const now = () => Date.now();
export function analyzeCustomerPurchases(records: FinanceRecord[], currentTime: number): CustomerActivity[] {
  const grouped = new Map<string, FinanceRecord[]>();
  records.filter((record) => record.kind === "customer_purchase").forEach((record) => grouped.set(record.name, [...(grouped.get(record.name) ?? []), record]));
  const people = [...grouped.entries()].map(([id, orders]) => {
    const sorted = orders.slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const intervals = sorted.slice(1).map((order, index) => (new Date(order.occurred_at).getTime() - new Date(sorted[index].occurred_at).getTime()) / dayMs);
    const avgInterval = intervals.length ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length : 14;
    const last = sorted[sorted.length - 1];
    const daysSince = Math.max(0, Math.floor((currentTime - new Date(last.occurred_at).getTime()) / dayMs));
    const ratio = daysSince / Math.max(7, avgInterval);
    const risk = Math.max(5, Math.min(95, Math.round(sorted.length < 2 ? (daysSince > 21 ? 78 : daysSince > 10 ? 48 : 25) : (ratio - 0.7) * 40 + 25)));
    const lastCategory = last.category?.trim() || "your usual items";
    const offer = risk >= 60 ? `Consider a small comeback offer on ${lastCategory}; verify your product margin before choosing a discount.` : risk >= 35 ? `Try a ${lastCategory} reminder or a relevant bundle. Use a discount only if the margin allows it.` : `Thank them for returning and suggest a complementary item from ${lastCategory}.`;
    return { id, orders: sorted, lastAt: last.occurred_at, lastCategory, total: sorted.reduce((sum, order) => sum + order.amount_minor, 0), avgInterval, daysSince, risk, segment: sorted.length === 1 ? "New" : risk >= 60 ? "At risk" : risk >= 35 ? "Watch" : "Regular", stopped: daysSince >= Math.max(21, avgInterval * 2) || risk >= 75, offer };
  });
  return people.sort((a, b) => b.risk - a.risk || b.total - a.total);
}

export function CustomerRetention({ records, canSave, onAdd, locale }: { records: FinanceRecord[]; canSave: boolean; onAdd: (record: Draft) => Promise<void>; locale: Locale }) {
  const [customerId, setCustomerId] = useState(""); const [category, setCategory] = useState(""); const [amount, setAmount] = useState(""); const [quantity, setQuantity] = useState("1"); const [notice, setNotice] = useState(""); const [saving, setSaving] = useState(false); const [generating, setGenerating] = useState(""); const [drafts, setDrafts] = useState<Record<string, string>>({}); const [message, setMessage] = useState("");
  const savedPurchases = records.filter((record) => record.kind === "customer_purchase");
  const sample = savedPurchases.length === 0;
  const purchases = sample ? DEMO_CUSTOMER_PURCHASES : savedPurchases;
  const people = analyzeCustomerPurchases(purchases, now());
  const churned = people.filter((person) => person.stopped);
  const atRisk = people.filter((person) => person.risk >= 60);
  const repeated = people.filter((person) => person.orders.length > 1).length;

  async function addPurchase(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    const valueMinor = Math.round(Number(amount) * 100); const units = Number(quantity);
    if (!customerId.trim() || !category.trim() || !Number.isFinite(valueMinor) || valueMinor <= 0 || !Number.isInteger(units) || units <= 0) { setNotice("Enter a customer ID, product category, positive amount, and whole-number quantity."); return; }
    setSaving(true); setNotice("Saving purchase to your account…");
    try { await onAdd({ kind: "customer_purchase", name: customerId.trim(), phone: null, amount_minor: valueMinor, quantity: units, category: category.trim(), due_date: null, related_record_id: null, note: null }); setNotice("Purchase saved. Customer retention insights now use your account records."); setCustomerId(""); setCategory(""); setAmount(""); setQuantity("1"); }
    catch { setNotice("Could not save the purchase. Check your connection and try again."); }
    finally { setSaving(false); }
  }

  async function generateDraft(person: CustomerActivity) {
    setGenerating(person.id); setMessage("");
    const prompt = `Write one warm, short re-engagement WhatsApp draft in ${locale === "hi" ? "Hindi" : locale === "kn" ? "Kannada" : "English"} for an anonymised customer. Their past category was ${person.lastCategory}, they have ${person.orders.length} recorded visits, last visited ${person.daysSince} days ago, and churn risk estimate ${person.risk}%. Recommend a modest offer only as a suggestion and explicitly remind the merchant to check margin before using a discount. Do not invent a name, phone number, item, or purchase. Do not send the message. Return only the message draft.`;
    try { const result = await api.chat([{ role: "user", content: prompt }], locale); setDrafts((items) => ({ ...items, [person.id]: result.answer })); }
    catch { setDrafts((items) => ({ ...items, [person.id]: `Hi there! We’ve missed seeing you. Your favourites in ${person.lastCategory} are waiting at our shop. Ask us about this week’s special. Reply if you’d like us to help you choose. — Your shop` })); setMessage("AI draft service was unavailable; showing a local message template instead."); }
    finally { setGenerating(""); }
  }

  async function copyDraft(person: CustomerActivity) {
    const content = drafts[person.id] ?? `Hi there! We’ve missed seeing you. Your favourites in ${person.lastCategory} are waiting at our shop. Ask us about this week’s special. — Your shop`;
    try { await navigator.clipboard.writeText(content); setMessage(`Draft for ${person.id} copied. Review it and verify any offer margin before sending.`); }
    catch { setMessage("Copy was blocked by the browser. Select and copy the draft text manually."); }
  }

  return <section className="retention-section">
    <header className="business-heading"><div><div className="eyebrow"><Users size={15}/> CUSTOMER RETENTION</div><h2>Re-engage customers</h2><p>Estimate who may stop returning from visit frequency and recency; review offers before sending.</p></div><span className="business-demo-tag">{sample ? "ANONYMOUS SAMPLE" : "SAVED PURCHASE HISTORY"}</span></header>
    <div className="business-notice"><Bot size={17}/><span><strong>{sample ? "Illustrative churn signals · anonymous customer IDs" : "Private, saved purchase activity"}</strong><small>{sample ? "Demo visits illustrate the analysis only; they are not actual customer data and are never saved." : "Risk is a simple estimate from each customer's purchase recency and interval. No campaign is sent, and discount suggestions require a margin check."}</small></span></div>
    <div className="business-metrics"><Metric label="Customers analysed" value={String(people.length)} caption={sample ? "Anonymous sample IDs" : "From saved purchase records"}/><Metric label="May have stopped visiting" value={String(churned.length)} caption="Past expected return interval"/><Metric label="Higher churn risk" value={String(atRisk.length)} caption="Estimated score 60% or higher"/><Metric label="Repeat customers" value={String(repeated)} caption="At least two recorded visits"/></div>
    <div className="business-two-col retention-layout"><article className="panel"><div className="panel-header"><div><h3>Customer activity</h3><p>Risk score uses days since last visit versus their previous visit interval.</p></div></div>{people.map((person) => <div className="retention-card" key={person.id}><div className="retention-head"><div><strong>{person.id}</strong><span className={`retention-segment ${person.risk >= 60 ? "risk" : person.risk >= 35 ? "watch" : "regular"}`}>{person.segment}</span></div><b>{person.risk}% risk</b></div><div className="retention-facts"><span>{person.orders.length} visits</span><span>Last visit {person.daysSince} days ago</span><span>Typical gap {Math.round(person.avgInterval)} days</span><span>Spend {money(person.total)}</span></div><p className="retention-offer"><b>Suggestion:</b> {person.offer}</p><div className="retention-draft">{drafts[person.id] ?? `Hi there! We’ve missed seeing you. Your favourites in ${person.lastCategory} are waiting at our shop. Ask us about this week’s special.`}</div><div className="retention-actions"><button type="button" disabled={generating === person.id} onClick={() => void generateDraft(person)}><Bot size={14}/>{generating === person.id ? "Generating…" : "Generate AI message"}</button><button type="button" onClick={() => void copyDraft(person)}><Clipboard size={14}/> Copy draft</button></div></div>)}</article>
      <article className="panel"><div className="panel-header"><div><h3>Record a customer purchase</h3><p>Build account-saved visit history using an anonymised customer ID.</p></div><Plus size={17}/></div><form className="business-form retention-form" onSubmit={addPurchase}><label>Customer ID<input value={customerId} onChange={(event) => setCustomerId(event.target.value)} placeholder="e.g. C-104 (avoid personal details)" required/></label><label>Product category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Snacks" required/></label><label>Purchase total (₹)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="250.00" required/></label><label>Quantity<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>{notice && <p className="business-form-notice" role="status">{notice}</p>}<button className="business-primary" disabled={!canSave || saving}><Plus size={15}/>{saving ? "Saving…" : canSave ? "Save customer purchase" : "Sign in to save"}</button></form><p className="business-footnote">Use the same anonymised customer ID for repeat visits. This page analyses purchase history only; it does not read phone contacts or message customers.</p>{message && <p className="business-form-notice" role="status">{message}</p>}</article></div>
    <p className="business-footnote"><MessageCircle size={14}/> All messages are drafts for merchant review. The app never sends a WhatsApp or SMS campaign.</p>
  </section>;
}

function Metric({ label, value, caption }: { label: string; value: string; caption: string }) { return <article className="metric-card"><div className="metric-head">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{caption}</div></article>; }
