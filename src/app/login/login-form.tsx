"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, KeyRound, LoaderCircle, Mail, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "email-otp" | "phone-otp" | "forgot" | "update-password";

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [mode, setMode] = useState<Mode>(search.get("mode") === "update-password" ? "update-password" : "signin");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [phoneOtpPurpose, setPhoneOtpPurpose] = useState<"login" | "recovery">("login");
  const [emailOtpPurpose, setEmailOtpPurpose] = useState<"login" | "recovery" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(search.get("error") ? "Sign-in could not be completed. Please try again." : "");
  const [error, setError] = useState("");
  const report = (message: string) => { setError(message); setNotice(""); };
  const success = (message: string) => { setNotice(message); setError(""); };

  async function act(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const supabase = createClient();
    if (!supabase) { setBusy(false); report("Sign-in needs a Supabase project. Add its URL and publishable key to web/.env.local, then restart the web app."); return; }
    try {
      if (mode === "signup") {
        const { error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        setEmailOtpPurpose("signup"); setEmailCodeSent(true); setMode("email-otp"); success("We sent a verification code to your email. Enter it here to activate your account.");
      } else if (mode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.replace("/"); router.refresh();
      } else if (mode === "email-otp" && !emailCodeSent) {
        const result = emailOtpPurpose === "recovery" ? await supabase.auth.resetPasswordForEmail(email) : emailOtpPurpose === "signup" ? await supabase.auth.resend({ type: "signup", email }) : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (result.error) throw result.error;
        setEmailCodeSent(true); success("A verification code has been sent to your email.");
      } else if (mode === "email-otp") {
        const type = emailOtpPurpose === "recovery" ? "recovery" : emailOtpPurpose === "signup" ? "signup" : "email";
        const { error: authError } = await supabase.auth.verifyOtp({ email, token: otp, type });
        if (authError) throw authError;
        if (emailOtpPurpose === "recovery") { setMode("update-password"); setPassword(""); success("Email verified. Choose your new password."); }
        else { router.replace("/"); router.refresh(); }
      } else if (mode === "phone-otp" && !phoneCodeSent) {
        if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Enter your phone with country code, for example +919876543210.");
        const { error: authError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: phoneOtpPurpose === "login" } });
        if (authError) throw authError;
        setPhoneCodeSent(true); success("An SMS code is on its way. Enter it below to verify your phone.");
      } else if (mode === "phone-otp") {
        const { error: authError } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
        if (authError) throw authError;
        if (phoneOtpPurpose === "recovery") { setMode("update-password"); setPassword(""); success("Phone verified. Choose your new password."); }
        else { router.replace("/"); router.refresh(); }
      } else if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email);
        if (authError) throw authError;
        setEmailOtpPurpose("recovery"); setEmailCodeSent(true); setOtp(""); setMode("email-otp"); success("A password reset code has been sent to your email. Enter it to choose a new password.");
      } else if (mode === "update-password") {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        success("Your password has been changed."); router.replace("/"); router.refresh();
      }
    } catch (reason) { report(reason instanceof Error ? reason.message : "Could not complete that request."); }
    finally { setBusy(false); }
  }

  async function resendEmailCode() {
    const supabase = createClient();
    if (!supabase) { report("Add Supabase URL and publishable key in web/.env.local first."); return; }
    if (!email) { report("Enter your email address first."); return; }
    setBusy(true); setError("");
    const result = emailOtpPurpose === "recovery" ? await supabase.auth.resetPasswordForEmail(email) : emailOtpPurpose === "signup" ? await supabase.auth.resend({ type: "signup", email }) : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (result.error) report(result.error.message); else success("A fresh code has been sent to your email.");
  }

  async function googleSignIn() {
    const supabase = createClient();
    if (!supabase) { report("Add Supabase URL and publishable key in web/.env.local first."); return; }
    setBusy(true); setError("");
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
    if (authError) { setBusy(false); report(authError.message); }
  }

  const isOtp = mode === "email-otp" || mode === "phone-otp";
  const title = mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : mode === "update-password" ? "Choose a new password" : mode === "phone-otp" && !phoneCodeSent ? phoneOtpPurpose === "recovery" ? "Reset password by SMS" : "Sign in with your phone" : mode === "email-otp" && !emailCodeSent ? "Sign in with email code" : isOtp ? "Enter your verification code" : "Welcome back";
  const caption = mode === "signup" ? "A smarter business day starts here." : mode === "forgot" ? "We’ll email you a secure verification code." : mode === "update-password" ? "Set a strong password for your account." : mode === "phone-otp" && !phoneCodeSent ? "Enter your number with country code to receive a one-time SMS." : mode === "email-otp" && !emailCodeSent ? "Enter your email to receive a one-time sign-in code." : isOtp ? `We sent a code to ${mode === "phone-otp" ? phone : email}.` : "Sign in to your Paytm Saathi workspace.";

  return <main className="auth-page"><div className="auth-glow auth-glow-one"/><div className="auth-glow auth-glow-two"/>
    <Link href="/" className="auth-back"><ArrowLeft size={16}/> Back to Saathi</Link>
    <section className="auth-card"><div className="auth-brand"><span className="brand-mark"><i/><i/><i/></span><span className="brand-name">paytm<span>.</span><small>SAATHI</small></span></div>
      <div className="auth-kicker"><Sparkles size={14}/> MERCHANT GROWTH PARTNER</div><h1>{title}</h1><p className="auth-caption">{caption}</p>
      {mode === "signin" && <button className="google-auth" type="button" onClick={() => void googleSignIn()} disabled={busy}><span className="google-g">G</span> Continue with Google</button>}
      {mode === "signin" && <div className="auth-divider"><span>or sign in with email</span></div>}
      <form onSubmit={act} className="auth-form">
        {(mode === "signin" || mode === "signup" || mode === "forgot" || mode === "email-otp") && <label>Email address<span className="auth-input"><Mail size={17}/><input type="email" required autoComplete="email" placeholder="you@business.com" value={email} onChange={(event) => setEmail(event.target.value)}/></span></label>}
        {mode === "phone-otp" && !phoneCodeSent && <label>Phone number<span className="auth-input"><Phone size={17}/><input type="tel" required autoComplete="tel" placeholder="+919876543210" value={phone} onChange={(event) => setPhone(event.target.value)}/></span></label>}
        {(mode === "signup" || mode === "signin" || mode === "update-password") && <label>{mode === "update-password" ? "New password" : "Password"}<span className="auth-input"><KeyRound size={17}/><input type={showPassword ? "text" : "password"} required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)}/><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>}
        {((mode === "email-otp" && emailCodeSent) || (mode === "phone-otp" && phoneCodeSent)) && <label>Verification code<span className="auth-input"><ShieldCheck size={17}/><input inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={8} placeholder="Enter your code" value={otp} onChange={(event) => setOtp(event.target.value)}/></span></label>}
        {error && <div className="auth-message auth-error" role="alert">{error}</div>}{notice && <div className="auth-message auth-success" role="status">{notice}</div>}
        <button className="auth-submit" disabled={busy} type="submit">{busy ? <LoaderCircle className="auth-spinner" size={17}/> : null}{mode === "phone-otp" && !phoneCodeSent ? "Send SMS code" : mode === "email-otp" && !emailCodeSent ? "Send email code" : isOtp ? "Verify code" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset code" : mode === "update-password" ? "Save new password" : "Sign in"}<span>→</span></button>
      </form>
      <div className="auth-links">
        {mode === "signin" && <><button type="button" onClick={() => { setMode("forgot"); setEmailOtpPurpose("recovery"); setError(""); setNotice(""); }}>Forgot password?</button><button type="button" onClick={() => { setMode("phone-otp"); setPhoneOtpPurpose("recovery"); setPhoneCodeSent(false); setError(""); setNotice(""); }}>Reset password by SMS code</button><button type="button" onClick={() => { setEmailOtpPurpose("login"); setMode("email-otp"); setError(""); setNotice(""); }}>Sign in with email code</button><button type="button" onClick={() => { setPhoneOtpPurpose("login"); setPhoneCodeSent(false); setMode("phone-otp"); setError(""); setNotice(""); }}><Phone size={13}/> Use phone and SMS code</button><p>New to Saathi? <button type="button" onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create an account</button></p></>}
        {mode === "signup" && <p>Already have an account? <button type="button" onClick={() => setMode("signin")}>Sign in</button></p>}
        {(mode === "forgot" || isOtp || mode === "update-password") && <p><button type="button" onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Back to sign in</button></p>}
      </div>
      {mode === "email-otp" && emailCodeSent && <button className="resend-code" type="button" onClick={() => void resendEmailCode()} disabled={busy}>Resend email code</button>}
      {mode === "phone-otp" && phoneCodeSent && <button className="resend-code" type="button" onClick={() => { setPhoneCodeSent(false); setOtp(""); setNotice(""); }}>Change phone number</button>}
      <div className="auth-trust"><ShieldCheck size={15}/><span>Protected sign-in · your business data stays private</span></div>
    </section><p className="auth-footnote">By continuing, you agree to use Saathi with your authorized merchant account.</p>
  </main>;
}
