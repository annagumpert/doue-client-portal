"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleForgotPassword() {
    setError(null);
    setResetMsg(null);
    if (!email) { setError("Enter your email above first, then click \"Forgot password?\" again."); return; }
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/set-password`,
    });
    if (error) { setError(error.message); return; }
    setResetMsg("If that email has an account, a reset link is on its way.");
  }

  return (
    <div className="shell" style={{ maxWidth: 380, paddingTop: 64 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Doué Creative" style={{ height: 64, width: "auto", marginBottom: 8 }} />
        <div className="brand">Client Portal</div>
      </div>
      <form className="card" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error">{error}</div>}
        {resetMsg && <div className="muted" style={{ marginTop: 6 }}>{resetMsg}</div>}
        <button className="btn" type="submit" disabled={loading} style={{ marginTop: 16, width: "100%" }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={handleForgotPassword}
          className="muted"
          style={{ background: "none", border: "none", padding: 0, marginTop: 10, cursor: "pointer", textDecoration: "underline", font: "inherit" }}
        >
          Forgot password?
        </button>
      </form>
      <p className="muted">
        New client accounts are created by Doué Creative — reach out if you need access.
      </p>
    </div>
  );
}
