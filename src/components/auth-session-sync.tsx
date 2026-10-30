"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

export function AuthSessionSync() {
  const setAccessToken = useSession((state) => state.setAccessToken);
  const setEmail = useSession((state) => state.setEmail);
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let alive = true;
    let exchanging = false;
    const applySession = async (session: { access_token: string; user: { email?: string } } | null) => {
      setEmail(session?.user.email ?? null);
      if (!session) { setAccessToken(null); return; }
      if (exchanging) return;
      exchanging = true;
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}/api/v1/auth/session`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: session.access_token }), cache: "no-store",
        });
        if (!response.ok) throw new Error(`API session exchange failed (${response.status})`);
        const result = await response.json() as { access_token: string };
        if (alive) setAccessToken(result.access_token);
      } catch (error) {
        console.error("Could not connect the identity session to Saathi API", error);
        if (alive) setAccessToken(null);
      } finally { exchanging = false; }
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { void applySession(session); });
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [setAccessToken, setEmail]);
  return null;
}
