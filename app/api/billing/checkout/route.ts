import { z } from "zod";
import { body, requireOwner, route } from "@/lib/auth";
import { changePlan, checkout } from "@/lib/billing";
import { supabaseStore } from "@/lib/store-supabase";

const appUrl = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;

// "Choose Studio" / "Switch to yearly": a Stripe Checkout page for a first subscription; with one running, the
// plan or interval changes in place (prorated) and the page comes back with ?changed=<plan>.
export const POST = route(async (req, me) => {
  requireOwner(me);
  const { plan, interval } = await body(req, (v) => z.object({ plan: z.enum(["solo", "studio", "team"]), interval: z.enum(["month", "year"]).default("month") }).parse(v));
  const store = supabaseStore();
  if (me.ws.stripe_subscription_id && me.ws.plan !== "canceled" && me.ws.plan !== "trial") {
    await changePlan(store, me.ws, plan, interval);
    await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "changed_plan", target: `${plan} (${interval})` });
    return Response.json({ url: `${appUrl(req)}/settings/billing?changed=${plan}` });
  }
  return Response.json({ url: await checkout(store, me.ws, me.email, plan, interval, appUrl(req)) });
});
