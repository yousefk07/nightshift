import { applyLatest, applySubscription, verifyWebhook } from "@/lib/billing";
import { supabaseStore } from "@/lib/store-supabase";

// Stripe tells us when a subscription starts, changes or ends. Signed with STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const payload = await req.text();
  if (!verifyWebhook(payload, req.headers.get("stripe-signature"))) return Response.json({ error: "Bad signature" }, { status: 400 });
  const event = JSON.parse(payload);
  const store = supabaseStore();
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const sub = event.data.object;
    const ws = await applyLatest(store, sub.id).catch(() => {
      if (event.type === "customer.subscription.deleted") sub.status = "canceled";
      return applySubscription(store, sub); // Stripe unreachable: the event is the best we have
    });
    if (ws) await store.log(ws, { actor_type: "system", action: "billing", target: event.type, data: { status: sub.status } });
  }
  return Response.json({ received: true });
}
