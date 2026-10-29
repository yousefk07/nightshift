"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Head } from "@/components/pixel";
import { Button } from "@/components/ui";
import { ago, api, ApiError } from "@/lib/client";

// `nightshift login` sends people here to approve their terminal. It shows what's asking (the device's name,
// when, from which network) and only approves once the person confirms the code matches their own terminal.
interface Info { device: string; requested_at: string | null; from: string | null; agent: string | null; expires_at: string; approved: boolean }

export default function Device() {
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [problem, setProblem] = useState<{ text: string; signIn?: boolean } | null>(null);
  const [matches, setMatches] = useState(false);
  const [done, setDone] = useState<"full" | "read" | null>(null);

  useEffect(() => {
    const c = (new URLSearchParams(location.search).get("code") ?? "").toUpperCase();
    queueMicrotask(() => setCode(c));
    if (!c) return;
    api<Info>(`/api/device/code?code=${encodeURIComponent(c)}`)
      .then((i) => { setInfo(i); if (i.approved) setDone("full"); })
      .catch((e: ApiError) => setProblem(e.status === 401 ? { text: "Sign in to Nightshift first, then come back to this page.", signIn: true } : { text: e.message }));
  }, []);

  const approve = async (scope: "full" | "read") => {
    await api("/api/device/approve", { json: { code, scope } });
    setDone(scope);
  };

  const row = (k: string, v: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderTop: "1px solid #ece3d6", fontSize: 14 }}>
      <span style={{ color: "#776a5e" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );

  return (
    <main style={{ minHeight: "100dvh", background: "var(--night)", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "min(460px, 100%)", display: "flex", flexDirection: "column", gap: 18 }}>
        <Link href="/" style={{ textDecoration: "none", alignSelf: "center" }}><Logo tone="dark" size={20} /></Link>
        <section style={{ background: "#fbf7f1", color: "#2b2320", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 30px 70px -30px rgba(0,0,0,.6)" }}>
          {done ? (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ animation: "ns-wave .9s ease-in-out 3", transformOrigin: "50% 100%" }}><Head bot={{ kind: "inbox", hue: 65 }} size={5} /></div>
              <h1 style={{ margin: 0, fontSize: 24 }}>Your terminal is signed in</h1>
              <p style={{ margin: 0, color: "#5d5148", lineHeight: 1.55 }}>{done === "read" ? "It can look but not change anything." : "It can see the team and approve cards."} Go back to your terminal; you can close this tab. Remove it any time in Settings → API &amp; CLI.</p>
            </div>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#b46a22" }}>nightshift login</div>
                <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Approve a terminal</h1>
              </div>
              <div className="pixel" style={{ fontSize: 34, letterSpacing: ".12em", textAlign: "center", padding: "14px 0", background: "#f1e9dd", borderRadius: 10 }}>{code || "…"}</div>
              {problem ? (
                <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>
                  {problem.text}{" "}
                  {problem.signIn && <Link href={`/signin?next=${encodeURIComponent(`/device?code=${code}`)}`} style={{ color: "#b46a22", fontWeight: 600 }}>Sign in</Link>}
                </div>
              ) : info ? (
                <>
                  <div>
                    {row("Device", info.device)}
                    {info.requested_at && row("Asked", ago(info.requested_at))}
                    {info.from && row("From network", info.from)}
                    {row("Code expires", new Date(info.expires_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}
                  </div>
                  <div style={{ background: "#fbefd9", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.5, color: "#6b4a1a" }}>
                    Only approve this if <b>you</b> just ran <code className="mono">nightshift login</code> on your own computer. Approving someone else&apos;s code lets them into your workspace.
                  </div>
                  <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={matches} onChange={(e) => setMatches(e.target.checked)} style={{ width: 18, height: 18 }} />
                    The code above matches the one in my terminal
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button size="lg" disabled={!matches} onClick={() => approve("full")}>Approve</Button>
                    <Button size="lg" kind="outline" disabled={!matches} onClick={() => approve("read")}>Read only</Button>
                  </div>
                </>
              ) : (
                <div style={{ color: "#776a5e" }}>{code ? "Checking the code…" : "Open the link your terminal printed."}</div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
