"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CircleAlert, Copy, Download, ExternalLink, Moon, Send, ShieldCheck, Sun, UserRound, WandSparkles } from "lucide-react";
import type { FinanceRecord } from "@/lib/api";
import { api } from "@/lib/api";

export type Appearance = "light" | "dark";

export function SettingsPage({ accountName, email, theme, onThemeChange, records, demoMode, accountEnabled, onExport, onSignOut }: {
  accountName: string;
  email: string | null;
  theme: Appearance;
  onThemeChange: (value: Appearance) => void;
  records: FinanceRecord[];
  demoMode: boolean;
  accountEnabled: boolean;
  onExport: () => void;
  onSignOut: () => void;
}) {
  const [savedTheme, setSavedTheme] = useState(false);
  const [telegramCode, setTelegramCode] = useState<Awaited<ReturnType<typeof api.createTelegramLinkCode>> | null>(null);
  const queryClient = useQueryClient();
  const telegramStatus = useQuery({ queryKey: ["telegram-status"], queryFn: api.telegramStatus, enabled: accountEnabled, refetchInterval: telegramCode ? 3000 : false });
  const createTelegramCode = useMutation({ mutationFn: api.createTelegramLinkCode, onSuccess: setTelegramCode });
  const unlinkTelegram = useMutation({ mutationFn: api.unlinkTelegram, onSuccess: async () => { setTelegramCode(null); await queryClient.invalidateQueries({ queryKey: ["telegram-status"] }); } });
  function chooseTheme(value: Appearance) {
    onThemeChange(value);
    setSavedTheme(true);
    window.setTimeout(() => setSavedTheme(false), 1800);
  }

  return <section className="settings-page">
    <div className="eyebrow"><ShieldCheck size={14}/> ACCOUNT &amp; PREFERENCES</div>
    <div className="settings-heading"><div><h1>Settings</h1><p className="subheading">Manage your account, appearance, saved records, and business data connection.</p></div><span className={`settings-source ${demoMode ? "is-demo" : ""}`}><i/>{demoMode ? "DEMO DATA" : "MERCHANT SESSION"}</span></div>
    <div className="settings-grid">
      <article className="panel settings-card">
        <header><span className="settings-icon"><UserRound size={18}/></span><div><h2>Account</h2><p>Your signed-in Saathi profile</p></div></header>
        <div className="settings-profile"><span className="settings-avatar">{accountName.slice(0, 1).toUpperCase()}</span><div><strong>{accountName}</strong><small>{email || "No email address on this session"}</small></div></div>
        <div className="settings-detail"><span>Saved account records</span><strong>{records.length}</strong></div>
        <div className="settings-detail"><span>Data ownership</span><strong>Private to this account</strong></div>
        <div className="settings-actions"><button className="settings-secondary" type="button" onClick={onExport} disabled={!records.length}><Download size={15}/> Download my records</button><button className="settings-secondary" type="button" onClick={onSignOut}>Sign out <ArrowRight size={14}/></button></div>
        <small className="settings-note">Download exports the account’s saved ledger and planner records as JSON. Demo figures are not included.</small>
      </article>

      <article className="panel settings-card">
        <header><span className="settings-icon"><WandSparkles size={18}/></span><div><h2>Appearance</h2><p>Choose how Saathi looks on this device</p></div></header>
        <div className="theme-options" role="group" aria-label="Color theme">
          <button type="button" className={`theme-choice ${theme === "light" ? "selected" : ""}`} aria-pressed={theme === "light"} onClick={() => chooseTheme("light")}><Sun size={19}/><span><strong>Light</strong><small>Bright workspace</small></span>{theme === "light" && <Check size={16}/>}</button>
          <button type="button" className={`theme-choice ${theme === "dark" ? "selected" : ""}`} aria-pressed={theme === "dark"} onClick={() => chooseTheme("dark")}><Moon size={19}/><span><strong>Dark</strong><small>Low-light workspace</small></span>{theme === "dark" && <Check size={16}/>}</button>
        </div>
        <p className="settings-inline-status" role="status">{savedTheme ? "Appearance saved to your account." : "Your choice is saved and will follow your account when you sign in again."}</p>
      </article>

      <article className="panel settings-card settings-telegram">
        <header><span className="settings-icon"><Send size={18}/></span><div><h2>Telegram assistant</h2><p>Record and check your personal money ledger from a private Telegram chat</p></div></header>
        {!accountEnabled ? <div className="settings-warning"><CircleAlert size={16}/><span>Sign in to link Telegram to your private Saathi account.</span></div> : telegramStatus.isPending ? <p className="settings-copy">Checking Telegram bot setup…</p> : telegramStatus.error ? <div className="settings-warning"><CircleAlert size={16}/><span>Could not reach the backend. Start the Saathi API and refresh this page to connect Telegram.</span></div> : !telegramStatus.data?.configured ? <>
          <div className="provider-state pending"><i/>Bot setup needed on the backend</div>
          <p className="settings-copy">Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"><strong>@BotFather</strong></a> using <code>/newbot</code>, then add its token and username to the backend’s private environment file:</p>
          <pre className="telegram-env"><code>TELEGRAM_BOT_TOKEN=your_botfather_token{"\n"}TELEGRAM_BOT_USERNAME=your_bot_username</code></pre>
          <p className="settings-note">Restart the backend after setting these values. Local development uses Telegram polling, so localhost can receive messages while the API stays running. Production can use a public HTTPS webhook. Telegram bot access itself is free; the backend host must stay online. No Twilio account is needed.</p>
        </> : telegramStatus.data.linked ? <>
          <div className="provider-state connected"><i/>Telegram is linked to this account</div>
          <p className="settings-copy">In the private chat, try “I lent 200 to Ravi” or ask “who owes me?”. Saathi asks you to confirm each entry before saving it to this account’s ledger.</p>
          <button className="settings-secondary" type="button" onClick={() => { if (window.confirm("Unlink Telegram from this Saathi account? Your saved ledger entries will remain.")) unlinkTelegram.mutate(); }} disabled={unlinkTelegram.isPending}>Unlink Telegram</button>
        </> : <>
          <div className="provider-state pending"><i/>Telegram bot is ready to link</div>
          <p className="settings-copy">Create a short-lived one-time code, then open the bot and link this signed-in account. The code expires after 10 minutes.</p>
          {telegramCode ? <div className="telegram-code-panel"><strong>{telegramCode.code}</strong><button className="settings-secondary" type="button" onClick={() => void navigator.clipboard.writeText(`/link ${telegramCode.code}`)}><Copy size={14}/> Copy /link command</button>{telegramCode.start_link && <a className="settings-secondary" href={telegramCode.start_link} target="_blank" rel="noreferrer">Open bot <ExternalLink size={14}/></a>}<button className="settings-secondary" type="button" onClick={() => createTelegramCode.mutate()} disabled={createTelegramCode.isPending}>{createTelegramCode.isPending ? "Creating…" : "Create a new code"}</button><small>Send <code>/link {telegramCode.code}</code> in a private chat with the bot. This code can only link one account and expires after ten minutes.</small></div> : <button className="settings-secondary" type="button" onClick={() => createTelegramCode.mutate()} disabled={createTelegramCode.isPending}><ShieldCheck size={15}/>{createTelegramCode.isPending ? "Creating secure link…" : "Create one-time link code"}</button>}
          {(createTelegramCode.error || unlinkTelegram.error) && <p className="settings-error" role="alert">{(createTelegramCode.error || unlinkTelegram.error)?.message}</p>}
          {telegramCode && telegramStatus.data?.linked && <p className="settings-inline-status" role="status">Telegram linked successfully to this account.</p>}
        </>}
      </article>

      <article className="panel settings-card settings-production">
        <header><span className="settings-icon"><ShieldCheck size={18}/></span><div><h2>Production data API</h2><p>Connect authorized merchant data when provider access is ready</p></div></header>
        <div className="provider-state pending"><i/>Production provider adapter is not configured</div>
        <p className="settings-copy">The transaction database and read APIs are in place, but live Paytm ingestion is not connected yet. Paytm API access is product-specific: the approved dashboard API details and response format must be used to build and verify the adapter. Demo examples are replaced by account data when a merchant organization has authorized records.</p>
        <div className="settings-api-steps"><strong>What the backend needs</strong><ol><li>Paytm’s official API documentation and the exact product/API you’re approved to use.</li><li>Server-side credentials and merchant identifier, added to the backend secret environment.</li><li>A verified provider adapter that maps authorized transaction records into the account’s merchant organization.</li></ol></div>
        <div className="settings-warning"><CircleAlert size={16}/><span>Do not paste API secrets into this browser or commit them to GitHub. They belong in the backend secret store. No real payments are initiated by this app.</span></div>
        <div className="settings-links"><a className="settings-doc-link" href="https://business.paytm.com/docs/" target="_blank" rel="noreferrer">Paytm developer docs <ArrowRight size={14}/></a><a className="settings-doc-link" href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}/api/v1/docs`} target="_blank" rel="noreferrer">Open this backend API docs <ArrowRight size={14}/></a></div>
      </article>
    </div>
  </section>;
}
