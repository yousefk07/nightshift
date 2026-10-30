"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Prose } from "@/components/Prose";
import { Button, Input, Pill } from "@/components/ui";
import { ago, api, money, supabase, useApi } from "@/lib/client";

// Admin: the whole of Nightshift, read-only. Only ADMIN_EMAILS get past the API (lib/admin.ts).

type W = {
  id: string; name: string; industry: string; plan: string; plan_interval: string | null; trial_ends_at: string; billing_email: string | null;
  onboarded_at: string | null; deleted_at: string | null; created_at: string; owner: string | null; members: number; bots: number; bots_on: number;
  staff: boolean; runs_7d: number; failed_7d: number; spend_30d: number; connections: string[]; waiting: number; mrr: number; last_run_at: string | null;
};
type U = { id: string; email: string; provider: string; created_at: string; last_sign_in_at: string | null; workspaces: { id: string; role: string; name: string }[] };
type Run = { id: string; workspace_id: string; workspace: string; status: string; trigger: string; model: string | null; cost_usd: number; error: string | null; created_at: string };
type Err = { id: number; at: string; source: string; message: string; workspace_id: string | null; workspace: string | null; detail: { stack?: string } };
type Interest = { id: number; email: string; business: string; contact_name: string | null; phone: string | null; niche: string | null; city: string | null; source: string; clicks: number; status: string; created_at: string };
type Overview = { totals: Record<string, number>; by_plan: Record<string, number>; by_provider: Record<string, number>; workspaces: W[]; users: U[]; failed_runs: Run[]; errors: Err[]; interest: Interest[] };

const usd = (n: number, d = 2) => `$${Number(n).toFixed(d)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
const planTone = (w: Pick<W, "plan" | "trial_ends_at" | "deleted_at">): "amber" | "green" | "grey" | "red" =>
  w.deleted_at ? "red" : w.plan === "trial" ? (w.trial_ends_at > new Date().toISOString() ? "amber" : "grey") : w.plan === "canceled" ? "grey" : "green";
const planText = (w: Pick<W, "plan" | "trial_ends_at" | "deleted_at" | "plan_interval">) =>
  w.deleted_at ? "deleted" : w.plan === "trial" ? (w.trial_ends_at > new Date().toISOString() ? `trial · ${day(w.trial_ends_at)}` : "trial over") : `${w.plan}${w.plan_interval ? ` · ${w.plan_interval}` : ""}`;

const th: CSSProperties = { textAlign: "left", fontSize: 11.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--faint)", padding: "10px 12px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const STATUS: Record<string, string> = { new: "waiting", contacted: "contacted", approved: "approved, emailed", started: "trial started", not_now: "not now" };
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--line)", fontSize: 13.5, verticalAlign: "top" };

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{head.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" | "good" }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: tone === "bad" ? "var(--bad)" : tone === "good" ? "var(--good)" : "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const H = ({ children }: { children: ReactNode }) => <h2 style={{ fontSize: 15, fontWeight: 700, margin: "26px 0 10px" }}>{children}</h2>;

export default function AdminPage() {
  const o = useApi<Overview>("/api/admin", { poll: 60_000 });
  // approving emails them the "your trial is ready" link and lets them start a workspace
  const decide = async (id: number, status: string) => {
    try { await api("/api/admin/interest", { method: "PATCH", json: { id, status } }); } catch (e) { alertError((e as Error).message); }
    o.refresh();
  };
  const [decideError, alertError] = useState<string | null>(null);
  const [tab, setTab] = useState<"workspaces" | "users" | "failed" | "errors" | "interest">("workspaces");
  const [openErr, setOpenErr] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const find = q.trim().toLowerCase();
  const list = useMemo(() => (o.data?.workspaces ?? []).filter((w) => !find || [w.name, w.owner, w.billing_email, w.industry, w.id].some((v) => v?.toLowerCase().includes(find))), [o.data, find]);
  const people = useMemo(() => (o.data?.users ?? []).filter((u) => !find || u.email.toLowerCase().includes(find) || u.workspaces.some((w) => w.name.toLowerCase().includes(find))), [o.data, find]);

  if (o.error?.code === "two_step") return <Shell><TwoStep onDone={o.refresh} /></Shell>;
  if (o.error) {
    return (
      <Shell>
        <div style={{ maxWidth: 460, margin: "80px auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{o.error.status === 401 ? "Sign in as the admin" : "Not an admin account"}</div>
          <div style={{ color: "var(--muted)" }}>{o.error.message}</div>
          <Link href={o.error.status === 401 ? "/signin?next=/admin" : "/office"} style={{ color: "var(--accent)", fontWeight: 600 }}>
            {o.error.status === 401 ? "Sign in" : "Back to the app"}
          </Link>
        </div>
      </Shell>
    );
  }
  const t = o.data?.totals;

  return (
    <Shell>
      {!t ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div> : (
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 16px 60px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
            <Stat label="Monthly revenue" value={usd(t.mrr, 0)} sub={`${t.paid} paying`} tone="good" />
            <Stat label="Workspaces" value={t.workspaces} sub={`${t.trials} on trial · ${t.expired_trials} trial over · ${t.deleted} deleted · ${t.staff} staff`} />
            <Stat label="Users" value={t.users} sub={`${t.signups_7d} new this week`} />
            <Stat label="Runs, last 24 h" value={t.runs_24h} sub={`${t.failed_24h} failed`} tone={t.failed_24h ? "bad" : undefined} />
            <Stat label="Model + search spend" value={usd(t.spend_today)} sub={`today · ${usd(t.spend_30d)} in 30 days`} />
            <Stat label="Broken connections" value={t.broken_connections} tone={t.broken_connections ? "bad" : undefined} sub={Object.entries(o.data!.by_provider).map(([p, n]) => `${p} ${n}`).join(" · ") || "none connected"} />
            <Stat label="Cards waiting" value={t.waiting} sub="across all workspaces" />
            <Stat label="Trial interest" value={t.interest_new ?? 0} tone={t.interest_new ? "good" : undefined} sub="waiting for your approval" />
            <Stat label="Server errors, 24 h" value={t.errors_24h ?? 0} tone={t.errors_24h ? "bad" : "good"} sub="details in the Errors tab" />
          </div>
          <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 8 }}>By plan: {Object.entries(o.data!.by_plan).map(([p, n]) => `${p} ${n}`).join(" · ")}</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "24px 0 12px", flexWrap: "wrap" }}>
            <div role="tablist" style={{ display: "flex", gap: 4, background: "var(--paper-2)", padding: 4, borderRadius: 10 }}>
              {([["workspaces", `Workspaces (${o.data!.workspaces.length})`], ["users", `Users (${o.data!.users.length})`], ["failed", `Failed runs (${o.data!.failed_runs.length})`], ["errors", `Errors (${o.data!.errors.length})`], ["interest", `Trial interest (${o.data!.interest.length})`]] as const).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ border: 0, borderRadius: 7, padding: "7px 12px", font: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", background: tab === k ? "var(--card)" : "transparent", color: tab === k ? "var(--ink)" : "var(--muted)", boxShadow: tab === k ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>{label}</button>
              ))}
            </div>
            <Input placeholder="Search name, email, industry, id" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320, flex: 1 }} />
          </div>

          {tab === "workspaces" && (
            <Table head={["Workspace", "Plan", "Bots", "Runs 7d", "Spend 30d", "Connected", "Waiting", "Created", "Last run"]}>
              {list.map((w) => (
                <tr key={w.id} onClick={() => setOpen(w.id)} style={{ cursor: "pointer", background: open === w.id ? "var(--paper-2)" : undefined }}>
                  <td style={td}><div style={{ fontWeight: 600 }}>{w.name}</div><div style={{ fontSize: 12, color: "var(--faint)" }}>{w.owner ?? "no owner"} · {w.industry}{!w.onboarded_at && " · onboarding"}</div></td>
                  <td style={td}>{w.staff ? <Pill tone="teal">staff</Pill> : <Pill tone={planTone(w)}>{planText(w)}</Pill>}{w.mrr > 0 && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 4 }}>{usd(w.mrr, 0)}/mo</div>}</td>
                  <td style={td}>{w.bots_on}/{w.bots}</td>
                  <td style={td}>{w.runs_7d}{w.failed_7d > 0 && <span style={{ color: "var(--bad)" }}> · {w.failed_7d} failed</span>}</td>
                  <td style={td}>{usd(w.spend_30d)}</td>
                  <td style={{ ...td, fontSize: 12.5 }}>{w.connections.join(", ") || "—"}</td>
                  <td style={td}>{w.waiting || "—"}</td>
                  <td style={td}>{day(w.created_at)}</td>
                  <td style={td}>{w.last_run_at ? ago(w.last_run_at) : "—"}</td>
                </tr>
              ))}
            </Table>
          )}

          {tab === "users" && (
            <Table head={["Email", "Signed up with", "Joined", "Last sign-in", "Workspaces"]}>
              {people.map((u) => (
                <tr key={u.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{u.email}</td>
                  <td style={td}>{u.provider}</td>
                  <td style={td}>{day(u.created_at)}</td>
                  <td style={td}>{u.last_sign_in_at ? ago(u.last_sign_in_at) : "—"}</td>
                  <td style={td}>{u.workspaces.map((w) => <button key={w.id} onClick={() => { setTab("workspaces"); setOpen(w.id); }} style={{ border: 0, background: "none", padding: 0, marginRight: 10, font: "inherit", color: "var(--accent)", cursor: "pointer" }}>{w.name} ({w.role})</button>)}</td>
                </tr>
              ))}
            </Table>
          )}

          {tab === "failed" && (
            <Table head={["When", "Workspace", "Trigger", "Model", "Error"]}>
              {o.data!.failed_runs.map((r) => (
                <tr key={r.id} onClick={() => { setTab("workspaces"); setOpen(r.workspace_id); }} style={{ cursor: "pointer" }}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{ago(r.created_at)}</td>
                  <td style={td}>{r.workspace}</td>
                  <td style={td}>{r.trigger}</td>
                  <td style={td}>{r.model ?? "—"}</td>
                  <td style={{ ...td, color: "var(--bad)", fontSize: 12.5, maxWidth: 520 }}>{(r.error ?? "").slice(0, 300)}</td>
                </tr>
              ))}
            </Table>
          )}

          {tab === "interest" && decideError && <div style={{ color: "var(--bad)", padding: "0 4px 10px" }}>{decideError}</div>}
          {tab === "interest" && (
            o.data!.interest.length === 0 ? <div style={{ color: "var(--muted)", padding: "16px 4px" }}>Nobody yet. Outreach links, the form at nightshiftai.ca/trial and anyone who signs in without an invite land here. Only people you approve can start a trial.</div> : (
            <Table head={["When", "Business", "Contact", "Kind", "From", "Status", ""]}>
              {o.data!.interest.map((i) => (
                <tr key={i.id}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{ago(i.created_at)}</td>
                  <td style={td}><b>{i.business || "—"}</b>{i.city && <div style={{ fontSize: 12, color: "var(--faint)" }}>{i.city}</div>}</td>
                  <td style={td}><a href={`mailto:${i.email}`} style={{ color: "var(--accent)" }}>{i.email}</a>{(i.contact_name || i.phone) && <div style={{ fontSize: 12, color: "var(--faint)" }}>{[i.contact_name, i.phone].filter(Boolean).join(" · ")}</div>}</td>
                  <td style={td}>{i.niche ?? "—"}</td>
                  <td style={td}>{i.source === "outreach" ? "email link" : i.source === "signin" ? "signed in" : "form"}{i.clicks > 1 && <div style={{ fontSize: 12, color: "var(--faint)" }}>{i.clicks} clicks</div>}</td>
                  <td style={td}><Pill tone={i.status === "approved" || i.status === "started" ? "green" : i.status === "not_now" ? "grey" : "amber"}>{STATUS[i.status] ?? i.status}</Pill></td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {(i.status === "new" || i.status === "contacted" || i.status === "not_now") && <Button size="sm" onClick={() => decide(i.id, "approved")}>Approve</Button>}
                    {(i.status === "new" || i.status === "contacted") && <Button size="sm" kind="ghost" onClick={() => decide(i.id, "not_now")} style={{ marginLeft: 6 }}>Not now</Button>}
                  </td>
                </tr>
              ))}
            </Table>)
          )}

          {tab === "errors" && (
            o.data!.errors.length === 0 ? <div style={{ color: "var(--muted)", padding: "16px 4px" }}>No server errors in the last 30 days.</div> : (
            <Table head={["When", "Where", "What", "Workspace"]}>
              {o.data!.errors.map((e) => (
                <tr key={e.id} onClick={() => setOpenErr(openErr === e.id ? null : e.id)} style={{ cursor: "pointer" }}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{ago(e.at)}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{e.source}</td>
                  <td style={{ ...td, color: "var(--bad)", fontSize: 13, maxWidth: 620 }}>
                    {e.message}
                    {openErr === e.id && e.detail?.stack && <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 11.5, color: "var(--ink-2)", background: "var(--paper-2)", padding: 10, borderRadius: 8 }}>{e.detail.stack}</pre>}
                  </td>
                  <td style={td}>{e.workspace ?? "—"}</td>
                </tr>
              ))}
            </Table>)
          )}

          {open && <Detail id={open} onClose={() => setOpen(null)} />}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <header style={{ background: "var(--night)", color: "var(--night-ink)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <Logo />
        <span className="pixel" style={{ fontSize: 13, background: "var(--gold)", color: "var(--outline)", padding: "2px 8px" }}>ADMIN</span>
        <span style={{ fontSize: 12.5, color: "var(--night-muted)" }}>read-only view of every workspace</span>
        <Link href="/office" style={{ marginLeft: "auto", color: "var(--night-ink)", fontSize: 13.5 }}>Open the app</Link>
      </header>
      {children}
    </div>
  );
}

type Detail = {
  workspace: Record<string, any> & { stripe: { customer: string | null; subscription: string | null } };
  members: { user_id: string; email: string; role: string; created_at: string }[];
  bots: { id: string; kind: string; name: string; enabled: boolean; approval: string; status: string; status_text: string; blocked_reason: string | null; next_run_at: string | null; last_run_at: string | null }[];
  connections: { id: string; provider: string; kinds: string[]; account: string; status: string; error: string | null; last_synced_at: string | null; created_at: string }[];
  runs: { id: string; bot_id: string; trigger: string; status: string; model: string | null; steps: number; cost_usd: number; input: string; summary: string | null; error: string | null; created_at: string }[];
  room: { id: string; role: string; kind: string; bot_id: string | null; content: string; created_at: string }[];
  actions: { id: string; bot_id: string; tool: string; risk: string; title: string; counterparty: string | null; amount_cents: number | null; currency: string | null; status: string; error: string | null; created_at: string }[];
  activity: { actor_type: string; action: string; target: string; why: string; at: string }[];
  usage: { day: string; cost_usd: number; searches: number; research_seconds: number }[];
};

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useApi<Detail>(`/api/admin/workspaces/${id}`);
  const [run, setRun] = useState<string | null>(null);
  const bot = (bid: string | null) => d.data?.bots.find((b) => b.id === bid)?.name ?? "—";
  const w = d.data?.workspace;
  return (
    <section style={{ marginTop: 28, background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 18px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{w?.name ?? "Loading…"}</div>
          {w && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{w.industry} · {w.timezone} · shift {String(w.shift_start).slice(0, 5)} · budget {usd(w.daily_budget_usd)}/day · created {day(w.created_at)} · <span className="mono">{w.id}</span></div>}
          {w?.about && <div style={{ fontSize: 13.5, marginTop: 6 }}>{w.about}</div>}
        </div>
        <button onClick={onClose} style={{ border: "1px solid var(--line-2)", background: "var(--card)", borderRadius: 8, padding: "6px 12px", font: "inherit", cursor: "pointer" }}>Close</button>
      </div>
      {d.error && <div style={{ color: "var(--bad)", marginTop: 12 }}>{d.error.message}</div>}
      {d.data && w && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <Pill tone={planTone(w as unknown as W)}>{planText(w as unknown as W)}</Pill>
            {w.deleted_at && <Pill tone="red">deleted {day(w.deleted_at)}</Pill>}
            <Pill tone="grey">billing: {w.billing_email ?? "—"}</Pill>
            {w.stripe.customer && <a href={`https://dashboard.stripe.com/${process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test") ? "test/" : ""}customers/${w.stripe.customer}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--accent)" }}>Stripe customer ↗</a>}
          </div>

          <H>People</H>
          <Table head={["Email", "Role", "Joined"]}>
            {d.data.members.map((m) => <tr key={m.user_id}><td style={td}>{m.email}</td><td style={td}>{m.role}</td><td style={td}>{day(m.created_at)}</td></tr>)}
          </Table>

          <H>Bots ({d.data.bots.length})</H>
          <Table head={["Bot", "Status", "Approval", "Next run", "Last run"]}>
            {d.data.bots.map((b) => (
              <tr key={b.id}>
                <td style={td}><b>{b.name}</b> <span style={{ color: "var(--faint)", fontSize: 12 }}>{b.kind}</span></td>
                <td style={td}>{b.enabled ? b.status : "paused"}{b.status_text && <div style={{ fontSize: 12, color: "var(--faint)" }}>{b.status_text}</div>}{b.blocked_reason && <div style={{ fontSize: 12, color: "var(--bad)" }}>{b.blocked_reason}</div>}</td>
                <td style={td}>{b.approval}</td>
                <td style={td}>{b.next_run_at ? new Date(b.next_run_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</td>
                <td style={td}>{b.last_run_at ? ago(b.last_run_at) : "—"}</td>
              </tr>
            ))}
          </Table>

          <H>Connections</H>
          {d.data.connections.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Nothing connected.</div> : (
            <Table head={["Provider", "Account", "Status", "Last sync", "Connected"]}>
              {d.data.connections.map((c) => (
                <tr key={c.id}>
                  <td style={td}>{c.provider} <span style={{ color: "var(--faint)", fontSize: 12 }}>{c.kinds.join(", ")}</span></td>
                  <td style={td}>{c.account}</td>
                  <td style={td}><Pill tone={c.status === "ok" ? "green" : "red"}>{c.status}</Pill>{c.error && <div style={{ fontSize: 12, color: "var(--bad)", marginTop: 4 }}>{c.error}</div>}</td>
                  <td style={td}>{c.last_synced_at ? ago(c.last_synced_at) : "—"}</td>
                  <td style={td}>{day(c.created_at)}</td>
                </tr>
              ))}
            </Table>
          )}

          <H>Runs (last {d.data.runs.length})</H>
          <Table head={["When", "Bot", "Trigger", "Status", "Steps", "Cost", "What happened"]}>
            {d.data.runs.map((r) => (
              <tr key={r.id} onClick={() => setRun(run === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{ago(r.created_at)}</td>
                <td style={td}>{bot(r.bot_id)}</td>
                <td style={td}>{r.trigger}</td>
                <td style={td}><Pill tone={r.status === "done" ? "green" : r.status === "failed" ? "red" : "grey"}>{r.status}</Pill></td>
                <td style={td}>{r.steps}</td>
                <td style={td}>{usd(r.cost_usd, 4)}</td>
                <td style={{ ...td, maxWidth: 560 }}>
                  {run === r.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 12, color: "var(--faint)" }}>Task: {r.input}</div>
                      {r.error ? <div style={{ color: "var(--bad)", fontSize: 13 }}>{r.error}</div> : <Prose text={r.summary ?? ""} />}
                    </div>
                  ) : <span style={{ color: r.error ? "var(--bad)" : "var(--ink-2)", fontSize: 12.5 }}>{(r.error ?? r.summary ?? "").replace(/\*\*/g, "").slice(0, 140)}</span>}
                </td>
              </tr>
            ))}
          </Table>

          <H>Cards</H>
          {d.data.actions.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No cards yet.</div> : (
            <Table head={["When", "Bot", "Card", "Kind", "Amount", "Status"]}>
              {d.data.actions.map((a) => (
                <tr key={a.id}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{ago(a.created_at)}</td>
                  <td style={td}>{bot(a.bot_id)}</td>
                  <td style={td}>{a.title}{a.counterparty && <div style={{ fontSize: 12, color: "var(--faint)" }}>{a.counterparty}</div>}</td>
                  <td style={td}>{a.tool} <span style={{ color: "var(--faint)", fontSize: 12 }}>{a.risk}</span></td>
                  <td style={td}>{a.amount_cents != null ? money(a.amount_cents, a.currency ?? "USD") : "—"}</td>
                  <td style={td}>{a.status}{a.error && <div style={{ fontSize: 12, color: "var(--bad)" }}>{a.error}</div>}</td>
                </tr>
              ))}
            </Table>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <div>
              <H>Bot room (last {d.data.room.length})</H>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 14, maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
                {d.data.room.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Quiet so far.</div>}
                {d.data.room.map((m) => (
                  <div key={m.id} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                    <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 2 }}><b style={{ color: "var(--ink-2)" }}>{m.role === "bot" ? bot(m.bot_id) : m.role}</b> · {ago(m.created_at)}{m.kind !== "text" && ` · ${m.kind}`}</div>
                    <Prose text={m.content} collapse />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <H>Activity</H>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 14, maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {d.data.activity.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Nothing logged yet.</div>}
                {d.data.activity.map((a, i) => (
                  <div key={i} style={{ fontSize: 13 }}>
                    <span style={{ color: "var(--faint)" }}>{ago(a.at)} · {a.actor_type}</span> <b>{a.action.replace(/_/g, " ")}</b> {a.target}{a.why && <span style={{ color: "var(--muted)" }}> — {a.why}</span>}
                  </div>
                ))}
              </div>
              <H>Spend by day</H>
              <div style={{ fontSize: 13, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 3 }}>
                {d.data.usage.length === 0 ? <span style={{ color: "var(--muted)" }}>No spend yet.</span> : d.data.usage.map((u) => <div key={u.day}><span className="mono">{u.day}</span> · {usd(u.cost_usd, 4)} · {u.searches} searches</div>)}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// Admin needs the authenticator code in this session: ask for it here when an authenticator is set up.
function TwoStep({ onDone }: { onDone: () => void }) {
  const [factor, setFactor] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supabase().auth.mfa.listFactors().then(({ data }) => setFactor(data?.totp.find((f) => f.status === "verified")?.id ?? null));
  }, []);
  const verify = async () => {
    setError(null);
    const { error: e } = await supabase().auth.mfa.challengeAndVerify({ factorId: factor!, code: code.trim() });
    if (e) return setError(e.message.includes("Invalid") ? "That code didn't work. Try the newest one." : e.message);
    onDone();
  };
  return (
    <div style={{ maxWidth: 380, margin: "80px auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{factor === null ? "Turn on the authenticator step" : "Enter your authenticator code"}</div>
      {factor === null ? (
        <>
          <div style={{ color: "var(--muted)" }}>Admins need an authenticator app. Set one up, then come back here.</div>
          <Link href="/settings/security" style={{ color: "var(--accent)", fontWeight: 600 }}>Open Security settings</Link>
        </>
      ) : factor === undefined ? <div style={{ color: "var(--muted)" }}>Checking…</div> : (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ color: "var(--muted)" }}>The 6-digit code from your authenticator app for Nightshift.</div>
          <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/D/g, ""))} placeholder="123456" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em" }} />
          {error && <div style={{ color: "var(--bad)", fontSize: 14 }}>{error}</div>}
          <Button type="submit" disabled={code.length !== 6}>Open admin</Button>
        </form>
      )}
    </div>
  );
}
