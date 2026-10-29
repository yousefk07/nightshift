"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton, KINDS, type Kind } from "@/components/Connect";
import { Desk, Head } from "@/components/pixel";
import { Button, ErrorLine, Input, Select, Toggle } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { api, ApiError } from "@/lib/client";

// O1-O5: Your business, Connect tools, Pick your team, Approval rules, then "Your team clocks in at 7 PM".

interface Me { user: { email: string; role: string }; workspace: { name: string; about: string; industry: string; team_size: string | null; pain_points: string[]; timezone: string; onboarding_step: number; onboarded_at: string | null; shift_start: string; brief_prefs: { time: string } }; plan: { limits: { bots: number } }; connections: { provider: string; kinds: string[]; account: string; status: string }[] }
interface CatalogBot { id: string; name: string; role: string; title: string; hue: number; prop: string; needs: string[]; missing: string[]; suggested: boolean; hired: boolean; industries: string[] }

const STEPS = ["Your business", "Connect tools", "Pick your team", "Approval rules"];
const PAINS = ["Answering email", "Chasing invoices", "Following up leads", "Researching suppliers", "Keeping track of it all"];
const SIZES = ["Just me", "2–5 people", "6–15 people", "16–50 people", "50+ people"];
const ZONES: [string, string][] = [["America/St_Johns", "Newfoundland Time"], ["America/Halifax", "Atlantic Time"], ["America/Toronto", "Eastern Time"], ["America/Winnipeg", "Central Time"], ["America/Edmonton", "Mountain Time"], ["America/Vancouver", "Pacific Time"], ["America/Anchorage", "Alaska Time"], ["Pacific/Honolulu", "Hawaii Time"], ["Europe/London", "UK Time"], ["Europe/Paris", "Central European Time"], ["Australia/Sydney", "Sydney Time"]];
const CORE = ["inbox", "invoices", "brief", "leads", "research"];

const pill = (on: boolean): React.CSSProperties => ({ padding: "9px 14px", borderRadius: 20, fontSize: 14.5, cursor: "pointer", background: on ? "#2b2320" : "transparent", color: on ? "#fbf3e6" : "#2b2320", border: on ? "1px solid #2b2320" : "1px solid #cdbfac" });

export default function Onboarding() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [step, setStep] = useState(1);
  const [biz, setBiz] = useState({ name: "", about: "", industry: "general", team_size: "2–5 people", timezone: "America/Toronto", pain_points: [] as string[] });
  const [industries, setIndustries] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<CatalogBot[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [browse, setBrowse] = useState(false);
  const [rules, setRules] = useState({ brief_time: "06:30", pause_on_dispute: true, alert_phone: true, invite: false, invite_email: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ clocks_in: string; first_brief: string } | null>(null);

  const loadMe = async () => {
    try {
      const m = await api<Me>("/api/me");
      setMe(m);
      return m;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace("/signin?next=/onboarding");
      return null;
    }
  };
  useEffect(() => {
    queueMicrotask(async () => {
      const m = await loadMe();
      if (!m) return;
      if (m.user.role !== "owner") return router.replace("/office");
      const w = m.workspace;
      setBiz({ name: w.name === "My business" ? "" : w.name, about: w.about, industry: w.industry, team_size: w.team_size ?? "2–5 people", timezone: w.timezone, pain_points: w.pain_points });
      setStep(Math.min(Math.max(w.onboarding_step, 1), 4));
      const c = await api<{ industries: Record<string, string> }>("/api/catalog?industry=general");
      setIndustries(c.industries);
      // back from an OAuth connect: stay on step 2
      if (new URLSearchParams(location.search).get("connected")) setStep(2);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCatalog = async () => {
    const c = await api<{ bots: CatalogBot[] }>(`/api/catalog?industry=${biz.industry}`);
    setCatalog(c.bots);
    setPicked(new Set(c.bots.filter((b) => b.suggested).map((b) => b.id)));
  };
  // Coming back to step 3 or 4 (a reload, Save and exit, a connect round trip): the team list loads again with the
  // suggested bots picked, so "Start the night shift" never sends an empty team.
  useEffect(() => {
    if (me && step >= 3 && !catalog.length) queueMicrotask(loadCatalog);
  }, [me, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (nextStep: number, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/onboarding", { method: "PATCH", json: { step: nextStep, ...extra } });
      if (nextStep === 3) await loadCatalog();
      setStep(nextStep);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ clocks_in: string; first_brief: string }>("/api/onboarding", {
        json: { bots: [...picked], brief_time: rules.brief_time, pause_on_dispute: rules.pause_on_dispute, ...(rules.invite && rules.invite_email ? { invite: { email: rules.invite_email, role: "approver_email" } } : {}) },
      });
      if (!rules.alert_phone) await api("/api/notifications/prefs", { method: "PUT", json: { events: { dispute_or_complaint: ["app", "email"] } } });
      setDone(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const has = (kind: Kind) => (me?.connections ?? []).some((c) => c.kinds.includes(kind) && c.status === "ok");
  const shown = useMemo(() => {
    const list = browse ? catalog : catalog.filter((b) => b.suggested || CORE.includes(b.id));
    return [...list].sort((a, b) => (CORE.indexOf(a.id) + 1 || 99) - (CORE.indexOf(b.id) + 1 || 99));
  }, [catalog, browse]);
  const max = me?.plan.limits.bots ?? 10;
  const fmt = (t: string) => new Date(`2000-01-01T${t.slice(0, 5)}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: t.slice(3, 5) === "00" ? undefined : "2-digit" });

  if (!me) return <main style={{ minHeight: "100vh", background: "#f6f0e7" }} />;

  if (done) {
    // O5 Done
    return (
      <main style={{ minHeight: "100vh", background: "var(--night)", color: "var(--night-ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 24, textAlign: "center" }}>
        <div className="pixel" style={{ fontSize: 14, letterSpacing: ".12em", color: "var(--gold)" }}>YOU&apos;RE ALL SET</div>
        <h1 style={{ margin: 0, fontSize: 40 }}>Your team clocks in at {fmt(done.clocks_in)}</h1>
        <p style={{ margin: 0, color: "var(--night-muted)", fontSize: 17, maxWidth: 520 }}>{picked.has("inbox") ? "Penny is already reading today's mail. " : ""}Your first brief arrives tomorrow at {fmt(done.first_brief)}.</p>
        <div style={{ display: "flex", gap: 24, margin: "18px 0" }}>
          {catalog.filter((b) => picked.has(b.id)).slice(0, 3).map((b, i) => (
            <div key={b.id} style={{ width: 200 }}>
              <div style={{ position: "relative", height: 150 }}><Desk bot={{ kind: b.id, hue: b.hue, prop: b.prop }} state={i === 0 ? "typing" : "idle"} /></div>
              <div className="pixel" style={{ marginTop: 6, fontSize: 14 }}>{b.name.toUpperCase()} · {i === 0 && b.id === "inbox" ? "reading" : b.id === "brief" ? fmt(done.first_brief) : fmt(done.clocks_in)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button kind="gold" size="lg" onClick={() => router.push("/office")}>Go to the office</Button>
          <Link href="/docs"><Button kind="night" size="lg">Get the CLI</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f6f0e7", color: "#2b2320" }}>
      <header style={{ minHeight: 72, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "0 clamp(16px,4vw,40px)", borderBottom: "1px solid #e4d9ca", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo tone="light" size={18} />
        </div>
        <ol className="ns-steps" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", gap: 28, fontSize: 14 }}>
          {STEPS.map((s, i) => {
            const n = i + 1, cur = n === step, past = n < step;
            return (
              <li key={s} aria-current={cur ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: cur ? 600 : 400, color: cur ? "#2b2320" : "#716459" }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, ...(cur || past ? { background: "#2b2320", color: "#fbf3e6" } : { border: "1px solid #cdbfac" }) }}>{past ? "✓" : n}</span>{s}
              </li>
            );
          })}
        </ol>
        <Link href="/office" style={{ fontSize: 14, color: "#716459" }}>Save and exit</Link>
      </header>

      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "48px clamp(16px,4vw,40px)" }}>
        <div style={{ width: "100%", maxWidth: step === 3 ? 880 : 640, display: "flex", flexDirection: "column", gap: 24 }}>
          {step === 1 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: 34 }}>Tell the team about your business</h1>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "#5d5148" }}>This is how they&apos;ll learn what matters and how you like to sound.</p>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>Business name
                <Input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} style={{ height: 48, borderRadius: 10, fontSize: 15.5 }} placeholder="Kiln & Co." />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>What do you do, in a sentence?
                <Input value={biz.about} onChange={(e) => setBiz({ ...biz, about: e.target.value })} style={{ height: 48, borderRadius: 10, fontSize: 15.5 }} placeholder="A ceramics studio. We sell pottery and run workshops for teams." />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>What kind of business is it?
                <Select value={biz.industry} onChange={(e) => setBiz({ ...biz, industry: e.target.value })} style={{ height: 48, borderRadius: 10, fontSize: 15.5 }}>
                  {Object.entries(industries).sort((a, b) => (a[0] === "general" ? -1 : b[0] === "general" ? 1 : a[1].localeCompare(b[1]))).map(([k, v]) => <option key={k} value={k}>{k === "general" ? "Something else" : v}</option>)}
                </Select>
                <span style={{ fontWeight: 400, fontSize: 13, color: "#716459" }}>We&apos;ll suggest bots that know your line of work.</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>Team size
                  <Select value={biz.team_size} onChange={(e) => setBiz({ ...biz, team_size: e.target.value })} style={{ height: 48, borderRadius: 10 }}>{SIZES.map((s) => <option key={s}>{s}</option>)}</Select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>Time zone
                  <Select value={biz.timezone} onChange={(e) => setBiz({ ...biz, timezone: e.target.value })} style={{ height: 48, borderRadius: 10 }}>
                    {ZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}
                    {!ZONES.some(([z]) => z === biz.timezone) && <option value={biz.timezone}>{biz.timezone}</option>}
                  </Select>
                </label>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>What eats your evenings? <span style={{ fontWeight: 400, color: "#716459" }}>Pick any</span></span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PAINS.map((p) => {
                    const on = biz.pain_points.includes(p);
                    return <button key={p} type="button" aria-pressed={on} onClick={() => setBiz({ ...biz, pain_points: on ? biz.pain_points.filter((x) => x !== p) : [...biz.pain_points, p] })} style={pill(on)}>{p}</button>;
                  })}
                </div>
              </div>
              <ErrorLine error={error} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <Button size="lg" disabled={busy || !biz.name.trim()} onClick={() => save(2, biz)}>Continue</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: 34 }}>Connect the tools your team will work in</h1>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "#5d5148" }}>Bots get read and draft access. Nothing is sent and no money moves without your OK, and you can disconnect anything later.</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid #e4d9ca", borderRadius: 12, background: "#fffbf4" }}>
                {(["email", "accounting", "crm", "calendar"] as Kind[]).map((k, i) => {
                  const c = me.connections.find((x) => x.kinds.includes(k) && x.status === "ok");
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderTop: i ? "1px solid #ece3d6" : "none" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "#efe4d4", display: "grid", placeItems: "center", fontSize: 18 }}>{{ email: "✉", accounting: "$", crm: "☰", calendar: "▦" }[k as string]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{KINDS[k].label}</div>
                        <div style={{ fontSize: 13.5, color: "#776a5e" }}>{c ? `${c.account} · connected` : KINDS[k].why}</div>
                      </div>
                      {has(k) ? <span style={{ fontSize: 13, color: "#2f6b3a", fontWeight: 600 }}>Connected</span> : <ConnectButton kind={k} onDone={loadMe} />}
                    </div>
                  );
                })}
              </div>
              <ErrorLine error={error} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <Button kind="ghost" onClick={() => setStep(1)}>← Back</Button>
                <div style={{ display: "flex", gap: 10 }}>
                  <Button kind="outline" size="lg" onClick={() => save(3)}>Skip for now</Button>
                  <Button size="lg" disabled={busy} onClick={() => save(3)}>Continue</Button>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: 34 }}>Who&apos;s on the night shift?</h1>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "#5d5148" }}>We picked bots based on what you told us. Add or remove any of them later.</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {shown.map((b) => {
                  const on = picked.has(b.id);
                  return (
                    <button key={b.id} type="button" role="checkbox" aria-checked={on} onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(b.id); else if (n.size < max) n.add(b.id); return n; })}
                      style={{ display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left", padding: 14, borderRadius: 12, background: on ? "#fffbf4" : "transparent", border: on ? "2px solid #2b2320" : "1px solid #d5c7b6", color: "#2b2320" }}>
                      <div style={{ width: 44, height: 44, flex: "none", borderRadius: 11, background: `oklch(0.92 0.045 ${b.hue})`, display: "grid", placeItems: "center" }}><Head bot={{ kind: b.id, hue: b.hue }} size={2.6} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{b.name} <span style={{ fontWeight: 400, color: "#776a5e" }}>· {b.role}</span></div>
                        <div style={{ fontSize: 13, color: "#5d5148", lineHeight: 1.45 }}>{b.title}</div>
                        {b.missing.length > 0 && <div style={{ fontSize: 12, color: "#8a4f14", marginTop: 4 }}>Needs {b.missing.map((m) => (m === "crm" ? "a CRM or lead list" : m === "web" ? "web search" : m)).join(", ")}</div>}
                      </div>
                      <span aria-hidden style={{ width: 20, height: 20, flex: "none", borderRadius: 5, border: "2px solid #2b2320", background: on ? "#2b2320" : "transparent", color: "#fbf3e6", fontSize: 13, display: "grid", placeItems: "center" }}>{on ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 14, color: "#5d5148", display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>{picked.size} bots selected. During your trial you can have up to {max}.</span>
                <button type="button" onClick={() => setBrowse((b) => !b)} style={{ background: "none", border: "none", color: "#b46a22", padding: 0 }}>{browse ? "Show only suggested" : `See all ${catalog.length} bots for your business`}</button>
              </div>
              <ErrorLine error={error} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <Button kind="ghost" onClick={() => setStep(2)}>← Back</Button>
                <Button size="lg" disabled={!picked.size} onClick={() => save(4)}>Continue</Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: 34 }}>How should the team check in?</h1>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "#5d5148" }}>Anything that moves money always needs your approval. These rules set what happens around that.</p>
              </div>
              <div style={{ background: "#efe4d4", borderRadius: 10, padding: "12px 16px", fontSize: 14 }}>Always on: every credit note and invoice waits for you. Emails wait too, unless you let a bot send on its own in settings.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>When should the brief arrive?</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {["06:00", "06:30", "07:30"].map((t) => <button key={t} type="button" aria-pressed={rules.brief_time === t} onClick={() => setRules({ ...rules, brief_time: t })} style={pill(rules.brief_time === t)}>{fmt(t)}</button>)}
                </div>
              </div>
              {[
                { k: "pause_on_dispute" as const, title: "Pause reminders when a client disputes an invoice", sub: "Recommended. Ledger stops and hands the dispute to you." },
                { k: "alert_phone" as const, title: "Alert my phone about disputes and complaints right away", sub: "Even during quiet hours. Turn on notifications when the app asks." },
                { k: "invite" as const, title: "Let someone else approve email drafts too", sub: "We'll send them an invite." },
              ].map((r) => (
                <div key={r.k} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 0", borderTop: "1px solid #e4d9ca" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{r.title}</div>
                    <div style={{ fontSize: 13.5, color: "#776a5e" }}>{r.sub}</div>
                    {r.k === "invite" && rules.invite && <Input type="email" placeholder="their@email.com" value={rules.invite_email} onChange={(e) => setRules({ ...rules, invite_email: e.target.value })} style={{ marginTop: 10, maxWidth: 320 }} />}
                  </div>
                  <Toggle label={r.title} on={rules[r.k]} onChange={(v) => setRules({ ...rules, [r.k]: v })} />
                </div>
              ))}
              <ErrorLine error={error} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <Button kind="ghost" onClick={() => setStep(3)}>← Back</Button>
                <Button size="lg" disabled={busy || !picked.size} onClick={start}>{busy ? "Starting…" : !picked.size ? "Loading your team…" : "Start the night shift"}</Button>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .ns-steps { display: none !important; } }`}</style>
    </main>
  );
}
