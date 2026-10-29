"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Desk, OwnerDesk } from "@/components/pixel";
import { Button, ErrorLine, Input } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { supabase } from "@/lib/client";

// H2 Sign in / sign up, A1 Check your email, A2 Link expired.
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"form" | "sent" | "expired">("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/office");
  const [isNew, setIsNew] = useState(false);
  const [code, setCode] = useState("");
  // Google / Microsoft buttons show only once those providers are switched on in Supabase Auth.
  const [providers, setProviders] = useState<{ google: boolean; azure: boolean }>({ google: false, azure: false });

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } })
      .then((r) => r.json())
      .then((j) => setProviders({ google: !!j.external?.google, azure: !!j.external?.azure }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    queueMicrotask(() => {
      if (q.get("next")?.startsWith("/")) setNext(q.get("next")!);
      if (q.get("expired") || /expired|invalid/i.test(q.get("error_description") ?? "")) setState("expired");
      if (q.get("new")) setIsNew(true);
    });
  }, []);

  const redirect = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const sendLink = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect() } });
    setBusy(false);
    if (error) setError(/rate limit/i.test(error.message) ? "Too many sign-in emails just now. Wait a few minutes, or use the code from the last email." : error.message);
    else setState("sent");
  };
  const verifyCode = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
    setBusy(false);
    if (error) setError(/expired|invalid/i.test(error.message) ? "That code didn't work. Check the newest email, or send a new one." : error.message);
    else location.assign(next);
  };
  const oauth = async (provider: "google" | "azure") => {
    const { error } = await supabase().auth.signInWithOAuth({ provider, options: { redirectTo: redirect(), scopes: provider === "azure" ? "email" : undefined } });
    if (error) setError(error.message);
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", background: "var(--paper)" }} className="ns-signin">
      <section style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px clamp(24px, 6vw, 96px)", gap: 22 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink)", textDecoration: "none" }}>
          <Logo tone="light" size={18} />
        </Link>

        {state === "form" && (
          <>
            <div>
              <h1 style={{ fontSize: 34, margin: "0 0 8px", letterSpacing: "-.01em" }}>{isNew ? "Start your night shift" : "Welcome back"}</h1>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 16 }}>{isNew ? "14 days of Studio, free. No card needed." : "Your team kept things running while you were away."}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 380 }}>
              {providers.google && <Button kind="outline" size="lg" onClick={() => oauth("google")} style={{ background: "#fff" }}>Continue with Google</Button>}
              {providers.azure && <Button kind="outline" size="lg" onClick={() => oauth("azure")} style={{ background: "#fff" }}>Continue with Microsoft</Button>}
              {(providers.google || providers.azure) && <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--faint)", fontSize: 13, margin: "6px 0" }}><span style={{ flex: 1, height: 1, background: "var(--line)" }} />or<span style={{ flex: 1, height: 1, background: "var(--line)" }} /></div>}
              <form onSubmit={(e) => { e.preventDefault(); sendLink(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 13.5, fontWeight: 600 }}>Work email
                  <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" style={{ marginTop: 6 }} />
                </label>
                <Button type="submit" size="lg" disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Email me a sign-in link"}</Button>
              </form>
              <ErrorLine error={error} />
              <p style={{ fontSize: 14, color: "var(--muted)" }}>
                {isNew ? <>Already have an account? <a href="/signin">Sign in</a></> : <>New to Nightshift? <a href="/signin?new=1">Start a free trial</a></>}
              </p>
            </div>
          </>
        )}

        {state === "sent" && (
          // A1 Check your email
          <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
            <h1 style={{ fontSize: 30, margin: 0 }}>Check your email</h1>
            <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 16, lineHeight: 1.55 }}>We sent a sign-in link to <b>{email}</b>. It works for 15 minutes. Or type the 6-digit code from the same email:</p>
            {/* the code works in any browser, even when the link opens somewhere else or a mail scanner used it up */}
            <form onSubmit={(e) => { e.preventDefault(); verifyCode(); }} style={{ display: "flex", gap: 10 }}>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" style={{ maxWidth: 160, letterSpacing: ".2em", fontSize: 18 }} />
              <Button type="submit" disabled={busy || code.length < 6}>Sign in</Button>
            </form>
            <ErrorLine error={error} />
            <div style={{ display: "flex", gap: 10 }}>
              <Button kind="outline" onClick={sendLink} disabled={busy}>Resend link</Button>
              <Button kind="ghost" onClick={() => setState("form")}>Use a different email</Button>
            </div>
          </div>
        )}

        {state === "expired" && (
          // A2 Link expired
          <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
            <h1 style={{ fontSize: 30, margin: 0 }}>That link has expired</h1>
            <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 16, lineHeight: 1.55 }}>Sign-in links last 15 minutes and work once. We&apos;ll send you a new one.</p>
            <form onSubmit={(e) => { e.preventDefault(); sendLink(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" />
              <Button type="submit" disabled={busy || !email.includes("@")}>Send a new link</Button>
            </form>
            <ErrorLine error={error} />
          </div>
        )}
      </section>

      <section className="ns-signin-art" style={{ position: "relative", background: "var(--night)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 480, height: 420 }}>
          <div style={{ position: "absolute", left: 20, top: 30, width: 200, height: 150 }}><Desk bot={{ kind: "inbox", hue: 65, prop: "papers" }} state="hand" /></div>
          <div style={{ position: "absolute", left: 260, top: 30, width: 200, height: 150 }}><Desk bot={{ kind: "invoices", hue: 140, prop: "coins" }} state="typing" /></div>
          <div style={{ position: "absolute", left: 100, top: 230, width: 280, height: 150 }}><OwnerDesk /></div>
        </div>
        <div className="pixel" style={{ position: "absolute", bottom: 36, left: 0, right: 0, textAlign: "center", color: "var(--night-ink)", fontSize: 16 }}>Quiet night so far. Your drafts will be waiting.</div>
      </section>
      <style>{`@media (max-width: 860px) { .ns-signin { grid-template-columns: 1fr !important; } .ns-signin-art { display: none !important; } }`}</style>
    </main>
  );
}
