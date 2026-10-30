"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Activity, ArrowRight, Bell, Bot, BriefcaseBusiness, ChartNoAxesCombined, ChevronDown, CircleHelp, CreditCard, FileChartColumn, Menu, Mic, Package, ReceiptText, Send, Settings2, ShieldCheck, Sparkles, Users, Volume2, WalletCards, X } from "lucide-react";
import { api, type AssistantResponse, type Transaction } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useLocalePreference } from "@/lib/locale";
import { interpretSaathiCommand } from "@/lib/saathi-commands";
import { speakSaathi, type VoiceLocale } from "@/lib/voice";
import { useTranslations } from "next-intl";

const chatSchema = z.object({ question: z.string().trim().min(1, "Write a question first").max(2000) });
type ChatForm = z.infer<typeof chatSchema>;
type NavItem = { key: string; label: string; icon: typeof Activity; module: string };

function currentWeek() {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}
const money = (minor: number, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);

export function MerchantApp() {
  const t = useTranslations("app");
  const [page, setPage] = useState("overview");
  const [orgId, setOrgId] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [commandNotice, setCommandNotice] = useState("");
  const [floatingAssistantOpen, setFloatingAssistantOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Browser voice ready");
  const cursorRef = useRef<HTMLSpanElement>(null);
  const spokenAssistantIndexRef = useRef(-1);
  const token = useSession((state) => state.accessToken);
  const setToken = useSession((state) => state.setAccessToken);
  const locale = useLocalePreference((state) => state.locale);
  const setLocale = useLocalePreference((state) => state.setLocale);
  const period = useMemo(() => currentWeek(), []);
  const meQuery = useQuery({ queryKey: ["me", token], queryFn: api.me, enabled: !!token });
  const selectedOrg = orgId || meQuery.data?.organizations[0]?.id || "";
  const salesQuery = useQuery({ queryKey: ["sales", selectedOrg, period], queryFn: () => api.sales(selectedOrg, period.start, period.end), enabled: !!token && !!selectedOrg });
  const transactionsQuery = useQuery({ queryKey: ["transactions", selectedOrg], queryFn: () => api.transactions(selectedOrg), enabled: !!token && !!selectedOrg });
  const chatForm = useForm<ChatForm>({ resolver: zodResolver(chatSchema), defaultValues: { question: "" } });
  const askMutation = useMutation({ mutationFn: (question: string) => api.ask(selectedOrg, question), onSuccess: (result: AssistantResponse) => { const provenance = result.grounded && Array.isArray(result.evidence.sources) ? `\n\nChecked against: ${(result.evidence.sources as string[]).join(", ")}.` : ""; const status = result.evidence.reason ? `\n\nStatus: ${String(result.evidence.reason).replaceAll("_", " ")}` : ""; setMessages((items) => [...items, { role: "assistant", text: `${result.answer}${provenance}${status}` }]); }, onError: (error: Error) => setMessages((items) => [...items, { role: "assistant", text: `Saathi could not reach the shared API: ${error.message}. No business figures were generated.` }]) });

  const latestAssistantAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.text ?? "";
  const speakReply = useCallback(async (text: string, language: VoiceLocale = locale) => {
    const provider = await speakSaathi(text, language);
    setVoiceStatus(provider === "elevenlabs" ? "ElevenLabs voice" : provider === "browser" ? "Browser voice" : "Voice unavailable");
  }, [locale]);

  useEffect(() => {
    if (askMutation.isPending || !latestAssistantAnswer) return;
    let latestAssistantIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "assistant") { latestAssistantIndex = index; break; }
    }
    if (latestAssistantIndex <= spokenAssistantIndexRef.current) return;
    spokenAssistantIndexRef.current = latestAssistantIndex;
    void speakReply(latestAssistantAnswer);
  }, [askMutation.isPending, latestAssistantAnswer, messages, speakReply]);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (event: PointerEvent) => {
      cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      cursor.classList.add("cursor-visible");
      cursor.classList.toggle("cursor-action", Boolean((event.target as Element | null)?.closest("button,a,select,[role='button']")));
    };
    const leave = () => cursor.classList.remove("cursor-visible");
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  const labels = {
    overview: t("overview"), sales: t("sales"), cashflow: t("cashflow"), customers: t("customers"),
    inventory: t("inventory"), loans: t("loans"), reports: t("reports"),
  };
  const nav: NavItem[] = [
    { key: "overview", label: labels.overview, icon: Activity, module: "Overview" },
    { key: "sales", label: labels.sales, icon: ChartNoAxesCombined, module: "Sales insights" },
    { key: "cashflow", label: labels.cashflow, icon: WalletCards, module: "Cash flow" },
    { key: "customers", label: labels.customers, icon: Users, module: "Customer and loyalty tools are not yet available in the shared API." },
    { key: "inventory", label: labels.inventory, icon: Package, module: "Inventory and staff tools are not yet available in the shared API." },
    { key: "loans", label: labels.loans, icon: CreditCard, module: "Credit offers require an authorized lending integration." },
    { key: "reports", label: labels.reports, icon: FileChartColumn, module: "Reports and tax exports are not yet available in the shared API." },
  ];
  const isLoading = token && (meQuery.isPending || (!!selectedOrg && salesQuery.isPending));
  const apiError = token ? (meQuery.error || salesQuery.error) as Error | null : null;

  function askSaathi(question: string) {
    const command = interpretSaathiCommand(question, locale);
    if (command.page !== "assistant") setPage(command.page);
    setCommandNotice(command.page !== "assistant" ? command.answer : "");
    setMobileNavOpen(false);
    setMessages((items) => [...items, { role: "user", text: question }]);
    if (token && selectedOrg && (command.needsConnectedData || command.page === "assistant")) {
      askMutation.mutate(question);
    } else {
      setMessages((items) => [...items, { role: "assistant", text: command.answer }]);
    }
  }

  function onAsk(values: ChatForm) {
    askSaathi(values.question);
    chatForm.reset();
  }

  return <div className="app-shell">
    <span ref={cursorRef} className="cinematic-cursor" aria-hidden="true" />
    {commandNotice && <div className="command-toast" role="status"><Sparkles size={16}/><span>{commandNotice}</span><button type="button" className="toast-speak" aria-label="Speak Saathi message" title="Speak this message" onClick={() => void speakReply(commandNotice)}><Volume2 size={15}/></button><button type="button" aria-label="Dismiss Saathi message" onClick={() => setCommandNotice("")}><X size={15}/></button></div>}
    <FloatingSaathi open={floatingAssistantOpen} onToggle={() => setFloatingAssistantOpen((open) => !open)} onClose={() => setFloatingAssistantOpen(false)} onAsk={askSaathi} onSpeak={(text) => void speakReply(text)} messages={messages} latestAnswer={latestAssistantAnswer} pending={askMutation.isPending} voiceStatus={voiceStatus} onOpenVoice={() => { setPage("assistant"); setFloatingAssistantOpen(false); }}/>
    <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
      <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setPage("overview"); }}><span className="brand-mark"><i/><i/><i/></span><span className="brand-name">paytm<span>.</span><small>SAATHI</small></span></a>
      <button suppressHydrationWarning className="shop-switcher" onClick={() => selectedOrg && setOrgId(selectedOrg)}><span className="shop-avatar">{selectedOrg ? "M" : "·"}</span><span><b>{selectedOrg ? "Merchant business" : "Connect your account"}</b><small>{selectedOrg ? "Verified membership" : "Sign in to view your stores"}</small></span><ChevronDown size={16}/></button>
      <p className="nav-label">YOUR BUSINESS</p>
      <nav className="nav-list" aria-label="Business navigation">{nav.map((item) => { const Icon = item.icon; return <button key={item.key} className={`nav-item ${page === item.key ? "active" : ""}`} onClick={() => { setPage(item.key); setMobileNavOpen(false); }}><Icon size={18}/><span>{item.label}</span>{item.key === "sales" && <i className="nav-new">NEW</i>}</button>; })}</nav>
      <p className="nav-label tools-label">TOOLS</p>
      <nav className="nav-list" aria-label="Tools"><button className={`nav-item ${page === "assistant" ? "active" : ""}`} onClick={() => { setCommandNotice(""); setPage("assistant"); setMobileNavOpen(false); }}><Bot size={18}/><span>Saathi AI</span></button><button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => { setPage("settings"); setMobileNavOpen(false); }}><Settings2 size={18}/><span>Settings</span></button></nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-orbit"><CircleHelp size={17}/></div><strong>Need a hand?</strong><span>Merchant support and help.</span><button onClick={() => setPage("support")}>Get support <ArrowRight size={14}/></button></div><div className="profile-row"><div className="profile-avatar">{token ? "M" : "?"}</div><span><strong>{token ? "Merchant user" : "Not signed in"}</strong><small>{token ? "Account member" : "Connect to get started"}</small></span><button className="icon-quiet" aria-label="Sign out" onClick={() => { setToken(null); setOrgId(""); }}>···</button></div></div>
    </aside>
    {mobileNavOpen && <button aria-label="Close navigation" className="nav-scrim" onClick={() => setMobileNavOpen(false)}/>}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu icon-quiet" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20}/></button><div className="breadcrumb"><span>My business</span><b>/</b><strong>{page === "overview" ? labels.overview : nav.find((item) => item.key === page)?.label ?? (page === "assistant" ? "Saathi AI" : page)}</strong></div><div className="top-actions"><span className="connection-pill"><i className={token ? "connected" : ""}/>{token ? "CONNECTED ACCOUNT" : "ACCOUNT NOT CONNECTED"}</span><label className="language-picker"><span className="sr-only">Language</span><select aria-label="Language" value={locale} onChange={(event)=>setLocale(event.target.value as "en"|"hi")}><option value="en">EN</option><option value="hi">हि</option></select></label><button className="icon-button" aria-label="Notifications" onClick={() => setPage("notifications")}><Bell size={18}/></button><div className="top-avatar">{token ? "M" : "?"}</div></div></header>
      <div className="page-wrap">
        {page === "overview" || page === "sales" || page === "cashflow" ? <>
          <section className="greeting-row"><div><div className="eyebrow"><Sparkles size={13}/> MERCHANT GROWTH PARTNER</div><h1>{page === "overview" ? "Your business, understood." : page === "sales" ? "Sales insights" : "Cash flow"}</h1><p className="subheading">{page === "overview" ? "Your business information will appear here when your merchant account is connected." : "Insights use authorized account data and explain how each figure is calculated."}</p></div><div className="date-select" aria-label="Reporting period">◷ <span>Last 7 days</span><ChevronDown size={15}/></div></section>
          <section className="hero-card"><div className="hero-content"><div className="hero-kicker"><Sparkles size={14}/> SAATHI AI · BUSINESS COPILOT</div><h2>{token ? "Speak naturally. Saathi handles the busywork." : "Your shop is busy. Your partner is ready."}</h2><p>A voice-first partner for sales, settlements, credit, customers, stock and tax. It explains what changed and asks before it takes an external action.</p><button className="hero-button" onClick={() => { setCommandNotice(""); setPage("assistant"); }}><Mic size={15}/> Talk to Saathi <ArrowRight size={16}/></button></div><div className="hero-art soundbox-scene" aria-hidden="true"><div className="art-ring ring-a"/><div className="art-ring ring-b"/><div className="sound-wave wave-one"/><div className="sound-wave wave-two"/><div className="sound-wave wave-three"/><div className="soundbox-device"><span className="soundbox-display">PAYTM</span><span className="soundbox-speaker"><i/><i/><i/><i/><i/></span><span className="soundbox-light"/></div><span className="art-dot"/></div><div className="hero-footer"><span><ShieldCheck size={14}/> Private to your merchant account · actions require your say</span><span className="preview-note">Works by voice or text</span></div></section>
          <div id="api-connection" className={`status-banner ${apiError ? "status-error" : ""}`}><div className="status-icon">{isLoading ? <Activity size={17} className="spin"/> : apiError ? <X size={17}/> : <ShieldCheck size={17}/>}</div><div><strong>{!token ? "Merchant session required" : isLoading ? "Loading authorized merchant data" : apiError ? "Unable to load merchant data" : selectedOrg ? "Connected to shared merchant API" : "No merchant organization found"}</strong><p>{!token ? "The current shared backend has no OTP or session creation endpoint yet. Sign-in cannot be completed until that identity flow is connected." : apiError ? `API request did not complete: ${apiError.message}` : selectedOrg ? "This page uses the same FastAPI merchant records as the mobile app. Figures below appear only after the API returns verified records." : "This account has no organization membership available to display."}</p></div><span className="status-env">{process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}</span></div>
          <section className="metric-grid" aria-label="Authorized business metrics"><MetricCard label="Gross collections" value={salesQuery.data ? money(salesQuery.data.gross_collections_minor, salesQuery.data.currency) : "—"} detail={salesQuery.data ? "Successful payments · excludes refunds and fees" : "Waiting for authorized data"} icon="₹" tone="teal"/><MetricCard label="Successful payments" value={salesQuery.data ? String(salesQuery.data.transaction_count) : "—"} detail="In the selected period" icon="✓" tone="violet"/><MetricCard label="Average payment" value={salesQuery.data ? money(salesQuery.data.average_transaction_minor, salesQuery.data.currency) : "—"} detail="Gross collections ÷ successful payments" icon="⌁" tone="amber"/><MetricCard label="Pending settlement" value="—" detail="Settlement data is not available in API yet" icon="↓" tone="pink"/></section>
          <section className="content-grid"><article className="panel sales-panel"><div className="panel-header"><div><h3>Collections summary</h3><p>Authorized period total</p></div><span className="chart-period">Last 7 days</span></div><EmptyChart message={salesQuery.data ? "The sales API currently returns a period total, not dated daily values." : "Daily totals will appear when the analytics API returns dated records."}/><div className="definition-note"><ShieldCheck size={15}/><span>{salesQuery.data?.definition ?? "No totals are estimated or substituted while data is unavailable."}</span></div></article><article className="panel activity-panel"><div className="panel-header"><div><h3>Recent transactions</h3><p>Latest authorized payment activity</p></div><button className="text-action" onClick={() => setPage("sales")}>View sales <ArrowRight size={14}/></button></div><TransactionList data={transactionsQuery.data ?? []} loading={transactionsQuery.isPending && !!token} error={transactionsQuery.error as Error | null} canQuery={!!token && !!selectedOrg} locale={locale}/></article></section>
          <section className="bottom-grid"><AssistantCard orgId={selectedOrg} locale={locale} messages={messages} pending={askMutation.isPending} onAsk={askSaathi} onSpeak={speakReply} form={chatForm} submit={onAsk}/><article className="panel readiness-panel"><div className="panel-header"><div><h3>Business tools</h3><p>Availability from the shared API contract</p></div><BriefcaseBusiness size={18}/></div><FeatureAvailability items={[["Settlements & cash flow", false],["Inventory & purchase orders", false],["Customers & campaigns", false],["Tax & report exports", false],["Approvals & notifications", false]]}/></article></section>
        </> : page === "assistant" ? <AssistantPage orgId={selectedOrg} locale={locale} messages={messages} pending={askMutation.isPending} onAsk={askSaathi} onSpeak={speakReply} form={chatForm} submit={onAsk}/> : <ModuleUnavailable page={page} onBack={() => setPage("overview")}/>}
        <footer className="page-footer"><span>Paytm Saathi · Connected data only · API availability varies by service.</span><span><button onClick={() => setPage("settings")}>Privacy &amp; data</button><i/><button onClick={() => setPage("support")}>Support</button></span></footer>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">{nav.slice(0,5).map((item) => { const Icon=item.icon; return <button key={item.key} className={page===item.key?"active":""} onClick={()=>setPage(item.key)}><Icon size={18}/><span>{item.label}</span></button>; })}</nav>
    </main>
  </div>;
}

function MetricCard({label,value,detail,icon,tone}:{label:string;value:string;detail:string;icon:string;tone:string}) { return <article className="metric-card"><div className="metric-head"><span>{label}</span><span className={`metric-symbol ${tone}`}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot"><span>{detail}</span></div></article>; }
function EmptyChart({message}:{message:string}) { return <div className="empty-chart"><ChartNoAxesCombined size={24}/><strong>No trend data yet</strong><span>{message}</span></div>; }
function TransactionList({data,loading,error,canQuery,locale}:{data:Transaction[];loading:boolean;error:Error|null;canQuery:boolean;locale:"en"|"hi"}) { if(!canQuery)return <div className="empty-list"><ShieldCheck size={23}/><strong>Sign in to view transactions</strong><span>Payment activity is available only to an authorized merchant session.</span></div>; if(loading)return <div className="empty-list">Loading authorized transactions…</div>; if(error)return <div className="empty-list">Transactions could not be loaded: {error.message}</div>; if(!data.length)return <div className="empty-list"><WalletCards size={23}/><strong>No authorized transactions</strong><span>Recent payment activity will show here when the shared API provides records.</span></div>; return <div className="activity-list">{data.map((item)=><div className="activity-row" key={item.id}><span className="activity-icon payment-icon"><CreditCard size={16}/></span><div className="activity-main"><strong>{item.payment_method ?? "Payment"}</strong><span>{new Date(item.occurred_at).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN",{timeZone:"Asia/Kolkata"})} · {item.status}</span></div><strong className="activity-amount">{money(item.amount_minor,item.currency)}</strong></div>)}</div>; }
function FeatureAvailability({items}:{items:[string,boolean][]}) { return <div className="feature-availability">{items.map(([label,available])=><div key={label}><span className="availability-dot"/><span>{label}</span><small>{available?"Available":"Not connected"}</small></div>)}</div>; }

function FloatingSaathi({open,onToggle,onClose,onAsk,onSpeak,messages,latestAnswer,pending,voiceStatus,onOpenVoice}:{open:boolean;onToggle:()=>void;onClose:()=>void;onAsk:(question:string)=>void;onSpeak:(text:string)=>void;messages:{role:"user"|"assistant";text:string}[];latestAnswer:string;pending:boolean;voiceStatus:string;onOpenVoice:()=>void}) {
  const [draft,setDraft]=useState("");
  function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question=draft.trim();
    if(!question||pending)return;
    onAsk(question);
    setDraft("");
  }
  return <div className="saathi-float">
    {open&&<section className="saathi-float-panel" role="dialog" aria-label="Saathi AI assistant">
      <header className="saathi-float-header"><div className="saathi-float-avatar"><Sparkles size={18}/></div><div><strong>Saathi AI</strong><small><i/> {voiceStatus}</small></div><button type="button" aria-label="Close Saathi" onClick={onClose}><X size={16}/></button></header>
      <div className="saathi-float-messages" aria-live="polite">{messages.length===0?<div className="saathi-float-empty">Ask me about sales, settlements, stock or your shop. I’ll speak my reply.</div>:messages.slice(-4).map((message,index)=><div key={`${message.role}-${index}`} className={`saathi-float-message ${message.role}`}>{message.text}</div>)}{pending&&<div className="saathi-float-message assistant">Saathi is working…</div>}</div>
      <form className="saathi-float-input" onSubmit={submit}><input value={draft} onChange={(event)=>setDraft(event.target.value)} placeholder="Ask Saathi anything…" aria-label="Ask Saathi anything"/><button type="submit" disabled={pending||!draft.trim()} aria-label="Send to Saathi"><Send size={16}/></button></form>
      <div className="saathi-float-actions"><button type="button" onClick={onOpenVoice}><Mic size={15}/> Voice mode</button><button type="button" disabled={!latestAnswer} onClick={()=>onSpeak(latestAnswer)}><Volume2 size={15}/> Hear reply</button></div>
    </section>}
    <button type="button" className={`saathi-float-trigger ${open?"open":""}`} onClick={onToggle} aria-label={open?"Close Saathi assistant":"Open Saathi assistant"} aria-expanded={open}><span className="saathi-float-orb"><Sparkles size={20}/></span><span>{open?"Close":"Saathi"}<small>{open?"":"AI partner"}</small></span>{open&&<X size={16}/>}</button>
  </div>;
}
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

function AssistantCard({orgId,locale,messages,pending,onAsk,onSpeak,form,submit}:{orgId:string;locale:"en"|"hi";messages:{role:"user"|"assistant";text:string}[];pending:boolean;onAsk:(q:string)=>void;onSpeak:(text:string,locale?:VoiceLocale)=>void;form:ReturnType<typeof useForm<ChatForm>>;submit:(v:ChatForm)=>void}) {
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const latestAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.text ?? "";

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  function toggleVoiceInput() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const browserWindow = window as SpeechWindow;
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice("Voice input isn’t supported by this browser. Try Chrome, or type your request.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = locale === "hi" ? "hi-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setVoiceNotice(`Heard: “${transcript}”`);
        onAsk(transcript);
      }
    };
    recognition.onerror = (event) => {
      setVoiceNotice(event.error === "not-allowed" ? "Microphone access was blocked. Allow it in the browser, then try again." : "I couldn’t hear that clearly. Please try again or type your request.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setVoiceNotice("Listening in " + (locale === "hi" ? "Hindi" : "English") + "…");
    setListening(true);
    try { recognition.start(); } catch { setListening(false); setVoiceNotice("Voice input is already active. Try again in a moment."); }
  }

  function readLatestAnswer() {
    if (latestAnswer) onSpeak(latestAnswer, locale);
  }

  return <article className="panel assistant-panel"><div className="assistant-top"><div className="assistant-avatar"><Sparkles size={18}/></div><div><h3>Saathi AI business partner</h3><p>{orgId?"Connected to the shared API":"Voice and typed navigation ready · merchant data not connected"}</p></div><span className="online-pill">{orgId?"API":"VOICE READY"}</span></div><div className="assistant-messages" aria-live="polite">{messages.length===0?<div className="bot-message"><span className="message-spark"><Sparkles size={14}/></span><div><strong>Ask Saathi to help run your shop.</strong><br/>Try “show today’s sales”, “open stock”, or “what can you do?”</div></div>:messages.slice(-4).map((m,i)=><div key={i} className={m.role==="user"?"user-message":"bot-message"}>{m.role==="assistant"&&<span className="message-spark"><Sparkles size={14}/></span>}<div>{m.text}</div></div>)}{pending&&<div className="bot-message"><span className="message-spark"><Sparkles size={14}/></span><div className="typing-dots"><i/><i/><i/></div></div>}</div><div className="assistant-suggestions"><button type="button" disabled={pending} onClick={()=>onAsk("Show sales insights")}>Show sales <ArrowRight size={13}/></button><button type="button" disabled={pending} onClick={()=>onAsk("What settlements are pending?")}>Settlements <ArrowRight size={13}/></button><button type="button" disabled={pending} onClick={()=>onAsk("Open stock and staff")}>Stock &amp; staff <ArrowRight size={13}/></button></div><form className="assistant-input" onSubmit={form.handleSubmit(submit)}><input {...form.register("question")} placeholder="Ask or tell Saathi what to do…" aria-label="Ask Saathi" disabled={pending}/><button className="voice-button" type="button" aria-label={listening?"Stop voice input":"Start voice input"} aria-pressed={listening} onClick={toggleVoiceInput}><Mic size={16}/></button><button aria-label="Send message" disabled={pending}><Send size={16}/></button></form>{voiceNotice&&<small className="voice-notice" aria-live="polite">{voiceNotice}</small>}{form.formState.errors.question&&<small className="field-error">{form.formState.errors.question.message}</small>}<div className="assistant-foot"><div className="privacy-note"><ShieldCheck size={13}/> Replies speak automatically. External actions require your approval.</div><button type="button" className="read-aloud" aria-label="Read latest answer aloud" disabled={!latestAnswer} onClick={readLatestAnswer}><Volume2 size={15}/> Read reply</button></div></article>;
}
function AssistantPage(props:Parameters<typeof AssistantCard>[0]) { return <section className="assistant-page"><div className="assistant-page-heading"><div className="eyebrow"><Sparkles size={13}/> YOUR BUSINESS COPILOT</div><h1>Saathi AI</h1><p>Speak or type. Saathi opens the right tool, explains what it can do, and tells you when connected merchant data is needed.</p></div><AssistantCard {...props}/></section>; }
function ModuleUnavailable({page,onBack}:{page:string;onBack:()=>void}) { const title=page.charAt(0).toUpperCase()+page.slice(1); return <section className="unavailable-page"><div className="eyebrow"><BriefcaseBusiness size={13}/> PAYTM SAATHI</div><div className="unavailable-card"><div className="unavailable-icon"><ReceiptText size={22}/></div><h1>{title}</h1><p>This business area is part of the product plan, but the shared backend contract does not yet expose this service. No sample records or unsupported actions are shown.</p><button className="hero-button" onClick={onBack}>Return to overview <ArrowRight size={15}/></button></div></section>; }
