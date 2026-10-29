"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { Meter, Page, Row, Section } from "@/components/settings";
import { Button, ErrorLine, Pill } from "@/components/ui";
import { api, useApi } from "@/lib/client";

// S1 Plan & billing.
interface Billing {
  plan: { id: string; name: string; interval: "month" | "year" | null; active: boolean; renews: string | null; trial_ends_at: string | null };
  prices: Record<string, { month: number; year: number } | number>;
  meters: { research_hours: { used: number; of: number; resets: string | null }; seats: { used: number; of: number }; inboxes: { used: number; of: number } };
  billing_email: string | null;
  invoices: { date: string; description: string; amount: number; currency: string; status: string; pdf: string | null }[];
  card: { brand: string; last4: string; exp: string } | null;
}
const PLANS = [
  { id: "solo", name: "Solo", line: "Penny, Ledger and Dawn · 1 inbox · 1 accounting connection · brief by email" },
  { id: "studio", name: "Studio", line: "Up to 10 bots + the bot room · 3 inboxes · 2 approvers · 100 research hours", popular: true },
  { id: "team", name: "Team", line: "Up to 40 bots · 10 seats, roles · audit log · API access · priority support" },
];
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "");

export default function BillingPage() {
  const { me } = useApp();
  const b = useApi<Billing>("/api/billing");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (me.user.role !== "owner") return <Page title="Plan & billing"><p>Only the workspace owner can see billing.</p></Page>;
  if (!b.data) return <Page title="Plan & billing"><div /></Page>;
  const d = b.data;
  const price = (id: string, iv: "month" | "year") => (d.prices[id] as { month: number; year: number })[iv];
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
  const paid = d.plan.id !== "trial" && d.plan.id !== "canceled";
  const yearlySaving = paid && d.plan.interval === "month" ? price(d.plan.id, "month") * 12 - price(d.plan.id, "year") : 0;

  return (
    <Page title="Plan & billing" sub={d.billing_email ? `Invoices go to ${d.billing_email}.` : undefined}>
      <ErrorLine error={error} />
      <Section>
        <div style={{ padding: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 22, fontWeight: 700 }}>{d.plan.name}</span>{paid && <Pill tone="grey">{d.plan.interval === "year" ? "Yearly" : "Monthly"}</Pill>}{!d.plan.active && <Pill tone="red">Ended</Pill>}</div>
            <div style={{ fontSize: 14, color: "#5d5148", marginTop: 4 }}>
              {paid ? `$${price(d.plan.id, d.plan.interval ?? "month")}/${d.plan.interval === "year" ? "year" : "month"} · renews ${fmtDate(d.plan.renews)}` : d.plan.trial_ends_at ? `Free Studio trial ${new Date(d.plan.trial_ends_at) > new Date() ? `until ${fmtDate(d.plan.trial_ends_at)}` : "has ended"}. No card on file.` : "No active plan."}
            </div>
          </div>
          {yearlySaving > 0 && <Button kind="outline" disabled={busy} onClick={() => go("/api/billing/portal")}>Switch to yearly, save ${yearlySaving}</Button>}
          {paid && <Button disabled={busy} onClick={() => go("/api/billing/portal")}>Change plan</Button>}
        </div>
      </Section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Meter label="Research hours" used={d.meters.research_hours.used} of={d.meters.research_hours.of} foot={d.meters.research_hours.resets ? `Resets ${fmtDate(d.meters.research_hours.resets)}` : undefined} />
        <Meter label="Seats" used={d.meters.seats.used} of={d.meters.seats.of} foot={paid ? <a href="#" onClick={(e) => { e.preventDefault(); go("/api/billing/portal"); }}>Add a seat · $15/mo</a> : undefined} />
        <Meter label="Inboxes" used={d.meters.inboxes.used} of={d.meters.inboxes.of} foot={d.meters.inboxes.of - d.meters.inboxes.used > 0 ? `${d.meters.inboxes.of - d.meters.inboxes.used} more included` : undefined} />
      </div>

      {!paid && (
        <Section title="Pick a plan">
          <div style={{ padding: "14px 18px 0", display: "flex", gap: 6 }}>
            {(["month", "year"] as const).map((iv) => <button key={iv} onClick={() => setPeriod(iv)} aria-pressed={period === iv} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 13, border: "1px solid #cdbfac", background: period === iv ? "#2b2320" : "transparent", color: period === iv ? "#fbf3e6" : "#2b2320" }}>{iv === "month" ? "Monthly" : "Yearly · 2 months free"}</button>)}
          </div>
          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            {PLANS.map((p) => (
              <div key={p.id} style={{ border: p.popular ? "2px solid #2b2320" : "1px solid #e4d9ca", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</span>{p.popular && <Pill>Most picked</Pill>}</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>${price(p.id, period)}<span style={{ fontSize: 14, fontWeight: 400, color: "#776a5e" }}>/{period === "month" ? "mo" : "yr"}</span></div>
                <div style={{ fontSize: 13.5, color: "#5d5148", flex: 1 }}>{p.line}</div>
                <Button disabled={busy} onClick={() => go("/api/billing/checkout", { plan: p.id, interval: period })}>Choose {p.name}</Button>
              </div>
            ))}
          </div>
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
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 100px 80px 50px", gap: 10, padding: "12px 18px", borderTop: i ? "1px solid #ece3d6" : "none", fontSize: 14, alignItems: "center" }}>
              <span>{new Date(inv.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              <span>{inv.description}</span>
              <span>{inv.amount.toLocaleString("en-US", { style: "currency", currency: inv.currency })}</span>
              <span style={{ textTransform: "capitalize" }}>{inv.status}</span>
              {inv.pdf ? <a href={inv.pdf}>PDF</a> : <span />}
            </div>
          ))}
        </Section>
      )}

      {paid && (
        <Section>
          <Row first title="Cancel subscription" sub="If you cancel, your bots stop at the end of the billing period. You can export your data for 30 days afterwards.">
            <Button size="sm" kind="danger" onClick={() => go("/api/billing/portal")}>Cancel subscription</Button>
          </Row>
        </Section>
      )}
    </Page>
  );
}
