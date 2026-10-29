import { z } from "zod";
import { body, route } from "@/lib/auth";
import { postInRoom } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

// The bot room: GET the conversation (?after=ISO time for new messages only), POST to say something.
// "@inbox ..." in a message gives that bot a job; it answers in the room on the next tick.
export const GET = route(async (req, me) => {
  const store = supabaseStore();
  const room = await store.room(me.ws.id);
  const after = new URL(req.url).searchParams.get("after");
  let messages = await store.messages(room.id, 100);
  if (after) messages = messages.filter((m) => m.created_at > after);
  return Response.json({ thread_id: room.id, messages });
});

export const POST = route(async (req, me) => {
  const { message } = await body(req, (v) => z.object({ message: z.string().min(1).max(5000) }).parse(v));
  const r = await postInRoom(supabaseStore(), me.ws, message);
  return Response.json({ message: r.message, queued: r.queued.map((x) => ({ run_id: x.id, bot_id: x.bot_id })) });
});
