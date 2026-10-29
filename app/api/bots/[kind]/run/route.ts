import { z } from "zod";
import { body, HttpError, requireWrite, route } from "@/lib/auth";
import { runNow } from "@/lib/engine/flows";
import { isActive } from "@/lib/plans";
import { supabaseStore } from "@/lib/store-supabase";
import { ndjson } from "@/lib/stream";
import type { BotKind } from "@/lib/types";

export const maxDuration = 300;

// "Start Penny now", or `nightshift ask sage "..."` with a task. Streams like chat; the result goes to the room.
export const POST = route<{ params: Promise<{ kind: string }> }>(async (req, me, { params }) => {
  requireWrite(me);
  if (!isActive(me.ws)) throw new HttpError(402, "Your trial has ended. Pick a plan to keep the team working.");
  const kind = decodeURIComponent((await params).kind) as BotKind;
  if (!(await supabaseStore().bot(me.ws.id, kind))) throw new HttpError(404, "No such bot on your team.");
  const { task } = await body(req, (v) => z.object({ task: z.string().max(20_000).optional() }).parse(v ?? {}));
  return ndjson(async (send) => {
    const r = await runNow(supabaseStore(), me.ws, kind, task, send);
    return { run_id: r.run.id, status: r.result.status, text: r.result.text, actions: r.result.actions, cost_usd: r.result.costUsd };
  }, req);
});
