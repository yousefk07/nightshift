import { z } from "zod";
import { body, route } from "@/lib/auth";
import { admin } from "@/lib/store-supabase";

const Patch = z.object({
  name: z.string().min(1).max(80).optional(),
  about: z.string().max(2000).optional(),
  timezone: z.string().refine((tz) => {
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
  }, "Unknown time zone").optional(),
  daily_budget_usd: z.number().min(0).max(100).optional(),
}).strict();

export const PATCH = route(async (req, me) => {
  const patch = await body(req, (v) => Patch.parse(v));
  const { data, error } = await admin().from("workspaces").update(patch).eq("id", me.ws.id).select().single();
  if (error) throw new Error(error.message);
  return Response.json(data);
});
