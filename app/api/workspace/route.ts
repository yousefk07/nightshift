import { z } from "zod";
import { body, requireOwner, route } from "@/lib/auth";
import { INDUSTRIES, industryOpen } from "@/lib/bots";
import { renameToCast } from "@/lib/engine/flows";
import { admin, supabaseStore } from "@/lib/store-supabase";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Patch = z.object({
  name: z.string().min(1).max(80).optional(),
  about: z.string().max(2000).optional(),
  industry: z.string().refine((i) => i in INDUSTRIES, "Unknown industry").refine(industryOpen, "Health and medical practices aren't open yet: they need a model that meets health-privacy rules.").optional(),
  timezone: z.string().refine((tz) => {
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
  }, "Unknown time zone").optional(),
  shift_start: time.optional(), // "Change shift hours"
  billing_email: z.string().email().optional(),
  daily_budget_usd: z.number().min(0).max(100).optional(),
}).strict();

export const PATCH = route(async (req, me) => {
  requireOwner(me);
  const patch = await body(req, (v) => Patch.parse(v));
  const { data, error } = await admin().from("workspaces").update(patch).eq("id", me.ws.id).select().single();
  if (error) throw new Error(error.message);
  if (patch.industry) await renameToCast(supabaseStore(), await supabaseStore().workspace(me.ws.id));
  return Response.json(data);
});

// "Delete workspace": every bot stops and tools are disconnected now; the history is deleted after 30 days
// (the tick purges it). POST {restore: true} within those 30 days undoes it.
export const DELETE = route(async (_req, me) => {
  requireOwner(me);
  const db = admin(), store = supabaseStore();
  await db.from("bots").update({ enabled: false, status: "paused", status_text: "Paused" }).eq("workspace_id", me.ws.id);
  await db.from("connections").delete().eq("workspace_id", me.ws.id);
  await db.from("api_tokens").delete().eq("workspace_id", me.ws.id);
  await store.updateWorkspace(me.ws.id, { deleted_at: new Date().toISOString() });
  await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "deleted_workspace" });
  return Response.json({ deleted: true, purged_after: new Date(Date.now() + 30 * 86_400_000).toISOString() });
});

export const POST = route(async (req, me) => {
  requireOwner(me);
  const { restore } = await body(req, (v) => z.object({ restore: z.literal(true) }).parse(v));
  if (restore) await supabaseStore().updateWorkspace(me.ws.id, { deleted_at: null });
  return Response.json({ restored: true, note: "Reconnect your tools and resume the bots you want back." });
});
