"use client";

import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Finishing your secure sign-in…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function completeAuth() {
      const params = new URLSearchParams(window.location.search);
      const requestedNext = params.get("next") ?? "/";
      const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
      const recovery = next.includes("mode=update-password");
      const tokenHash = params.get("token_hash");
      const supabase = createClient();
      if (!supabase) {
        if (active) { setFailed(true); setMessage("Saathi sign-in is not configured. Please contact the administrator."); }
        return;
      }

      let authError: Error | null = null;
      let hasSession = false;
      const hasRecoveryPayload = params.has("code") || !!tokenHash || window.location.hash.includes("access_token=");
      if (tokenHash && params.get("type") === "recovery") {
        const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        authError = result.error;
        hasSession = !!result.data.session;
      } else {
        // createBrowserClient processes Supabase PKCE codes and legacy token
        // fragments during initialization; getSession waits for that work.
        const result = await supabase.auth.getSession();
        authError = result.error;
        hasSession = !!result.data.session;
      }

      if (!hasRecoveryPayload && recovery) authError = new Error("The reset link did not include a recovery token.");
      if (authError || !hasSession) {
        if (active) { setFailed(true); setMessage(recovery ? "This password reset link could not be verified. It may have expired; request a new reset email." : "Sign-in could not be verified. Please try again."); }
        return;
      }
      if (active) {
        setMessage(recovery ? "Verified. Opening the new password form…" : "Signed in. Opening Saathi…");
        window.location.replace(next);
      }
    }
    void completeAuth().catch(() => {
      if (active) { setFailed(true); setMessage("This link could not be verified. It may have expired; request a new one and open it in the same browser."); }
    });
    return () => { active = false; };
  }, []);

  return <main className="auth-callback-page"><div className="auth-callback-card"><span className="auth-callback-icon">{failed ? <CircleAlert size={23}/> : <Sparkles size={23}/>}</span><h1>{failed ? "Link not verified" : "Welcome to Saathi"}</h1><p role={failed ? "alert" : "status"}>{message}</p>{failed ? <a href="/login?mode=forgot">Request a fresh reset link</a> : <LoaderCircle className="auth-spinner" size={18}/>}</div></main>;
}
