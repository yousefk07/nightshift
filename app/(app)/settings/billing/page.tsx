"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp, useRename } from "@/components/AppShell";
import { Celebrate } from "@/components/Celebrate";
import { Meter, Page, Row, Section } from "@/components/settings";
import { Button, ErrorLine, Pill } from "@/components/ui";
import { api, useApi } from "@/lib/client";

// S1 Plan & billing. Cancel, take a cancel back and switch plans all happen here; Stripe's portal is only for the
// card and billing details. Coming back from checkout (?checkout=done) or a switch (?changed=) cheers.
interface Billing {
  plan: { staff?: boolean; id: string; name: string; interval: "month" | "year" | null; active: boolean; renews: string | null; trial_ends_at: string | null; cancels: string | null; status: string | null };
  prices: Record<string, { month: number; year: number } | number>;
  meters: { research_hours: { used: number; of: number; resets: string | null }; seats: { used: number; of: number }; inboxes: { used: number; of: number } };
  billing_email: string | null;
  invoices: { date: string; description: string; amount: number; currency: string; status: string; pdf: string | null }[];
  card: { brand: string; last4: string; exp: string } | null;
}
const PLANS = [
  { id: "solo", name: "Solo", line: "Penny, Ledger and Dawn · 1 inbox · 1 accounting connection · brief by email", bots: 3 },
  { id: "studio", name: "Studio", line: "Up to 10 bots + the bot room · 3 inboxes · 2 approvers · 100 research hours", popular: true, bots: 10 },
  { id: "team", name: "Team", line: "Up to 40 bots · 10 seats, roles · audit log · API access · priority support", bots: 40 },
];
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "");
const names = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export default function BillingPage() {
  const rename = useRename();
  const { me, office, refreshMe } = useApp();
  const router = useRouter();
  const b = useApi<Billing>("/api/billing");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cheer, setCheer] = useState<"checkout" | "changed" | null>(null);

  // back from Stripe: cheer once the plan shows as paid, then tidy the address bar
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const kind = q.get("checkout") === "done" ? "checkout" : q.get("changed") ? "changed" : null;
    if (!kind) return;
    history.replaceState(null, "", location.pathname);
    queueMicrotask(() => { setCheer(kind); refreshMe(); });
  }, [refreshMe]);

  if (me.user.role !== "owner") return <Page title="Plan & billing"><p>Only the workspace owner can see billing.</p></Page>;
  if (!b.data) return <Page title="Plan & billing"><div style={{ color: "#776a5e" }}>Checking with Stripe…</div></Page>;
  const d = b.data;
  const price = (id: string, iv: "month" | "year") => (d.prices[id] as { month: number; year: number })[iv];
  const paid = !d.plan.staff && d.plan.id !== "trial" && d.plan.id !== "canceled";
  const yearlySaving = paid && d.plan.interval === "month" ? price(d.plan.id, "month") * 12 - price(d.plan.id, "year") : 0;
  const go = async (path: string, json?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>(path, { json: json ?? {} });
      location.assign(r.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const subscription = async (action: "cancel" | "resume") => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/billing/subscription", { json: { action } });
      setConfirmCancel(false);
      await b.refresh();
      refreshMe();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const crew = (office?.desks ?? []).filter((x) => x.enabled);
  const planName = PLANS.find((p) => p.id === d.plan.id)?.name ?? d.plan.name;

  return (
    <Page title="Plan & billing" sub={d.billing_email ? `Invoices go to ${d.billing_email}.` : undefined}>
      <ErrorLine error={error} />
      <Section>
        <div style={{ padding: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{d.plan.name}</span>
              {paid && <Pill tone="grey">{d.plan.interval === "year" ? "Yearly" : "Monthly"}</Pill>}
              {d.plan.cancels && <Pill tone="amber">Ends {fmtDate(d.plan.cancels)}</Pill>}
              {d.plan.status === "past_due" && <Pill tone="red">Payment failed</Pill>}
              {!d.plan.active && <Pill tone="red">Ended</Pill>}
            </div>
            <div style={{ fontSize: 14, color: "#5d5148", marginTop: 4 }}>
              {d.plan.staff ? "Nightshift staff account: everything on, no trial, no billing."
                : d.plan.cancels ? `Your team keeps working until ${fmtDate(d.plan.cancels)}, then clocks off. Nothing else is charged.`
                : paid ? `$${price(d.plan.id, d.plan.interval ?? "month")}/${d.plan.interval === "year" ? "year" : "month"} · renews ${fmtDate(d.plan.renews)}`
                : d.plan.trial_ends_at ? `Free Studio trial ${new Date(d.plan.trial_ends_at) > new Date() ? `until ${fmtDate(d.plan.trial_ends_at)}` : "has ended"}. No card on file.`
                : "No active plan."}
            </div>
          </div>
          {d.plan.cancels && <Button disabled={busy} onClick={() => subscription("resume")}>Keep my plan</Button>}
          {!d.plan.cancels && yearlySaving > 0 && <Button kind="outline" disabled={busy} onClick={() => go("/api/billing/checkout", { plan: d.plan.id, interval: "year" })}>Switch to yearly, save ${yearlySaving}</Button>}
        </div>
      </Section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Meter label="Research hours" used={d.meters.research_hours.used} of={d.meters.research_hours.of} foot={d.meters.research_hours.resets ? `Resets ${fmtDate(d.meters.research_hours.resets)}` : undefined} />
        <Meter label="Seats" used={d.meters.seats.used} of={d.meters.seats.of} foot={paid ? <a href="#" onClick={(e) => { e.preventDefault(); go("/api/billing/portal"); }}>Add a seat · $15/mo</a> : undefined} />
        <Meter label="Inboxes" used={d.meters.inboxes.used} of={d.meters.inboxes.of} foot={d.meters.inboxes.of - d.meters.inboxes.used > 0 ? `${d.meters.inboxes.of - d.meters.inboxes.used} more included` : undefined} />
      </div>

      {!d.plan.staff && (
        <Section title={paid ? "Change plan" : "Pick a plan"}>
          <div style={{ padding: "14px 18px 0", display: "flex", gap: 6 }}>
            {(["month", "year"] as const).map((iv) => <button key={iv} onClick={() => setPeriod(iv)} aria-pressed={period === iv} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 13, border: "1px solid #cdbfac", background: period === iv ? "#2b2320" : "transparent", color: period === iv ? "#fbf3e6" : "#2b2320", cursor: "pointer" }}>{iv === "month" ? "Monthly" : "Yearly · 2 months free"}</button>)}
          </div>
          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            {PLANS.map((p) => {
              const current = paid && p.id === d.plan.id && (d.plan.interval ?? "month") === period;
              return (
                <div key={p.id} style={{ border: current ? "2px solid var(--good)" : p.popular && !paid ? "2px solid #2b2320" : "1px solid #e4d9ca", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</span>{current ? <Pill tone="green">Your plan</Pill> : p.popular && !paid ? <Pill>Most picked</Pill> : null}</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>${price(p.id, period)}<span style={{ fontSize: 14, fontWeight: 400, color: "#776a5e" }}>/{period === "month" ? "mo" : "yr"}</span></div>
                  <div style={{ fontSize: 13.5, color: "#5d5148", flex: 1 }}>{rename(p.line)}</div>
                  {current ? <Button kind="outline" disabled>Current plan</Button>
                    : <Button disabled={busy} kind={paid ? "outline" : "dark"} onClick={() => go("/api/billing/checkout", { plan: p.id, interval: period })}>{paid ? `Switch to ${p.name}` : `Choose ${p.name}`}</Button>}
                </div>
              );
            })}
          </div>
          {paid && <div style={{ padding: "0 18px 16px", fontSize: 12.5, color: "#776a5e" }}>Switching is prorated: you pay or get credit for the difference on your next invoice.</div>}
        </Section>
      )}

      {paid && (
        <Section>
          <Row first title="Payment method" sub={d.card ? `${d.card.brand.toUpperCase()} •••• ${d.card.last4} · expires ${d.card.exp}` : "No card on file"}><Button size="sm" kind="outline" onClick={() => go("/api/billing/portal")}>Update</Button></Row>
          <Row title="Billing details" sub="Business name, address and tax ID"><Button size="sm" kind="outline" onClick={() => go("/api/billing/portal")}>Edit</Button></Row>
        </Section>
      )}

      {d.invoices.length > 0 && (
        <Section title="Invoices">
          {d.invoices.map((inv, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(96px,120px) 1fr auto auto 40px", gap: 12, padding: "12px 18px", borderTop: i ? "1px solid #ece3d6" : "none", fontSize: 14, alignItems: "center" }}>
              <span>{new Date(inv.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.description}</span>
              <span>{inv.amount.toLocaleString("en-US", { style: "currency", currency: inv.currency })}</span>
              <Pill tone={inv.status === "paid" ? "green" : inv.status === "open" ? "amber" : "grey"}>{inv.status}</Pill>
              {inv.pdf ? <a href={inv.pdf} target="_blank" rel="noreferrer">PDF</a> : <span />}
            </div>
          ))}
        </Section>
      )}

      {paid && !d.plan.cancels && (
        <Section>
          {!confirmCancel ? (
            <Row first title="Cancel plan" sub="Your bots keep working until the end of this billing period. Your data stays for 30 days after that.">
              <Button size="sm" kind="danger" onClick={() => setConfirmCancel(true)}>Cancel plan</Button>
            </Row>
          ) : (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Cancel {planName}?</div>
              <div style={{ fontSize: 14, color: "#5d5148", lineHeight: 1.55 }}>
                {crew.length ? `${names(crew.slice(0, 3).map((x) => x.name))}${crew.length > 3 ? ` and ${crew.length - 3} more` : ""} keep` : "Your team keeps"} working until <b>{fmtDate(d.plan.renews)}</b>, then clock off. You won&apos;t be charged again, and you can change your mind any time before then.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button disabled={busy} onClick={() => setConfirmCancel(false)}>Keep {planName}</Button>
                <Button disabled={busy} kind="danger" onClick={() => subscription("cancel")}>{busy ? "Canceling…" : `Cancel at the end of the period`}</Button>
              </div>
            </div>
          )}
        </Section>
      )}

      {cheer && paid && (
        <Celebrate
          title={cheer === "checkout" ? `You're on ${planName}!` : `Switched to ${planName}`}
          line={crew.length ? `${names(crew.slice(0, 4).map((x) => x.name))}${crew.length > 4 ? " and the rest" : ""} ${crew.length === 1 ? "is" : "are"} clocked in and ready for tonight's shift.` : "Your team is clocked in and ready for tonight's shift."}
          team={crew.map((x) => ({ kind: x.kind, hue: x.hue, name: x.name }))}
          cta="Back to the office"
          onClose={() => { setCheer(null); router.push("/office"); }}
        />
      )}
    </Page>
  );
}
