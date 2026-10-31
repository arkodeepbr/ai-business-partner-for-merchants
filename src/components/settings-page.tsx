"use client";

import { useState } from "react";
import { ArrowRight, Check, CircleAlert, Download, Moon, ShieldCheck, Sun, UserRound, WandSparkles } from "lucide-react";
import type { FinanceRecord } from "@/lib/api";

export type Appearance = "light" | "dark";

export function SettingsPage({ accountName, email, theme, onThemeChange, records, demoMode, onExport, onSignOut }: {
  accountName: string;
  email: string | null;
  theme: Appearance;
  onThemeChange: (value: Appearance) => void;
  records: FinanceRecord[];
  demoMode: boolean;
  onExport: () => void;
  onSignOut: () => void;
}) {
  const [savedTheme, setSavedTheme] = useState(false);
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
