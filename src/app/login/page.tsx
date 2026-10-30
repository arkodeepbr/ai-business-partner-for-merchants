import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-page"><div className="auth-card">Loading secure sign-in…</div></main>}><LoginForm /></Suspense>;
}
