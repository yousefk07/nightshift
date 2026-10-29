import { z } from "zod";
import { body, HttpError, requireWrite, route } from "@/lib/auth";
import { chatWithBot } from "@/lib/engine/flows";
import { isActive } from "@/lib/plans";
import { supabaseStore } from "@/lib/store-supabase";
import { ndjson } from "@/lib/stream";

export const maxDuration = 300;

const Chat = z.object({
  bot: z.string().min(1).max(80), // a hired bot's id: "inbox", "dental_general.recall" ...
  message: z.string().min(1).max(20_000),
  thread_id: z.string().uuid().optional(),
});

// A message to one bot. Streams its reply, tool use, status and any approval cards as NDJSON.
export const POST = route(async (req, me) => {
  requireWrite(me);
  if (!isActive(me.ws)) throw new HttpError(402, "Your trial has ended. Pick a plan to keep the team working.");
  const { bot, message, thread_id } = await body(req, (v) => Chat.parse(v));
  return ndjson(async (send) => {
    // Not tied to the request's signal: if the reader disconnects, the bot still finishes and saves its answer.
    const r = await chatWithBot(supabaseStore(), me.ws, bot, message, { threadId: thread_id, userId: me.userId, onEvent: send });
    return { thread_id: r.thread.id, message_id: r.message.id, run_id: r.run.id, status: r.result.status, actions: r.result.actions, cost_usd: r.result.costUsd };
  }, req);
});
