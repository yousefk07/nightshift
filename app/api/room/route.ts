import { after } from "next/server";
import { z } from "zod";
import { body, HttpError, requireWrite, route } from "@/lib/auth";
import { postInRoom, runQueued } from "@/lib/engine/flows";
import { recordError } from "@/lib/errors";
import { limits } from "@/lib/plans";
import { supabaseStore } from "@/lib/store-supabase";

// The bot room: GET the conversation (?after=ISO for new messages only) with the "In the room" sidebar and the
// "Holds in place" list; POST to say something. "@Penny ..." gives that bot a job, started right after the reply
// (the tick picks up anything this misses).
export const maxDuration = 300;

export const GET = route(async (req, me) => {
  const store = supabaseStore();
  if (!limits(me.ws).room) throw new HttpError(402, "The bot room is part of Studio and Team.");
  const room = await store.room(me.ws.id);
  const after = new URL(req.url).searchParams.get("after") ?? undefined;
  const [messages, bots, holds] = await Promise.all([store.messages(room.id, { limit: 150, after }), store.bots(me.ws.id), store.holds(me.ws.id, { open: true })]);
  return Response.json({
    thread_id: room.id,
    messages,
    in_the_room: bots.map((b) => ({ id: b.id, kind: b.kind, name: b.name, status: b.enabled ? b.status : "paused", status_text: b.enabled ? b.status_text : "Paused" })),
    holds: holds.map((h) => ({ id: h.id, label: h.label, scope: h.scope, reason: h.reason, by: bots.find((b) => b.id === h.bot_id)?.name ?? "You", resume_at: h.resume_at })),
  });
});

export const POST = route(async (req, me) => {
  requireWrite(me);
  if (!limits(me.ws).room) throw new HttpError(402, "The bot room is part of Studio and Team.");
  const { message } = await body(req, (v) => z.object({ message: z.string().min(1).max(5000) }).parse(v));
  const store = supabaseStore();
  const r = await postInRoom(store, me.ws, message, me.userId);
  if (r.queued.length) after(async () => {
    for (const q of r.queued) {
      const run = await store.claimRun(q.id);
      if (run) await runQueued(store, me.ws, run).catch((e) => recordError("room: run", e, { workspace_id: me.ws.id, run_id: run.id }));
    }
  });
  return Response.json({ message: r.message, queued: r.queued.map((x) => ({ run_id: x.id, bot_id: x.bot_id })) });
});
