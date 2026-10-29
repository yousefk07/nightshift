import { z } from "zod";
import { body, route } from "@/lib/auth";
import { chatWithBot } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";
import { ndjson } from "@/lib/stream";

export const maxDuration = 300;

const Chat = z.object({
  bot: z.enum(["inbox", "research", "followup", "brief"]),
  message: z.string().min(1).max(20_000),
  thread_id: z.string().uuid().optional(),
});

// A message to one bot. Streams its reply, tool use and any approval cards as NDJSON.
export const POST = route(async (req, me) => {
  const { bot, message, thread_id } = await body(req, (v) => Chat.parse(v));
  return ndjson(async (send) => {
    // Not tied to the request's signal: if the reader disconnects, the bot still finishes and saves its answer.
    const r = await chatWithBot(supabaseStore(), me.ws, bot, message, { threadId: thread_id, onEvent: send });
    return { thread_id: r.thread.id, message_id: r.message.id, run_id: r.run.id, status: r.result.status, actions: r.result.actions, cost_usd: r.result.costUsd };
  }, req);
});
