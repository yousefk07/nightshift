import { route } from "@/lib/auth";
import { billingSummary, syncSubscription } from "@/lib/billing";
import { localDate } from "@/lib/engine/schedule";
import { isActive, limits, PLANS, planOf, SEAT_PRICE } from "@/lib/plans";
import { isStaff } from "@/lib/staff";
import { admin, supabaseStore } from "@/lib/store-supabase";

// Plan & billing: the plan card, the meters (research hours, seats, inboxes), the card on file and invoices.
// It reads the subscription from Stripe first, so a purchase shows here even if the webhook never came.
export const GET = route(async (_req, me) => {
  const store = supabaseStore();
  const sub = await syncSubscription(store, me.ws).catch(() => null);
  const ws = sub ? await store.workspace(me.ws.id) : me.ws;
  const lim = limits(ws);
  const periodStart = ws.current_period_end ? new Date(new Date(ws.current_period_end).getTime() - (ws.plan_interval === "year" ? 365 : 30) * 86_400_000) : new Date(ws.created_at);
  const [usage, members, conns, summary] = await Promise.all([
    store.usageSince(ws.id, localDate(ws.timezone, periodStart)),
    admin().from("members").select("role").eq("workspace_id", ws.id),
    store.connections(ws.id),
    billingSummary(ws).catch(() => ({ invoices: [], card: null })),
  ]);
  return Response.json({
    plan: {
      staff: isStaff(me.email), id: ws.plan, name: isStaff(me.email) ? "Staff" : planOf(ws.plan), interval: ws.plan_interval, active: isActive(ws), renews: ws.current_period_end,
      trial_ends_at: ws.plan === "trial" ? ws.trial_ends_at : null, cancels: sub?.cancel_at_period_end ? sub.period_end : null, status: sub?.status ?? null,
    },
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
