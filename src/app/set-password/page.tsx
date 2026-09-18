"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

// Landing page for both an invite link and a "forgot password" link. Supabase
// signs the person in automatically when they click either link (that's what
// authenticates them here) — this page is just the missing step where they
// actually choose a password, instead of silently being logged in with no
// way to sign back in later.
export default function SetPasswordPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The invite/recovery link authenticates by putting a token in the URL.
    // Supabase uses one of two formats depending on settings, and our client
    // library doesn't auto-consume either one reliably, so we parse the URL
    // ourselves rather than just waiting on getSession() to pick it up.
    const establishSession = async () => {
      // Format 1: newer "PKCE" style link — a ?code=... query param.
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          window.history.replaceState(null, "", window.location.pathname);
          setHasSession(true);
          setChecking(false);
          return;
        }
      }

      // Format 2: classic link — access_token/refresh_token in the URL
      // fragment (after the #), the format Supabase is sending right now.
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error) {
          window.history.replaceState(null, "", window.location.pathname);
          setHasSession(true);
          setChecking(false);
          return;
        }
      }

      // Fallback: maybe a session already exists some other way. Check a
      // couple of times in case it's still settling.
      let attempts = 0;
      const check = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { setHasSession(true); setChecking(false); return; }
        attempts += 1;
        if (attempts < 6) { setTimeout(check, 500); } else { setChecking(false); }
      };
      check();
    };
    establishSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => { router.push("/"); router.refresh(); }, 1200);
  }

  return (
    <div className="shell" style={{ maxWidth: 380, paddingTop: 64 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Doué Creative" style={{ height: 64, width: "auto", marginBottom: 8 }} />
        <div className="brand">Set your password</div>
      </div>

      <div className="card">
        {checking && <p className="muted">One moment…</p>}

        {!checking && !hasSession && (
          <p className="muted">
            This link has expired or was already used. Ask Doué Creative to send you a new invite,
            or a new "forgot password" link from the sign-in page.
          </p>
        )}

        {!checking && hasSession && !done && (
          <form onSubmit={handleSubmit}>
            <label htmlFor="password">New password</label>
            <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <label htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error && <div className="error">{error}</div>}
            <button className="btn" type="submit" disabled={saving} style={{ marginTop: 16, width: "100%" }}>
              {saving ? "Saving…" : "Save password"}
            </button>
          </form>
        )}

        {done && <p className="muted">Password set — taking you in…</p>}
      </div>
    </div>
  );
}
