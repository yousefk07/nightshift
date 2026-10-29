import { z } from "zod";
import { body, HttpError, route } from "@/lib/auth";
import { runNow } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";
import { ndjson } from "@/lib/stream";
import type { BotKind } from "@/lib/types";

export const maxDuration = 300;

// Run a bot now, with its usual task or a given one. Streams like chat; the result is reported in the room.
export const POST = route<{ params: Promise<{ kind: string }> }>(async (req, me, { params }) => {
  const kind = z.enum(["inbox", "research", "followup", "brief"]).safeParse((await params).kind);
  if (!kind.success) throw new HttpError(404, "No such bot.");
  const { task } = await body(req, (v) => z.object({ task: z.string().max(20_000).optional() }).parse(v ?? {}));
  return ndjson(async (send) => {
    const r = await runNow(supabaseStore(), me.ws, kind.data as BotKind, task, send);
    return { run_id: r.run.id, status: r.result.status, text: r.result.text, actions: r.result.actions, cost_usd: r.result.costUsd };
  }, req);
});
