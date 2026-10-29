import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";
import { PLANS, type PaidPlan } from "./plans";
import type { Store } from "./store";
import type { Workspace } from "./types";

// Nightshift's own billing, on Stripe Billing. Prices are found by lookup key (nightshift_<plan>_<interval>,
// nightshift_seat_<interval>), so test and live mode use the same code.

const S = "https://api.stripe.com/v1";
const key = () => {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set");
  return k;
};

// Stripe's form encoding, nested keys included: { line_items: [{ price: "x" }] } -> line_items[0][price]=x
function encode(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? encode(item as Record<string, unknown>, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))));
    else if (typeof v === "object") encode(v as Record<string, unknown>, name, out);
    else out.append(name, String(v));
  }
  return out;
}

async function stripe<T = any>(path: string, body?: Record<string, unknown>, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(`${S}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key()}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? encode(body).toString() : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${j.error?.message ?? res.status}`);
  return j as T;
}

export async function priceId(lookup: string) {
  const r = await stripe<{ data: { id: string }[] }>(`/prices?lookup_keys[]=${encodeURIComponent(lookup)}&active=true`);
  if (!r.data[0]) throw new Error(`No Stripe price with lookup key ${lookup}`);
  return r.data[0].id;
}

async function customerFor(store: Store, ws: Workspace, email: string) {
  if (ws.stripe_customer_id) return ws.stripe_customer_id;
  const c = await stripe<{ id: string }>("/customers", { email: ws.billing_email ?? email, name: ws.name, metadata: { workspace_id: ws.id } });
  await store.updateWorkspace(ws.id, { stripe_customer_id: c.id });
  return c.id;
}

export async function checkout(store: Store, ws: Workspace, email: string, plan: PaidPlan, interval: "month" | "year", appUrl: string) {
  const customer = await customerFor(store, ws, email);
  const line_items: { price: string; quantity: number }[] = [{ price: await priceId(`nightshift_${plan}_${interval}`), quantity: 1 }];
  if (ws.extra_seats > 0) line_items.push({ price: await priceId(`nightshift_seat_${interval}`), quantity: ws.extra_seats });
  const session = await stripe<{ url: string }>("/checkout/sessions", {
    mode: "subscription", customer, line_items, client_reference_id: ws.id,
    subscription_data: { metadata: { workspace_id: ws.id, plan } },
    success_url: `${appUrl}/settings/billing?checkout=done`, cancel_url: `${appUrl}/settings/billing`,
    allow_promotion_codes: true, billing_address_collection: "auto", tax_id_collection: { enabled: true }, customer_update: { name: "auto", address: "auto" },
  });
  return session.url;
}

// The customer portal: change card, plan, billing details, download invoices, cancel at period end.
export async function portal(store: Store, ws: Workspace, email: string, appUrl: string) {
  const customer = await customerFor(store, ws, email);
  return (await stripe<{ url: string }>("/billing_portal/sessions", { customer, return_url: `${appUrl}/settings/billing` })).url;
}

export async function billingSummary(ws: Workspace) {
  if (!ws.stripe_customer_id) return { invoices: [], card: null };
  const [inv, pm] = await Promise.all([
    stripe<{ data: any[] }>(`/invoices?customer=${ws.stripe_customer_id}&limit=12`),
    stripe<{ data: any[] }>(`/customers/${ws.stripe_customer_id}/payment_methods?type=card&limit=1`),
  ]);
  return {
    invoices: inv.data.map((i) => ({ date: new Date(i.created * 1000).toISOString(), description: i.lines?.data?.[0]?.description ?? "Nightshift", amount: i.total / 100, currency: i.currency.toUpperCase(), status: i.status, pdf: i.invoice_pdf })),
    card: pm.data[0] ? { brand: pm.data[0].card.brand, last4: pm.data[0].card.last4, exp: `${String(pm.data[0].card.exp_month).padStart(2, "0")}/${String(pm.data[0].card.exp_year).slice(-2)}` } : null,
  };
}

// Checks Stripe's webhook signature (t=..., v1=...), within five minutes.
export function verifyWebhook(payload: string, header: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET ?? "") {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const want = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => safeEqual(p.slice(3), want));
}

// Keeps the workspace's plan in step with its subscription.
export async function applySubscription(store: Store, sub: any) {
  const wsId = sub.metadata?.workspace_id;
  if (!wsId) return null;
  const items: any[] = sub.items?.data ?? [];
  const planItem = items.find((i) => /^nightshift_(solo|studio|team)_/.test(i.price?.lookup_key ?? ""));
  const seatItem = items.find((i) => /^nightshift_seat_/.test(i.price?.lookup_key ?? ""));
  const plan = (planItem?.price.lookup_key.split("_")[1] ?? sub.metadata?.plan) as PaidPlan;
  const live = ["active", "trialing", "past_due"].includes(sub.status);
  await store.updateWorkspace(wsId, {
    plan: live && plan in PLANS ? plan : "canceled",
    plan_interval: planItem?.price.recurring?.interval ?? null,
    extra_seats: seatItem?.quantity ?? 0,
    stripe_subscription_id: sub.id,
    current_period_end: (sub.current_period_end ?? planItem?.current_period_end) ? new Date((sub.current_period_end ?? planItem.current_period_end) * 1000).toISOString() : null,
  });
  return wsId as string;
}

// The live subscription straight from Stripe, applied to the workspace on the way. The app is right even when a
// webhook never arrives (none set up, a missed delivery): the billing page and the checkout return both call it.
export async function syncSubscription(store: Store, ws: Workspace) {
  if (!ws.stripe_customer_id) return null;
  const r = await stripe<{ data: any[] }>(`/subscriptions?customer=${ws.stripe_customer_id}&status=all&limit=5`);
  const sub = r.data.find((s) => ["active", "trialing", "past_due"].includes(s.status)) ?? r.data[0];
  if (!sub) return null;
  sub.metadata = { ...sub.metadata, workspace_id: sub.metadata?.workspace_id ?? ws.id };
  await applySubscription(store, sub);
  return subView(sub);
}

const subView = (sub: any) => {
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return { id: sub.id as string, status: sub.status as string, cancel_at_period_end: !!sub.cancel_at_period_end, period_end: end ? new Date(end * 1000).toISOString() : null };
};

// Cancel at the end of the period (the bots work until then), or take that back.
export async function setCancel(store: Store, ws: Workspace, cancel: boolean) {
  if (!ws.stripe_subscription_id) throw Object.assign(new Error("There's no subscription to change."), { status: 400 });
  const sub = await stripe(`/subscriptions/${ws.stripe_subscription_id}`, { cancel_at_period_end: cancel });
  await applySubscription(store, { ...sub, metadata: { ...sub.metadata, workspace_id: ws.id } });
  return subView(sub);
}

// Switch plan or interval on the running subscription, prorated; extra seats follow the interval.
export async function changePlan(store: Store, ws: Workspace, plan: PaidPlan, interval: "month" | "year") {
  if (!ws.stripe_subscription_id) throw Object.assign(new Error("There's no subscription to change."), { status: 400 });
  const sub = await stripe(`/subscriptions/${ws.stripe_subscription_id}`);
  const items: { id: string; price: string }[] = [];
  for (const i of sub.items.data as any[]) {
    const lk: string = i.price?.lookup_key ?? "";
    if (/^nightshift_(solo|studio|team)_/.test(lk)) items.push({ id: i.id, price: await priceId(`nightshift_${plan}_${interval}`) });
    else if (/^nightshift_seat_/.test(lk)) items.push({ id: i.id, price: await priceId(`nightshift_seat_${interval}`) });
  }
  const updated = await stripe(`/subscriptions/${sub.id}`, { items, proration_behavior: "create_prorations", cancel_at_period_end: false, metadata: { workspace_id: ws.id, plan } });
  await applySubscription(store, { ...updated, metadata: { ...updated.metadata, workspace_id: ws.id, plan } });
  return subView(updated);
}

// For the webhook: events can arrive late or out of order (an "updated" after a "deleted"), so the subscription
// is read fresh from Stripe and that is what's applied.
export async function applyLatest(store: Store, subId: string) {
  const sub = await stripe(`/subscriptions/${subId}`);
  return applySubscription(store, sub);
}
