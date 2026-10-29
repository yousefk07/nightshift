import { ownerAlert, usd, type AlertKind } from "@/lib/alerts";
import { applyLatest, applySubscription, verifyWebhook } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { admin, supabaseStore } from "@/lib/store-supabase";

// Stripe tells us when a subscription starts, changes or ends, and when an invoice is paid or fails. Signed with
// STRIPE_WEBHOOK_SECRET. The plan is applied from Stripe's latest copy; the people running Nightshift get an alert.
// Stripe can deliver an event twice: each event id is handled once (recorded in the activity log).
export async function POST(req: Request) {
  const payload = await req.text();
  if (!verifyWebhook(payload, req.headers.get("stripe-signature"))) return Response.json({ error: "Bad signature" }, { status: 400 });
  const event = JSON.parse(payload);
  const store = supabaseStore(), db = admin();
  const obj = event.data.object;

  const { data: seen } = await db.from("activity").select("id").eq("action", "billing").contains("data", { event_id: event.id }).limit(1);
  if (seen?.length) return Response.json({ received: true, duplicate: true });

  const wsFor = async (customer: string | null) => {
    if (!customer) return null;
    const { data } = await db.from("workspaces").select("id, name, billing_email").eq("stripe_customer_id", customer).maybeSingle();
    return data as { id: string; name: string; billing_email: string | null } | null;
  };
  const planName = (sub: any) => {
    const item = (sub.items?.data ?? []).find((i: any) => /^nightshift_(solo|studio|team)_/.test(i.price?.lookup_key ?? ""));
    const [, plan, interval] = (item?.price?.lookup_key ?? "").split("_");
    return plan in PLANS ? `${PLANS[plan as keyof typeof PLANS].label} (${interval === "year" ? "yearly" : "monthly"})` : "a plan";
  };
  const amount = (sub: any) => usd((sub.items?.data ?? []).reduce((n: number, i: any) => n + (i.price?.unit_amount ?? 0) * (i.quantity ?? 1), 0), sub.currency ?? "usd");
  const day = (t: number | null | undefined) => (t ? new Date(t * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—");

  let wsId: string | null = null;
  let alert: { kind: AlertKind; heading: string; lead: string; rows: [string, string][] } | null = null;

  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    wsId = await applyLatest(store, obj.id).catch(() => {
      if (event.type === "customer.subscription.deleted") obj.status = "canceled";
      return applySubscription(store, obj); // Stripe unreachable: the event is the best we have
    });
    const ws = await wsFor(obj.customer);
    const who = ws?.name ?? "A workspace";
    const rows: [string, string][] = [["Workspace", who], ["Billing email", ws?.billing_email ?? "—"], ["Plan", planName(obj)], ["Amount", `${amount(obj)} per ${obj.items?.data?.[0]?.price?.recurring?.interval ?? "month"}`]];
    const prev = event.data.previous_attributes ?? {};
    if (event.type === "customer.subscription.created") alert = { kind: "subscribed", heading: `${who} is on ${planName(obj)}`, lead: `A new paying customer. Their first period ends ${day(obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end)}.`, rows };
    else if (event.type === "customer.subscription.deleted") alert = { kind: "ended", heading: `${who}'s subscription ended`, lead: "Their bots are off shift now. Their data is kept for 30 days.", rows };
    else if ("cancel_at_period_end" in prev) alert = obj.cancel_at_period_end
      ? { kind: "canceling", heading: `${who} canceled`, lead: `Their team keeps working until ${day(obj.cancel_at ?? obj.current_period_end)}, then stops.`, rows }
      : { kind: "resumed", heading: `${who} is staying`, lead: "They took their cancellation back.", rows };
    else if ("items" in prev || "plan" in prev) alert = { kind: "plan_changed", heading: `${who} switched to ${planName(obj)}`, lead: "The difference is prorated on their next invoice.", rows };
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const ws = await wsFor(obj.customer);
    wsId = ws?.id ?? null;
    const who = ws?.name ?? obj.customer_name ?? obj.customer_email ?? "A customer";
    const rows: [string, string][] = [["Workspace", who], ["Billing email", obj.customer_email ?? ws?.billing_email ?? "—"], ["Invoice", obj.number ?? obj.id], ["Amount", usd(event.type === "invoice.paid" ? obj.amount_paid : obj.amount_due, obj.currency)]];
    if (event.type === "invoice.paid" && obj.amount_paid > 0) alert = { kind: "paid", heading: `${usd(obj.amount_paid, obj.currency)} from ${who}`, lead: obj.billing_reason === "subscription_create" ? "Their first payment." : "A renewal went through.", rows };
    if (event.type === "invoice.payment_failed") alert = { kind: "payment_failed", heading: `${who}'s payment of ${usd(obj.amount_due, obj.currency)} failed`, lead: obj.next_payment_attempt ? `Stripe tries again on ${day(obj.next_payment_attempt)} (attempt ${obj.attempt_count}).` : "Stripe won't retry. They need to update their card.", rows };
  }

  if (wsId) await store.log(wsId, { actor_type: "system", action: "billing", target: event.type, data: { event_id: event.id, status: obj.status ?? null } });
  if (alert) await ownerAlert({ ...alert, button: obj.hosted_invoice_url ? { label: "Open the invoice", url: obj.hosted_invoice_url } : undefined });
  return Response.json({ received: true });
}
