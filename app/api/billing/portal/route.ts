import { requireOwner, route } from "@/lib/auth";
import { portal } from "@/lib/billing";
import { supabaseStore } from "@/lib/store-supabase";

// Stripe's customer portal: update card, billing details and VAT, download invoices, cancel.
export const POST = route(async (req, me) => {
  requireOwner(me);
  return Response.json({ url: await portal(supabaseStore(), me.ws, me.email, process.env.APP_URL ?? new URL(req.url).origin) });
});
