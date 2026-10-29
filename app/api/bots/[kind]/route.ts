import { z } from "zod";
import { body, HttpError, requireOwner, route } from "@/lib/auth";
import { botDef } from "@/lib/bots";
import { settleStatus } from "@/lib/engine/agent";
import { nextRun } from "@/lib/engine/schedule";
import { supabaseStore } from "@/lib/store-supabase";
import type { BotKind } from "@/lib/types";

const Patch = z.object({
  name: z.string().min(1).max(30).optional(),
  approval: z.enum(["ask", "auto"]).optional(), // for messages; money always asks
  enabled: z.boolean().optional(), // "Pause Penny"
  settings: z.record(z.string(), z.unknown()).optional(),
}).strict();

type Ctx = { params: Promise<{ kind: string }> };

async function find(wsId: string, params: Ctx["params"]) {
  const bot = await supabaseStore().bot(wsId, decodeURIComponent((await params).kind) as BotKind);
  if (!bot) throw new HttpError(404, "No such bot on your team.");
  return bot;
}

// A bot's side panel: who it is, what it's doing, its recent runs and waiting drafts.
export const GET = route<Ctx>(async (_req, me, { params }) => {
  const bot = await find(me.ws.id, params);
  const store = supabaseStore();
  const [runs, pending] = await Promise.all([store.runs(me.ws.id, { botId: bot.id, limit: 10 }), store.actions(me.ws.id, "pending")]);
  const t = botDef(bot.kind);
  return Response.json({
    bot,
    template: { name: t.name, role: t.role, title: t.title, hue: t.hue, prop: t.prop, category: t.category, needs: t.needs, schedule: t.schedule },
    waiting: pending.filter((a) => a.bot_id === bot.id),
    runs: runs.map((r) => ({ id: r.id, at: r.created_at, trigger: r.trigger, status: r.status, summary: r.summary?.slice(0, 280), cost_usd: r.cost_usd, retry_at: r.retry_at })),
  });
});

export const PATCH = route<Ctx>(async (req, me, { params }) => {
  requireOwner(me);
  const bot = await find(me.ws.id, params);
  const patch = await body(req, (v) => Patch.parse(v));
  const store = supabaseStore();
  const extra = patch.enabled === true && !bot.enabled ? { next_run_at: nextRun(botDef(bot.kind).schedule, me.ws.timezone)?.toISOString() ?? null } : {};
  await store.updateBot(bot.id, { ...patch, ...extra });
  const updated = { ...bot, ...patch, ...extra };
  await settleStatus(store, me.ws, updated);
  if (patch.enabled !== undefined) await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: patch.enabled ? "resumed" : "paused", target: bot.name });
  return Response.json({ bot: updated });
});

// Let a bot go. Its history stays; its waiting drafts are discarded.
export const DELETE = route<Ctx>(async (_req, me, { params }) => {
  requireOwner(me);
  const bot = await find(me.ws.id, params);
  const store = supabaseStore();
  for (const a of (await store.actions(me.ws.id, "pending")).filter((a) => a.bot_id === bot.id)) await store.updateAction(a.id, { status: "rejected" });
  await store.fireBot(me.ws.id, bot.kind);
  await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "let_go", target: bot.name });
  return Response.json({ removed: bot.kind });
});
