"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "forgot" | "update-password";

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [mode, setMode] = useState<Mode>(search.get("mode") === "update-password" ? "update-password" : "signin");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(search.get("error") ? "Sign-in could not be completed. Please try again." : "");
  const [error, setError] = useState("");
  const report = (message: string) => { setError(message); setNotice(""); };
  const success = (message: string) => { setNotice(message); setError(""); };
  const passwordRecoveryRedirect = () => `${location.origin}/auth/callback?next=${encodeURIComponent("/login?mode=update-password")}`;

  async function act(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const supabase = createClient();
    if (!supabase) { setBusy(false); report("Sign-in needs a Supabase project. Add its URL and publishable key to web/.env.local, then restart the web app."); return; }
    try {
      if (mode === "signup") {
        const { error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() } } });
        if (authError) throw authError;
        setMode("signin");
        success("Account created. Check your email for the verification link, then sign in.");
      } else if (mode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.replace("/"); router.refresh();
      } else if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: passwordRecoveryRedirect() });
        if (authError) throw authError;
        success("A password reset link was sent. Open it in this browser to choose a new password.");
      } else if (mode === "update-password") {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        success("Your password has been changed."); router.replace("/"); router.refresh();
      }
    } catch (reason) { report(reason instanceof Error ? reason.message : "Could not complete that request."); }
    finally { setBusy(false); }
  }

  async function googleSignIn() {
    const supabase = createClient();
    if (!supabase) { report("Add Supabase URL and publishable key in web/.env.local first."); return; }
    setBusy(true); setError("");
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
    if (authError) { setBusy(false); report(authError.message); }
  }

  const title = mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : mode === "update-password" ? "Choose a new password" : "Welcome back";
  const caption = mode === "signup" ? "A smarter business day starts here." : mode === "forgot" ? "We’ll email you a secure reset link." : mode === "update-password" ? "Set a strong password for your account." : "Sign in to your Paytm Saathi workspace.";

  return <main className="auth-page"><div className="auth-glow auth-glow-one"/><div className="auth-glow auth-glow-two"/>
    <div className="auth-layout"><section className="auth-story"><div className="auth-brand"><span className="brand-mark"><i/><i/><i/></span><span className="brand-name">paytm<span>.</span><small>SAATHI</small></span></div>
      <div className="auth-kicker"><Sparkles size={14}/> YOUR AI BUSINESS PARTNER</div><h2>One calmer place to run your business.</h2><p className="auth-story-copy">Saathi helps you understand daily sales, keep your money records in order, and make practical next-step plans.</p>
      <div className="auth-feature-list"><article><span>01</span><div><strong>Sales that make sense</strong><p>See historical activity, track costs and discounts, and understand estimated profit.</p></div></article><article><span>02</span><div><strong>Customers who come back</strong><p>Review repeat purchases, spot customers who may be slipping away, and draft offers.</p></div></article><article><span>03</span><div><strong>Your own money ledger</strong><p>Track money lent, repayments, contacts, products, and business expenses in your account.</p></div></article><article><span>04</span><div><strong>Ask Saathi naturally</strong><p>Type or speak in English, Hindi, or Kannada. Answers use your saved records when relevant.</p></div></article></div>
      <p className="auth-story-note"><ShieldCheck size={14}/> Your saved records are private to your signed-in account. Demo figures are clearly labeled.</p>
    </section><section className="auth-card"><div className="auth-brand auth-brand-mobile"><span className="brand-mark"><i/><i/><i/></span><span className="brand-name">paytm<span>.</span><small>SAATHI</small></span></div>
      <div className="auth-kicker"><Sparkles size={14}/> MERCHANT GROWTH PARTNER</div><h1>{title}</h1><p className="auth-caption">{caption}</p>
      {mode === "signin" && <button className="google-auth" type="button" onClick={() => void googleSignIn()} disabled={busy}><span className="google-g">G</span> Continue with Google</button>}
      {mode === "signin" && <div className="auth-divider"><span>or sign in with email</span></div>}
      <form onSubmit={act} className="auth-form">
        {(mode === "signin" || mode === "signup" || mode === "forgot") && <label>Email address<span className="auth-input"><Mail size={17}/><input type="email" required autoComplete="email" placeholder="you@business.com" value={email} onChange={(event) => setEmail(event.target.value)}/></span></label>}
        {mode === "signup" && <label>Your name<span className="auth-input"><input type="text" required autoComplete="name" placeholder="Name shown in your profile" value={fullName} onChange={(event) => setFullName(event.target.value)}/></span></label>}
        {(mode === "signup" || mode === "signin" || mode === "update-password") && <label>{mode === "update-password" ? "New password" : "Password"}<span className="auth-input"><KeyRound size={17}/><input type={showPassword ? "text" : "password"} required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)}/><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>}
        {error && <div className="auth-message auth-error" role="alert">{error}</div>}{notice && <div className="auth-message auth-success" role="status">{notice}</div>}
        <button className="auth-submit" disabled={busy} type="submit">{busy ? <LoaderCircle className="auth-spinner" size={17}/> : null}{mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "update-password" ? "Save new password" : "Sign in"}<span>→</span></button>
      </form>
      <div className="auth-links">
        {mode === "signin" && <><button type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>Forgot password?</button><p>New to Saathi? <button type="button" onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create an account</button></p></>}
        {mode === "signup" && <p>Already have an account? <button type="button" onClick={() => setMode("signin")}>Sign in</button></p>}
        {(mode === "forgot" || mode === "update-password") && <p><button type="button" onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Back to sign in</button></p>}
      </div>
      <div className="auth-trust"><ShieldCheck size={15}/><span>Protected sign-in · your business data stays private</span></div>
    </section></div>
  </main>;
}
