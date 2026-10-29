import { z } from "zod";
import { body, route } from "@/lib/auth";
import { admin } from "@/lib/store-supabase";

// In-app notifications (the bell). POST {ids} or {all: true} marks them read.
export const GET = route(async (_req, me) => {
  const { data } = await admin().from("notifications").select("*").eq("user_id", me.userId).eq("workspace_id", me.ws.id).order("created_at", { ascending: false }).limit(50);
  return Response.json({ notifications: data ?? [] });
});

export const POST = route(async (req, me) => {
  const b = await body(req, (v) => z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() }).parse(v));
  let q = admin().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me.userId).is("read_at", null);
  if (!b.all) q = q.in("id", b.ids ?? []);
  await q;
  return Response.json({ read: true });
});
