import { z } from "zod";
import { body, requireOwner, route } from "@/lib/auth";
import { setCancel } from "@/lib/billing";
import { supabaseStore } from "@/lib/store-supabase";

// "Cancel plan" (at the end of the period: the bots keep working until then) and "Keep my plan" (takes it back).
export const POST = route(async (req, me) => {
  requireOwner(me);
  const { action } = await body(req, (v) => z.object({ action: z.enum(["cancel", "resume"]) }).parse(v));
  const store = supabaseStore();
  const sub = await setCancel(store, me.ws, action === "cancel");
  await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: action === "cancel" ? "canceled_plan" : "resumed_plan", target: sub.period_end ?? "" });
  return Response.json(sub);
});
