import { route } from "@/lib/auth";
import { billingSummary } from "@/lib/billing";
import { localDate } from "@/lib/engine/schedule";
import { isActive, limits, PLANS, planOf, SEAT_PRICE } from "@/lib/plans";
import { admin, supabaseStore } from "@/lib/store-supabase";

// Plan & billing: the plan card, the meters (research hours, seats, inboxes), the card on file and invoices.
export const GET = route(async (_req, me) => {
  const ws = me.ws;
  const lim = limits(ws);
  const store = supabaseStore();
  const periodStart = ws.current_period_end ? new Date(new Date(ws.current_period_end).getTime() - (ws.plan_interval === "year" ? 365 : 30) * 86_400_000) : new Date(ws.created_at);
  const [usage, members, conns, summary] = await Promise.all([
    store.usageSince(ws.id, localDate(ws.timezone, periodStart)),
    admin().from("members").select("role").eq("workspace_id", ws.id),
    store.connections(ws.id),
    billingSummary(ws).catch(() => ({ invoices: [], card: null })),
  ]);
  return Response.json({
    plan: { id: ws.plan, name: planOf(ws.plan), interval: ws.plan_interval, active: isActive(ws), renews: ws.current_period_end, trial_ends_at: ws.plan === "trial" ? ws.trial_ends_at : null },
    prices: { ...Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { month: p.month, year: p.month * 10 }])), seat: SEAT_PRICE },
    meters: {
      research_hours: { used: Math.round((usage.research_seconds / 3600) * 10) / 10, of: lim.researchHours, resets: ws.current_period_end },
      seats: { used: (members.data ?? []).filter((m) => m.role !== "viewer").length, of: lim.seats },
      inboxes: { used: conns.filter((c) => c.kinds.includes("email")).length, of: lim.inboxes },
    },
    billing_email: ws.billing_email,
    ...summary,
  });
});
