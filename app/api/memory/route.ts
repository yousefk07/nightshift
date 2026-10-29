import { z } from "zod";
import { body, requireWrite, route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// The team's shared memory: see every fact the bots know, add one, or delete one.
export const GET = route(async (req, me) => {
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return Response.json({ memories: await supabaseStore().memories(me.ws.id, { query: q, limit: 200 }) });
});

export const POST = route(async (req, me) => {
  requireWrite(me);
  const m = await body(req, (v) => z.object({ subject: z.string().max(120).default(""), fact: z.string().min(3).max(500) }).parse(v));
  return Response.json({ memory: await supabaseStore().remember(me.ws.id, { ...m, user_id: me.userId }) });
});

export const DELETE = route(async (req, me) => {
  requireWrite(me);
  const id = new URL(req.url).searchParams.get("id");
  if (id) await supabaseStore().forget(me.ws.id, id);
  return Response.json({ forgotten: !!id });
});
