"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Head } from "@/components/pixel";
import { SiteFooter, SiteNav } from "@/components/site";
import { Button, Input } from "@/components/ui";
import { api } from "@/lib/client";

// "Register your interest in a free trial". From an outreach email the link carries a signed token, so one click
// is enough: the page saves it from the browser (link scanners don't run scripts) and says "you're on the list".
// Without a token it's a short form.
const CREW = [{ kind: "inbox", hue: 65 }, { kind: "research", hue: 185 }, { kind: "invoices", hue: 140 }, { kind: "leads", hue: 15 }, { kind: "brief", hue: 95 }];

export default function Trial() {
  const [state, setState] = useState<"saving" | "done" | "form">("saving");
  const [business, setBusiness] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [f, setF] = useState({ business: "", name: "", email: "", phone: "", website: "" });
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const sp = new URLSearchParams(location.search);
    const t = sp.get("t");
    if (sp.has("waitlist")) { queueMicrotask(() => { setWaiting(true); setState("done"); }); return; } // signed in without an invite
    if (!t) { queueMicrotask(() => setState("form")); return; }
    api<{ business?: string }>("/api/interest", { json: { t } })
      .then((r) => { setBusiness(r.business ?? ""); setState("done"); })
      .catch(() => setState("form"));
  }, []);

  const submit = async () => {
    setError(null);
    try {
      const r = await api<{ business?: string }>("/api/interest", { json: f });
      setBusiness(r.business ?? f.business);
      setState("done");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--night)", color: "var(--night-ink)" }}>
      <SiteNav />
      <main style={{ flex: 1, display: "grid", placeItems: "center", padding: "40px 16px 64px" }}>
        <div style={{ width: "min(560px, 100%)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div aria-hidden style={{ display: "flex", gap: 14, alignItems: "flex-end", minHeight: 70 }}>
            {CREW.map((b, i) => (
              <div key={b.kind} style={{ animation: state === "done" ? `ns-cheer .9s ${0.1 + i * 0.12}s ease-in-out 2 both` : `ns-bob .6s ${i * 0.15}s steps(2) infinite alternate`, transformOrigin: "50% 100%" }}>
                <Head bot={b} size={4} />
              </div>
            ))}
          </div>

          {state === "saving" && <div style={{ color: "var(--night-muted)", fontSize: 16 }}>Saving your spot…</div>}

          {state === "done" && (
            <>
              <h1 className="pixel" style={{ margin: 0, fontSize: 34, color: "var(--gold)", lineHeight: 1.15 }}>You&apos;re on the list!</h1>
              <p style={{ margin: 0, fontSize: 17.5, lineHeight: 1.6, color: "#e6d8c8" }}>
                {waiting ? "Free trials are invite-only for now, and you're on the waitlist. We'll email you as soon as yours is ready." : <>Thanks{business ? <>, <b>{business}</b></> : ""}. We&apos;ll email you within two business days to set up your free trial.</>}
              </p>
              <ol style={{ textAlign: "left", margin: "6px 0 0", padding: "18px 20px 18px 40px", background: "#2d2330", borderRadius: 14, fontSize: 15.5, lineHeight: 1.7, color: "#e6d8c8", width: "100%" }}>
                <li>We&apos;ll reach out to pick a time that suits you: about 15 minutes.</li>
                <li>We connect your inbox together and your team of bots starts that night.</li>
                <li>Each morning, you approve what they drafted. Nothing goes out without your OK.</li>
              </ol>
              <p style={{ margin: 0, fontSize: 14, color: "var(--night-muted)" }}>Questions in the meantime? <a href="mailto:admin@nightshiftai.ca" style={{ color: "var(--gold)" }}>admin@nightshiftai.ca</a></p>
            </>
          )}

          {state === "form" && (
            <>
              <h1 className="pixel" style={{ margin: 0, fontSize: 32, color: "var(--gold)", lineHeight: 1.15 }}>Try Nightshift free</h1>
              <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "#e6d8c8" }}>AI teammates that sort your inbox, chase invoices and follow up on quotes overnight, and wait for your OK. Leave your details and we&apos;ll set you up.</p>
              <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
                <Input required placeholder="Business name" value={f.business} onChange={(e) => setF({ ...f, business: e.target.value })} />
                <Input placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <Input required type="email" placeholder="Work email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                <Input placeholder="Phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                {/* people never see this field; bots fill it in */}
                <input tabIndex={-1} autoComplete="off" aria-hidden value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
                {error && <div style={{ color: "#ffb4a6", fontSize: 14 }}>{error}</div>}
                <Button type="submit" size="lg" disabled={!f.business || !f.email} style={{ background: "var(--gold)", color: "var(--outline)", border: 0 }}>Save my spot</Button>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--night-muted)" }}>We&apos;ll only use this to set up your trial. See our <Link href="/legal/privacy" style={{ color: "var(--gold)" }}>privacy policy</Link>.</p>
              </form>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
