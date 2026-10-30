import { botDef, CASTS, chipsFor, starters, taskFor, teamLabel, TEMPLATES, type BotTemplate, type Industry } from "../bots";
import { CORE_IDS } from "../bots/casts";
import type { Store } from "../store";
import { recordError } from "../errors";
import { trialPaused } from "../plans";
import { toolByName } from "../tools";
import type { Action, Bot, BotKind, Role, Run, Workspace } from "../types";
import { historyToChat, missingNeeds, runBot, settleStatus, type RunResult } from "./agent";
import { localDate, nextRun } from "./schedule";
import type { EngineEvent } from "./tool";

export const UNDO_SECONDS = 8;

// ---- 1:1 chat with a bot ----
export async function chatWithBot(
  store: Store,
  ws: Workspace,
  kind: BotKind,
  text: string,
  opts: { threadId?: string; userId?: string | null; onEvent?: (e: EngineEvent) => void; signal?: AbortSignal } = {},
) {
  const bot = await store.bot(ws.id, kind);
  if (!bot) throw new Error(`There's no ${kind} on your team.`);
  const thread = await store.directThread(ws.id, bot.id, opts.threadId);
  const history = historyToChat(await store.messages(thread.id, { limit: 30 }), bot.id);
  await store.addMessage({ workspace_id: ws.id, thread_id: thread.id, role: "owner", user_id: opts.userId ?? null, content: text });
  const run = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "chat", thread_id: thread.id, input: text });
  const result = await runBot(store, { ws, bot, run, input: text, history, onEvent: opts.onEvent, signal: opts.signal });
  const message = await store.addMessage({ workspace_id: ws.id, thread_id: thread.id, role: "bot", bot_id: bot.id, run_id: run.id, content: result.text, data: { action_ids: result.actions, status: result.status } });
  return { thread, run, message, result };
}

// ---- the bot room ----
// "@Penny ..." or "@inbox ..." gives that bot a job, which runs on the next tick and answers in the room.
export function mentions(text: string, bots: Bot[], industry?: string) {
  const found = new Set<Bot>();
  for (const m of text.matchAll(/@([\p{L}][\p{L}\d_.-]*(?:\s+brief)?)/gu)) {
    const word = m[1].toLowerCase().replace(/[.,!?]+$/, "");
    const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const bot = bots.find((b) => b.kind === word || b.name.toLowerCase() === word || flat(b.name) === flat(word) || flat(roleOf(b)) === flat(word) || flat(roleOf(b, industry)) === flat(word));
    if (bot) found.add(bot);
  }
  return [...found];
}
const roleOf = (b: Bot, industry?: string) => {
  try {
    return botDef(b.kind, industry).role;
  } catch {
    return "";
  }
};

export async function postInRoom(store: Store, ws: Workspace, text: string, userId: string | null = null) {
  const room = await store.room(ws.id);
  const bots = (await store.bots(ws.id)).filter((b) => b.enabled);
  const named = mentions(text, bots, ws.industry);
  const message = await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "owner", user_id: userId, content: text, mentions: named.map((b) => b.id) });
  const queued: Run[] = [];
  for (const bot of named) {
    queued.push(await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "room", status: "queued", thread_id: room.id, input: `The owner wrote in the bot room: "${text}"` }));
    await store.updateBot(bot.id, { status: "working", status_text: "Reading the room" });
  }
  return { message, queued };
}

// ---- approvals ----
// Who may approve what: owners and approvers everything; "approver: email only" messages; viewers nothing.
export function canApprove(role: Role, a: Pick<Action, "risk">) {
  if (role === "owner" || role === "approver") return true;
  if (role === "approver_email") return a.risk === "message";
  return false;
}

export class ApprovalError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// Approve: the card goes to "sending" and leaves after the undo window (the route waits it out; the tick is the
// backstop). Edited fields replace the bot's draft.
export async function approveAction(store: Store, ws: Workspace, id: string, who: { userId: string | null; role: Role }, editedPayload?: Record<string, unknown>, now = new Date()) {
  const a = await store.action(ws.id, id);
  if (!a) throw new ApprovalError("No such approval.", 404);
  if (a.status !== "pending") throw new ApprovalError(`This was already ${a.status}.`, 409);
  if (!canApprove(who.role, a)) throw new ApprovalError(a.risk === "money" ? "Only owners and approvers can approve money." : "Your role can't approve this.", 403);
  const send_after = new Date(now.getTime() + UNDO_SECONDS * 1000).toISOString();
  // an edit is checked like the bot's draft was, and the card's title and amount follow it
  let edits: Partial<Action> = {};
  if (editedPayload) {
    const tool = toolByName(a.tool);
    const wrong = tool?.check?.(editedPayload);
    if (wrong) throw new ApprovalError(wrong, 400);
    const card = tool?.card?.(editedPayload);
    if (card) edits = { title: card.title, counterparty: card.counterparty ?? a.counterparty, amount_cents: card.amount_cents ?? a.amount_cents, currency: card.currency ?? a.currency };
  }
  if (!(await store.moveAction(a.id, ["pending"], { status: "sending", send_after, payload: editedPayload ?? a.payload, decided_by: who.userId, decided_at: now.toISOString(), ...edits }))) throw new ApprovalError("Someone just decided this one.", 409);
  await store.log(ws.id, { actor_type: "user", actor_id: who.userId, action: "approved", target: a.title, data: { action_id: a.id, edited: !!editedPayload } });
  return { status: "sending" as const, undo_until: send_after };
}

export async function undoAction(store: Store, ws: Workspace, id: string, userId: string | null) {
  const a = await store.action(ws.id, id);
  if (!a) throw new ApprovalError("No such approval.", 404);
  if (a.status !== "sending") throw new ApprovalError(a.status === "done" ? "Too late: it already went out." : `This is ${a.status}.`, 409);
  // only while it's still waiting out the undo window: once the tick has picked it up, it's going out
  if (!(await store.moveAction(a.id, ["sending"], { status: "pending", send_after: null, decided_by: null, decided_at: null }))) throw new ApprovalError("Too late: it's already going out.", 409);
  await store.log(ws.id, { actor_type: "user", actor_id: userId, action: "undid", target: a.title });
  return { status: "pending" as const };
}

export async function rejectAction(store: Store, ws: Workspace, id: string, who: { userId: string | null; role: Role }) {
  const a = await store.action(ws.id, id);
  if (!a) throw new ApprovalError("No such approval.", 404);
  if (a.status !== "pending") throw new ApprovalError(`This was already ${a.status}.`, 409);
  if (who.role === "viewer") throw new ApprovalError("Viewers can't change approvals.", 403);
  if (!(await store.moveAction(a.id, ["pending"], { status: "rejected", decided_by: who.userId, decided_at: new Date().toISOString() }))) throw new ApprovalError("Someone just decided this one.", 409);
  await store.log(ws.id, { actor_type: "user", actor_id: who.userId, action: "discarded", target: a.title });
  const bot = (await store.bots(ws.id)).find((b) => b.id === a.bot_id);
  if (bot) await settleStatus(store, ws, bot);
  return { status: "rejected" as const };
}

// "Ask Ledger": the owner says what to change; the bot redrafts on the next tick and the old card is set aside.
export async function reviseAction(store: Store, ws: Workspace, id: string, note: string, userId: string | null) {
  const a = await store.action(ws.id, id);
  if (!a) throw new ApprovalError("No such approval.", 404);
  if (a.status !== "pending") throw new ApprovalError(`This was already ${a.status}.`, 409);
  if (!(await store.moveAction(a.id, ["pending"], { status: "revising" }))) throw new ApprovalError("Someone just decided this one.", 409);
  const thread = a.thread_id ?? (await store.room(ws.id)).id;
  const run = await store.createRun({
    workspace_id: ws.id, bot_id: a.bot_id, trigger: "revise", status: "queued", thread_id: thread,
    input: `The owner wants changes to your draft "${a.title}" before approving. Their note: "${note}". The draft was: ${JSON.stringify(a.payload)}. Prepare a corrected version with the same tool (it becomes a new card).`,
  });
  await store.log(ws.id, { actor_type: "user", actor_id: userId, action: "asked_for_changes", target: a.title, why: note });
  return { status: "revising" as const, run_id: run.id };
}

// Runs an approved action for real. Called once its undo window has passed (and the status was claimed).
export async function executeAction(store: Store, ws: Workspace, a: Action) {
  const tool = toolByName(a.tool);
  const bots = await store.bots(ws.id);
  const bot = bots.find((b) => b.id === a.bot_id);
  const room = await store.room(ws.id);
  if (!tool || !bot) {
    await store.updateAction(a.id, { status: "failed", error: "The bot or tool behind this card is gone." });
    return { status: "failed" as const };
  }
  const conns = await store.connections(ws.id);
  const ctx = { store, ws, bot, run: null, conns, usage: { searches: 0 }, emit: () => {} };
  const refused = tool.check?.(a.payload) ?? (tool.guard ? await tool.guard(ctx, a.payload) : null);
  const time = new Date().toLocaleTimeString("en-US", { timeZone: ws.timezone, hour: "numeric", minute: "2-digit" });
  try {
    if (refused) throw new Error(refused);
    const result = await tool.run(ctx, a.payload);
    await store.updateAction(a.id, { status: "done", result: result ?? { ok: true } });
    const line = `${a.tool === "create_event" ? "In your calendar" : a.risk === "money" ? "Done" : "Sent"}: ${a.title} · ${time}`;
    if (a.thread_id && a.thread_id !== room.id) await store.addMessage({ workspace_id: ws.id, thread_id: a.thread_id, role: "system", kind: "event", content: line, data: { action_id: a.id } });
    await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "bot", kind: "event", bot_id: bot.id, content: line, data: { action_id: a.id, result } });
    await settleStatus(store, ws, bot);
    return { status: "done" as const, result };
  } catch (e) {
    const msg = (e as Error).message;
    await store.updateAction(a.id, { status: "failed", error: msg });
    await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "bot", kind: "event", bot_id: bot.id, content: `Couldn't do it: ${a.title} (${msg})`, data: { action_id: a.id } });
    await settleStatus(store, ws, bot);
    return { status: "failed" as const, error: msg };
  }
}

export async function executeDue(store: Store, limit = 20) {
  const done: { id: string; status: string }[] = [];
  for (const a of await store.claimDueActions(limit)) {
    try {
      const ws = await store.workspace(a.workspace_id);
      done.push({ id: a.id, ...(await executeAction(store, ws, a)) });
    } catch (e) {
      await store.updateAction(a.id, { status: "failed", error: (e as Error).message }).catch(() => {});
      done.push({ id: a.id, status: "failed" });
    }
  }
  return done;
}

// ---- runs on demand ("Start Penny now", `nightshift ask`) ----
export async function runNow(store: Store, ws: Workspace, kind: BotKind, task?: string, onEvent?: (e: EngineEvent) => void, trigger: Run["trigger"] = "manual") {
  const bot = await store.bot(ws.id, kind);
  if (!bot) throw new Error(`There's no ${kind} on your team.`);
  const def = botDef(kind, ws.industry);
  const input = task || taskFor(def, bot.last_run_at);
  const room = await store.room(ws.id);
  const run = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger, input, thread_id: room.id });
  const result = await runBot(store, { ws, bot, run, input, onEvent });
  await store.updateBot(bot.id, { last_run_at: new Date().toISOString() });
  await reportInRoom(store, ws, bot, run, result);
  return { run, result };
}

async function reportInRoom(store: Store, ws: Workspace, bot: Bot, run: Run, result: RunResult) {
  if (!result.text) return;
  const room = await store.room(ws.id);
  const short = result.text.length > 4000 ? result.text.slice(0, 4000).replace(/\s+\S*$/, "") + "…" : result.text; // the room folds long reports
  await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "bot", bot_id: bot.id, run_id: run.id, content: short, data: { run_id: run.id, status: result.status, action_ids: result.actions } });
}

// A failed or partial run tried again later ("Retry at 4 AM").
export async function scheduleRetry(store: Store, ws: Workspace, runId: string, at: Date) {
  const r = await store.run(ws.id, runId);
  if (!r) throw new ApprovalError("No such run.", 404);
  await store.updateRun(r.id, { retry_at: at.toISOString() });
  return { retry_at: at.toISOString() };
}

// ---- the 5-minute tick (pg_cron calls /api/tick) ----
// Order: approved actions whose undo window passed, queued work (hand-offs, room jobs, revisions), retries,
// then bots whose shift is due, until the time budget is spent.
export async function tick(store: Store, opts: { now?: Date; deadlineMs?: number; retries?: () => Promise<Run[]> } = {}) {
  const now = opts.now ?? new Date();
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);
  const done: { bot: string; trigger: string; status: string }[] = [];
  const workspaces = new Map<string, Workspace>();
  const connsOf = new Map<string, Awaited<ReturnType<Store["connections"]>>>();
  const wsOf = async (id: string) => {
    if (!workspaces.has(id)) workspaces.set(id, await store.workspace(id));
    return workspaces.get(id)!;
  };
  // nothing runs until onboarding is done, or once the workspace is deleted, canceled or past its trial
  const active = (ws: Workspace) => !trialPaused(ws) && !!ws.onboarded_at && !ws.deleted_at && ws.plan !== "canceled" && !(ws.plan === "trial" && new Date(ws.trial_ends_at) < now);

  await store.reapStuck(new Date(now.getTime() - 15 * 60_000));
  await executeDue(store);

  // claimed one at a time, so a tick that runs out of time never leaves claimed work stuck "running"
  for (let n = 0; n < 10 && Date.now() < deadline; n++) {
    const [run] = await store.claimQueuedRuns(1);
    if (!run) break;
    try {
      const ws = await wsOf(run.workspace_id);
      const bot = (await store.bots(ws.id)).find((b) => b.id === run.bot_id);
      if (!bot?.enabled || !active(ws)) {
        await store.updateRun(run.id, { status: "stopped", error: bot?.enabled ? "Plan inactive" : "Bot is paused" });
        continue;
      }
      const history = run.thread_id ? historyToChat(await store.messages(run.thread_id, { limit: 20 }), bot.id) : [];
      const result = await runBot(store, { ws, bot, run, input: run.input, history });
      if (run.trigger === "revise") {
        const old = (await store.actions(ws.id, "revising")).filter((a) => a.bot_id === bot.id);
        for (const a of old) await store.updateAction(a.id, { status: result.actions.length ? "rejected" : "pending" }); // a new card replaces it
      }
      await reportInRoom(store, ws, bot, run, result);
      done.push({ bot: bot.kind, trigger: run.trigger, status: result.status });
    } catch (e) {
      await recordError("tick: queued run", e, { workspace_id: run.workspace_id, run_id: run.id });
      await store.updateRun(run.id, { status: "failed", error: (e as Error).message, finished_at: new Date().toISOString() }).catch(() => {});
    }
  }

  for (const run of (await opts.retries?.()) ?? []) {
    if (Date.now() > deadline) break;
    const ws = await wsOf(run.workspace_id);
    const bot = (await store.bots(ws.id)).find((b) => b.id === run.bot_id);
    if (!bot?.enabled || !active(ws)) continue;
    await store.updateRun(run.id, { retry_at: null });
    const again = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "retry", input: run.input, thread_id: run.thread_id });
    const result = await runBot(store, { ws, bot, run: again, input: `${run.input}\n\n(This is a retry of a run that didn't finish: ${run.summary ?? run.error ?? ""})` });
    await reportInRoom(store, ws, bot, again, result);
    done.push({ bot: bot.kind, trigger: "retry", status: result.status });
  }

  for (const bot of await store.dueBots(now)) {
    if (Date.now() > deadline) break;
    let def: BotTemplate;
    try { def = botDef(bot.kind); } catch {
      await store.updateBot(bot.id, { next_run_at: null }); // a template that's gone: off the schedule, not in the way
      continue;
    }
    const ws = await wsOf(bot.workspace_id);
    if (!active(ws)) continue;
    // a bot missing a connection it can't work without waits (shown as stuck) instead of spending a run on nothing
    if (!connsOf.has(ws.id)) connsOf.set(ws.id, await store.connections(ws.id));
    if (missingNeeds(def, connsOf.get(ws.id)!).length) {
      if (bot.status !== "blocked") await settleStatus(store, ws, bot);
      continue;
    }
    // Move the schedule on first, so an overlapping tick never runs the same bot twice.
    const next = nextRun(def.schedule, ws.timezone, now)?.toISOString() ?? null;
    await store.updateBot(bot.id, { next_run_at: next });
    bot.next_run_at = next;
    try {
      const input = taskFor(def, bot.last_run_at);
      const run = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "schedule", input });
      const result = await runBot(store, { ws, bot, run, input });
      // the "since" bookmark only moves on a finished run, so mail that came in during a failed one isn't skipped
      if (result.status === "done") await store.updateBot(bot.id, { last_run_at: now.toISOString() });
      // Frequent watchers (every 15 min) only speak up in the room when there's something to say.
      const frequent = def.schedule && "everyMinutes" in def.schedule && def.schedule.everyMinutes < 120;
      if (!frequent || result.actions.length || result.status !== "done") await reportInRoom(store, ws, bot, run, result);
      done.push({ bot: bot.kind, trigger: "schedule", status: result.status });
    } catch (e) {
      await recordError("tick: scheduled bot", e, { workspace_id: bot.workspace_id, bot: bot.kind }); // one bot's trouble doesn't stop the others
    }
  }
  return done;
}

// ---- hiring ----
export function hireRow(ws: Workspace, templateId: string, now = new Date()) {
  const def = botDef(templateId, ws.industry); // the cast's name for this business
  return { kind: def.id, name: def.name, approval: "ask" as const, next_run_at: nextRun(def.schedule, ws.timezone, now)?.toISOString() ?? null };
}

// The team a new workspace starts with: the core starters plus the industry's.
export function defaultBots(ws: Workspace, industry: Industry = (ws.industry as Industry) ?? "general", now = new Date()) {
  return starters(industry).map((t) => hireRow(ws, t.id, now));
}

// Bots suggested at onboarding, from the industry and "What eats your evenings?".
export const PAIN_POINTS: Record<string, string[]> = {
  "Answering email": ["inbox"],
  "Chasing invoices": ["invoices"],
  "Following up leads": ["leads"],
  "Researching suppliers": ["research"],
  "Keeping track of it all": ["brief"],
};
export function suggestedBots(industry: Industry, painPoints: string[]) {
  const ids = new Set(starters(industry).map((t) => t.id));
  for (const p of painPoints) for (const id of PAIN_POINTS[p] ?? []) ids.add(id);
  return TEMPLATES.filter((t) => ids.has(t.id));
}

export async function hire(store: Store, ws: Workspace, templateId: string, who: string | null) {
  const bot = await store.hireBot(ws.id, hireRow(ws, templateId));
  await store.log(ws.id, { actor_type: "user", actor_id: who, action: "hired", target: bot.name, data: { kind: templateId } });
  const room = await store.room(ws.id);
  await store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: "system", kind: "event", content: `${bot.name} (${botDef(templateId, ws.industry).role}) joined the team.` });
  return bot;
}

// ---- what the screens show ----
export async function officeView(store: Store, ws: Workspace) {
  const [bots, pending] = await Promise.all([store.bots(ws.id), store.actions(ws.id, "pending")]);
  const desks = bots.map((b) => {
    let t: ReturnType<typeof botDef> | null = null;
    try { t = botDef(b.kind, ws.industry); } catch {}
    const waiting = pending.filter((a) => a.bot_id === b.id).length;
    return {
      id: b.id, kind: b.kind, name: b.name, role: t?.role ?? "", title: t?.title ?? "", hue: t?.hue ?? 30, prop: t?.prop ?? "papers", chips: chipsFor(b.kind, ws.industry),
      status: b.enabled ? b.status : "paused", status_text: b.enabled ? b.status_text : "Paused", waiting, next_run_at: b.next_run_at, approval: b.approval, enabled: b.enabled,
    };
  });
  return {
    working: desks.filter((d) => d.status === "working").length,
    needs_you: desks.filter((d) => d.status === "needs_you" || d.waiting > 0).map((d) => d.name),
    blocked: desks.filter((d) => d.status === "blocked").map((d) => ({ name: d.name, why: d.status_text })),
    waiting_total: pending.length,
    team: teamLabel(ws.industry), // "dental front office"
    // the team's own names for the core jobs it has (copy that mentions a job nobody here does says "your team")
    names: Object.fromEntries(["inbox", "research", "invoices", "leads", "brief"].map((id) => [id, bots.find((b) => b.kind === id)?.name ?? null])),
    desks,
  };
}

// "Your desk": today's brief and everything waiting, grouped the way the cards are shown.
export async function deskView(store: Store, ws: Workspace) {
  const today = localDate(ws.timezone, new Date());
  const [brief, pending, bots] = await Promise.all([store.brief(ws.id, today), store.actions(ws.id, "pending"), store.bots(ws.id)]);
  const groups = new Map<string, Action[]>();
  for (const a of pending) {
    const key = a.group_key ? `${a.bot_id}:${a.group_key}` : a.id;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const name = (id: string) => bots.find((b) => b.id === id)?.name ?? "";
  return {
    date: today,
    brief,
    minutes: Math.max(1, Math.round(pending.length * 0.8)), // "5 things are waiting. About 4 minutes."
    queue: pending.map((a, i) => ({ n: i + 1, id: a.id, bot: name(a.bot_id), title: a.title, risk: a.risk, counterparty: a.counterparty, amount_cents: a.amount_cents, currency: a.currency })),
    groups: [...groups.values()].map((items) => ({ bot: name(items[0].bot_id), key: items[0].group_key, items })),
  };
}

// ---- the morning brief, delivered at the owner's time on their days ----
export function briefDue(ws: Workspace, now = new Date()) {
  const p = ws.brief_prefs;
  const local = new Intl.DateTimeFormat("en-US", { timeZone: ws.timezone, hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
  const v = Object.fromEntries(local.map((x) => [x.type, x.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v.weekday);
  return p.days.includes(day) && `${v.hour}:${v.minute}` >= p.time;
}

// When a business's industry is set or changes: core bots still wearing a stock name (the default team's or
// any industry's cast) take this industry's; a name the owner chose stays.
export async function renameToCast(store: Store, ws: Workspace) {
  const stock = (kind: string) => new Set([botDef(kind).name, ...Object.values(CASTS).map((c) => c?.bots[kind as keyof NonNullable<typeof c>["bots"]]?.name)].filter(Boolean));
  for (const b of await store.bots(ws.id)) {
    if (!(CORE_IDS as readonly string[]).includes(b.kind)) continue;
    const want = botDef(b.kind, ws.industry).name;
    if (b.name !== want && stock(b.kind).has(b.name)) await store.updateBot(b.id, { name: want });
  }
}
