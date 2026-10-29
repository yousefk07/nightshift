import { z } from "zod";
import { body, requireOwner, route } from "@/lib/auth";
import { EVENTS, prefsOf, type NotifyEvent } from "@/lib/notify";
import { admin, supabaseStore } from "@/lib/store-supabase";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const channel = z.enum(["app", "email", "push"]);

// Notifications & morning brief: the event-by-channel matrix and quiet hours are per person; the brief's time,
// days, length and channels are the workspace's (owner only).
export const GET = route(async (_req, me) => {
  const { data } = await admin().from("members").select("user_id, role, notify").eq("workspace_id", me.ws.id).eq("user_id", me.userId).single();
  return Response.json({ events: EVENTS, mine: prefsOf(data!), brief: me.ws.brief_prefs });
});

const Put = z.object({
  events: z.record(z.string().refine((e) => e in EVENTS), z.array(channel)).optional(),
  quiet_hours: z.object({ on: z.boolean(), start: time, end: time }).optional(),
  brief: z.object({ time, days: z.array(z.number().int().min(0).max(6)).min(1), length: z.enum(["short", "standard", "detailed"]), channels: z.array(z.enum(["app", "email", "push", "terminal"])) }).optional(),
});

export const PUT = route(async (req, me) => {
  const p = await body(req, (v) => Put.parse(v));
  const db = admin();
  const { data } = await db.from("members").select("user_id, role, notify").eq("workspace_id", me.ws.id).eq("user_id", me.userId).single();
  const cur = prefsOf(data!);
  const notify = { events: { ...cur.events, ...(p.events as Partial<Record<NotifyEvent, ("app" | "email" | "push")[]>>) }, quiet_hours: p.quiet_hours ?? cur.quiet_hours };
  await db.from("members").update({ notify }).eq("workspace_id", me.ws.id).eq("user_id", me.userId);
  if (p.brief) {
    requireOwner(me);
    await supabaseStore().updateWorkspace(me.ws.id, { brief_prefs: p.brief });
  }
  return Response.json({ mine: notify, brief: p.brief ?? me.ws.brief_prefs });
});
