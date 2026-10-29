import { z } from "zod";
import { body, HttpError, route } from "@/lib/auth";
import { botDef } from "@/lib/bots";
import { nextRun } from "@/lib/engine/schedule";
import { supabaseStore } from "@/lib/store-supabase";
import type { BotKind } from "@/lib/types";

const Kind = z.enum(["inbox", "research", "followup", "brief"]);
const Patch = z.object({
  name: z.string().min(1).max(40).optional(),
  approval: z.enum(["ask", "auto"]).optional(), // the per-bot "ask me / just do it" switch
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
}).strict();

type Ctx = { params: Promise<{ kind: string }> };

async function find(wsId: string, params: Ctx["params"]) {
  const kind = Kind.safeParse((await params).kind);
  if (!kind.success) throw new HttpError(404, "No such bot.");
  const bot = await supabaseStore().bot(wsId, kind.data as BotKind);
  if (!bot) throw new HttpError(404, "No such bot.");
  return bot;
}

export const GET = route<Ctx>(async (_req, me, { params }) => {
  const bot = await find(me.ws.id, params);
  const runs = await supabaseStore().runs(me.ws.id, { botId: bot.id, limit: 10 });
  return Response.json({ bot, schedule: botDef(bot.kind).schedule, runs });
});

export const PATCH = route<Ctx>(async (req, me, { params }) => {
  const bot = await find(me.ws.id, params);
  const patch = await body(req, (v) => Patch.parse(v));
  const store = supabaseStore();
  const extra = patch.enabled === true && !bot.enabled ? { next_run_at: nextRun(botDef(bot.kind).schedule, me.ws.timezone)?.toISOString() ?? null } : {};
  await store.updateBot(bot.id, { ...patch, ...extra });
  return Response.json({ bot: { ...bot, ...patch, ...extra } });
});
