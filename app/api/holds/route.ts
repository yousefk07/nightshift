import { z } from "zod";
import { body, requireWrite, route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// "Holds in place" and "Pause one bot for a specific client": the team stops contacting someone.
export const GET = route(async (req, me) => {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Response.json({ holds: await supabaseStore().holds(me.ws.id, { open: !all }) });
});

const Hold = z.object({
  who: z.string().min(2).max(200), // an email, a domain or a company name
  label: z.string().min(1).max(80),
  scope: z.enum(["all", "reminders", "followups"]).default("all"),
  reason: z.string().min(2).max(300),
  resume_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST = route(async (req, me) => {
  requireWrite(me);
  const h = await body(req, (v) => Hold.parse(v));
  const store = supabaseStore();
  const hold = await store.placeHold(me.ws.id, { subject: h.who.toLowerCase().trim(), label: h.label, scope: h.scope, reason: h.reason, bot_id: null, user_id: me.userId, resume_at: h.resume_on ? new Date(`${h.resume_on}T09:00:00Z`).toISOString() : null });
  const room = await store.room(me.ws.id);
  await store.addMessage({ workspace_id: me.ws.id, thread_id: room.id, role: "owner", kind: "hold", user_id: me.userId, content: `Hold on ${h.label}: ${h.reason}`, data: { hold_id: hold.id, label: h.label, scope: h.scope } });
  await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "placed_hold", target: h.label, why: h.reason });
  return Response.json({ hold });
});
