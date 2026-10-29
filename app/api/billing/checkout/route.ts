import { z } from "zod";
import { body, requireOwner, route } from "@/lib/auth";
import { checkout, portal } from "@/lib/billing";
import { supabaseStore } from "@/lib/store-supabase";

const appUrl = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;

// "Change plan" / "Switch to yearly": a Stripe Checkout page for a new subscription, or the customer portal for
// an existing one (change plan, card, billing details, cancel at period end).
export const POST = route(async (req, me) => {
  requireOwner(me);
  const { plan, interval } = await body(req, (v) => z.object({ plan: z.enum(["solo", "studio", "team"]), interval: z.enum(["month", "year"]).default("month") }).parse(v));
  const store = supabaseStore();
  const url = me.ws.stripe_subscription_id && me.ws.plan !== "canceled" ? await portal(store, me.ws, me.email, appUrl(req)) : await checkout(store, me.ws, me.email, plan, interval, appUrl(req));
  return Response.json({ url });
});
