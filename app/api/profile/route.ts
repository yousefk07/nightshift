import { z } from "zod";
import { body, route } from "@/lib/auth";
import { admin } from "@/lib/store-supabase";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Patch = z.object({
  full_name: z.string().max(80).optional(),
  avatar_url: z.string().url().max(500).nullable().optional(),
  phone: z.string().regex(/^\+?[0-9 ()-]{7,20}$/).nullable().optional(),
  working_hours: z.object({ start: time, end: time, days: z.array(z.number().int().min(0).max(6)) }).optional(),
  signature: z.string().max(2000).optional(), // "Email signature and tone": the bots write in this voice
}).strict();

// Your profile: the bots use it to write in your voice and keep to your hours.
export const GET = route(async (_req, me) => {
  const { data } = await admin().from("profiles").select("*").eq("user_id", me.userId).maybeSingle();
  return Response.json({ email: me.email, ...(data ?? {}) });
});

export const PATCH = route(async (req, me) => {
  const patch = await body(req, (v) => Patch.parse(v));
  const { data, error } = await admin().from("profiles").upsert({ user_id: me.userId, ...patch, updated_at: new Date().toISOString() }).select().single();
  if (error) throw new Error(error.message);
  // The signature also lives in team memory, so every bot signs off the same way.
  if (patch.signature !== undefined) {
    const db = admin();
    await db.from("memories").delete().eq("workspace_id", me.ws.id).eq("subject", "Owner's sign-off and tone");
    if (patch.signature.trim()) await db.from("memories").insert({ workspace_id: me.ws.id, subject: "Owner's sign-off and tone", fact: patch.signature.trim(), user_id: me.userId });
  }
  return Response.json(data);
});
