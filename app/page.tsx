"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";

// Placeholder until the real UI (office, chat, bot room) comes from Claude Design: sign in, see the team,
// connect services and make a CLI token.

const supabase = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Me = {
  user: { email: string; role: string };
  workspace: { name: string; timezone: string; daily_budget_usd: number };
  plan: { name: string; active: boolean };
  connections: { id: string; provider: string; account: string; status: string }[];
  search: boolean;
  waiting: number;
  open_flags: number;
  spent_today_usd: number;
};
type Desk = { kind: string; name: string; role: string; status_text: string; approval: string };

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    fetch("/api/me").then(async (r) => {
      const q = new URLSearchParams(location.search);
      if (q.get("connected")) setNote(`Connected ${q.get("connected")}.`);
      if (q.get("connect_error")) setNote(`Couldn't connect: ${q.get("connect_error")}`);
      if (r.ok) {
        setMe(await r.json());
        setDesks((await (await fetch("/api/office")).json()).desks ?? []);
        setState("in");
      } else {
        setState("out");
        if (r.status === 403) setNote((await r.json()).error);
      }
    });
  }, []);

  const signIn = async () => {
    const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setNote(error ? error.message : "Check your email for the sign-in link.");
  };
  const makeToken = async () => {
    const r = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "CLI" }) });
    const j = await r.json();
    setToken(j.token ?? j.error);
  };

  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1 style={{ marginBottom: 4 }}>Nightshift</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>Your business bots. The real interface is on its way; this page is for setup.</p>
      {note && <p style={{ border: "1px solid #8884", padding: "8px 12px", borderRadius: 6 }}>{note}</p>}

      {state === "out" && (
        <p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" style={{ padding: 8, width: 260 }} />{" "}
          <button onClick={signIn}>Send sign-in link</button>
        </p>
      )}

      {state === "in" && me && (
        <>
          <p>
            Signed in as {me.user.email} ({me.user.role}) · {me.workspace.name} · {me.plan.name} · spent today ${me.spent_today_usd.toFixed(3)} of ${Number(me.workspace.daily_budget_usd).toFixed(2)} ·{" "}
            {me.waiting} waiting for you · {me.open_flags} flags
          </p>
          <h2>Team</h2>
          <ul>
            {desks.map((b) => (
              <li key={b.kind}>
                <b>{b.name}</b> · {b.role}: {b.status_text || "idle"} ({b.approval === "ask" ? "asks before emailing" : "emails on its own"}; money always asks)
              </li>
            ))}
          </ul>
          <h2>Connections</h2>
          <ul>
            {me.connections.map((c) => (
              <li key={c.id}>{c.provider}: {c.account} ({c.status})</li>
            ))}
            <li>Web search: {me.search ? "on" : "off (TAVILY_API_KEY)"}</li>
          </ul>
          <p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- these leave the site for Google and Microsoft */}
            <a href="/api/connect/google">Connect Gmail + Calendar</a> · <a href="/api/connect/microsoft">Connect Outlook</a> · Stripe, Shopify, HubSpot and Google Sheets: POST to /api/connect/&lt;provider&gt;
          </p>
          <h2>CLI</h2>
          <p>Run <code>nightshift login</code>; it opens this site to approve the device. Or make an API key:</p>
          <p>
            <button onClick={makeToken}>Make a read-only API key</button>
          </p>
          {token && <pre style={{ border: "1px solid #8884", padding: 12, borderRadius: 6, whiteSpace: "pre-wrap" }}>nightshift login {location.origin} {token}</pre>}
        </>
      )}
    </main>
  );
}
