import { BOT_KINDS, botDef } from "../bots";
import type { Store } from "../store";
import { toolByName } from "../tools";
import type { Bot, BotKind, Run, Workspace } from "../types";
import { historyToChat, runBot, type RunResult } from "./agent";
import { nextRun } from "./schedule";
import type { EngineEvent } from "./tool";

// ---- 1:1 chat with a bot ----
export async function chatWithBot(
  store: Store,
  ws: Workspace,
  kind: BotKind,
  text: string,
  opts: { threadId?: string; onEvent?: (e: EngineEvent) => void; signal?: AbortSignal } = {},
) {
  const bot = await store.bot(ws.id, kind);
  if (!bot) throw new Error(`No ${kind} bot in this workspace.`);
  const thread = await store.directThread(ws.id, bot.id, opts.threadId);
  const history = historyToChat(await store.messages(thread.id, 30), bot.id);
  await store.addMessage({ workspace_id: ws.id, thread_id: thread.id, role: "owner", bot_id: null, run_id: null, content: text, data: {} });
  const run = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "chat", thread_id: thread.id, input: text });
  const result = await runBot(store, { ws, bot, run, input: text, history, onEvent: opts.onEvent, signal: opts.signal });
  const message = await store.addMessage({ workspace_id: ws.id, thread_id: thread.id, role: "bot", bot_id: bot.id, run_id: run.id, content: result.text, data: { actions: result.actions, status: result.status } });
  return { thread, run, message, result };
}

// ---- the bot room ----
// The owner writes in the room; "@inbox ..." (or a bot's name) gives that bot a job, which runs on the next tick.
export function mentions(text: string, bots: Bot[]) {
  const found = new Set<Bot>();
  for (const m of text.matchAll(/@([a-z][\w-]*(?:\s+brief)?)/gi)) {
    const word = m[1].toLowerCase().replace(/\s+/g, " ");
    const bot = bots.find((b) => b.kind === word || b.name.toLowerCase() === word || b.name.toLowerCase().replace(/[^a-z]/g, "") === word.replace(/[^a-z]/g, ""));
    if (bot) found.add(bot);
  }
  return [...found];
}

export async function postInRoom(store: Store, ws: Workspace, text: string) {
  const room = await store.room(ws.id);
  const message = await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "owner", bot_id: null, run_id: null, content: text, data: {} });
  const bots = (await store.bots(ws.id)).filter((b) => b.enabled);
  const queued: Run[] = [];
  for (const bot of mentions(text, bots)) {
    queued.push(await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "room", status: "queued", thread_id: room.id, input: `The owner wrote in the bot room: "${text}"` }));
  }
  return { message, queued };
}

// ---- approvals ----
export async function decideAction(store: Store, ws: Workspace, actionId: string, decision: "approve" | "reject", userId: string | null, editedPayload?: Record<string, unknown>) {
  const action = await store.action(ws.id, actionId);
  if (!action) throw new Error("No such action.");
  if (action.status !== "pending") throw new Error(`This was already ${action.status}.`);
  const decided = { decided_by: userId, decided_at: new Date().toISOString() };
  const room = await store.room(ws.id);
  const bot = (await store.bots(ws.id)).find((b) => b.id === action.bot_id)!;

  if (decision === "reject") {
    await store.updateAction(action.id, { status: "rejected", ...decided });
    await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "system", bot_id: null, run_id: null, content: `Rejected: ${action.title}`, data: { action_id: action.id } });
    return { status: "rejected" as const };
  }

  const tool = toolByName(action.tool);
  if (!tool) throw new Error(`Unknown tool ${action.tool}.`);
  const payload = editedPayload ?? action.payload;
  await store.updateAction(action.id, { status: "approved", payload, ...decided });
  const conns = await store.connections(ws.id);
  try {
    const result = await tool.run({ store, ws, bot, run: null, conns, usage: { searches: 0 }, emit: () => {} }, payload);
    await store.updateAction(action.id, { status: "done", result: result ?? { ok: true } });
    await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "bot", bot_id: bot.id, run_id: action.run_id, content: `Done: ${action.title}`, data: { action_id: action.id } });
    return { status: "done" as const, result };
  } catch (e) {
    await store.updateAction(action.id, { status: "failed", error: (e as Error).message });
    await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "bot", bot_id: bot.id, run_id: action.run_id, content: `Couldn't do it: ${action.title} (${(e as Error).message})`, data: { action_id: action.id } });
    return { status: "failed" as const, error: (e as Error).message };
  }
}

// ---- runs on demand (CLI "run", the Run button) ----
export async function runNow(store: Store, ws: Workspace, kind: BotKind, task?: string, onEvent?: (e: EngineEvent) => void) {
  const bot = await store.bot(ws.id, kind);
  if (!bot) throw new Error(`No ${kind} bot.`);
  const def = botDef(kind);
  const input = task || def.scheduledTask?.(ws, bot) || "Do your job.";
  const run = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "manual", input });
  const result = await runBot(store, { ws, bot, run, input, onEvent });
  await store.updateBot(bot.id, { last_run_at: new Date().toISOString() });
  await reportInRoom(store, ws, bot, run, result);
  return { run, result };
}

async function reportInRoom(store: Store, ws: Workspace, bot: Bot, run: Run, result: RunResult) {
  if (!result.text) return;
  const room = await store.room(ws.id);
  const short = result.text.length > 600 ? result.text.slice(0, 600).replace(/\s+\S*$/, "") + "…" : result.text;
  await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "bot", bot_id: bot.id, run_id: run.id, content: short, data: { run_id: run.id, status: result.status } });
}

// ---- the 5-minute tick (pg_cron calls /api/tick) ----
// Runs queued work first (hand-offs, room mentions), then bots whose schedule is due, until the time budget is spent.
export async function tick(store: Store, opts: { now?: Date; deadlineMs?: number } = {}) {
  const now = opts.now ?? new Date();
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);
  const done: { bot: string; trigger: string; status: string }[] = [];
  const workspaces = new Map<string, Workspace>();
  const wsOf = async (id: string) => {
    if (!workspaces.has(id)) workspaces.set(id, await store.workspace(id));
    return workspaces.get(id)!;
  };

  for (const run of await store.claimQueuedRuns(10)) {
    if (Date.now() > deadline) break;
    const ws = await wsOf(run.workspace_id);
    const bot = (await store.bots(ws.id)).find((b) => b.id === run.bot_id);
    if (!bot?.enabled) {
      await store.updateRun(run.id, { status: "stopped", error: "Bot is switched off" });
      continue;
    }
    const history = run.thread_id ? historyToChat(await store.messages(run.thread_id, 20), bot.id) : [];
    const result = await runBot(store, { ws, bot, run, input: run.input, history });
    await reportInRoom(store, ws, bot, run, result);
    done.push({ bot: bot.kind, trigger: run.trigger, status: result.status });
  }

  for (const bot of await store.dueBots(now)) {
    if (Date.now() > deadline) break;
    const ws = await wsOf(bot.workspace_id);
    const def = botDef(bot.kind);
    // Move the schedule on first, so an overlapping tick never runs the same bot twice.
    await store.updateBot(bot.id, { next_run_at: nextRun(def.schedule, ws.timezone, now)?.toISOString() ?? null });
    const input = def.scheduledTask?.(ws, bot) ?? "Do your scheduled job.";
    const run = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "schedule", input });
    const result = await runBot(store, { ws, bot, run, input });
    await store.updateBot(bot.id, { last_run_at: now.toISOString() });
    if (bot.kind !== "inbox" || result.actions.length) await reportInRoom(store, ws, bot, run, result); // Inbox runs every 15 min: only speak up when there's something
    done.push({ bot: bot.kind, trigger: "schedule", status: result.status });
  }
  return done;
}

// ---- first sign-in: the workspace and its team ----
export function defaultBots(ws: Workspace, now = new Date()) {
  return BOT_KINDS.map((kind) => {
    const def = botDef(kind);
    return { kind, name: def.name, approval: "ask" as const, next_run_at: nextRun(def.schedule, ws.timezone, now)?.toISOString() ?? null };
  });
}
