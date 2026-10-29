import { randomUUID } from "node:crypto";
import type { Store } from "../lib/store";
import type { Action, Bot, Connection, Flag, Message, Run, Thread, Workspace } from "../lib/types";
import { defaultBots } from "../lib/engine/flows";

// An in-memory Store for tests: same behaviour as the Supabase one, no database.
export function memStore(opts: { budget?: number; conns?: Partial<Connection>[] } = {}) {
  const now = () => new Date(Date.now() + seq++).toISOString(); // strictly increasing, so ordering is stable
  let seq = 0;
  const ws: Workspace = { id: randomUUID(), name: "Maple Leaf Dental", timezone: "America/Toronto", about: "A family dental clinic.", daily_budget_usd: opts.budget ?? 2 };
  const db = {
    bots: defaultBots(ws).map((b) => ({ ...b, id: randomUUID(), workspace_id: ws.id, enabled: true, settings: {}, state: {}, last_run_at: null }) as Bot),
    conns: (opts.conns ?? []).map((c) => ({ id: randomUUID(), workspace_id: ws.id, account: "owner@example.com", secret: {}, status: "ok", ...c }) as Connection),
    threads: [] as Thread[],
    messages: [] as Message[],
    runs: [] as Run[],
    actions: [] as Action[],
    flags: [] as Flag[],
    briefs: new Map<string, string>(),
    usage: new Map<string, number>(),
  };

  const store: Store = {
    workspace: async () => ws,
    bots: async () => db.bots,
    bot: async (_ws, kind) => db.bots.find((b) => b.kind === kind) ?? null,
    updateBot: async (id, patch) => void Object.assign(db.bots.find((b) => b.id === id)!, patch),
    dueBots: async (at) => db.bots.filter((b) => b.enabled && b.next_run_at && new Date(b.next_run_at) <= at),

    connections: async () => db.conns,
    saveConnection: async (_ws, provider, account, secret) => {
      const c = db.conns.find((x) => x.provider === provider && x.account === account);
      if (c) Object.assign(c, { secret, status: "ok" });
      else db.conns.push({ id: randomUUID(), workspace_id: ws.id, provider, account, secret, status: "ok" });
    },
    markConnection: async (id, status) => void Object.assign(db.conns.find((c) => c.id === id)!, { status }),

    room: async () => {
      let t = db.threads.find((x) => x.kind === "room");
      if (!t) db.threads.push((t = { id: randomUUID(), workspace_id: ws.id, kind: "room", bot_id: null, title: "Bot room" }));
      return t;
    },
    directThread: async (_ws, botId, threadId) => {
      if (threadId) return db.threads.find((t) => t.id === threadId)!;
      const t: Thread = { id: randomUUID(), workspace_id: ws.id, kind: "direct", bot_id: botId, title: "" };
      db.threads.push(t);
      return t;
    },
    threads: async (_ws, botId) => db.threads.filter((t) => t.bot_id === botId),
    addMessage: async (m) => {
      const row = { ...m, id: randomUUID(), created_at: now() } as Message;
      db.messages.push(row);
      return row;
    },
    messages: async (threadId, limit = 50) => db.messages.filter((m) => m.thread_id === threadId).slice(-limit),

    createRun: async (r) => {
      const run: Run = { id: randomUUID(), thread_id: null, input: "", status: "running", model: null, steps: 0, tokens_hit: 0, tokens_miss: 0, tokens_out: 0, searches: 0, cost_usd: 0, summary: null, error: null, created_at: now(), ...r };
      db.runs.push(run);
      return run;
    },
    updateRun: async (id, patch) => void Object.assign(db.runs.find((r) => r.id === id)!, patch),
    claimQueuedRuns: async (limit) => {
      const q = db.runs.filter((r) => r.status === "queued").slice(0, limit);
      q.forEach((r) => (r.status = "running"));
      return q;
    },
    runs: async (_ws, o = {}) => db.runs.filter((r) => (!o.botId || r.bot_id === o.botId) && (!o.since || r.created_at >= o.since)).reverse().slice(0, o.limit ?? 50),

    createAction: async (a) => {
      const row: Action = { ...a, id: randomUUID(), status: "pending", result: null, error: null, created_at: now() };
      db.actions.push(row);
      return row;
    },
    action: async (_ws, id) => db.actions.find((a) => a.id === id) ?? null,
    updateAction: async (id, patch) => void Object.assign(db.actions.find((a) => a.id === id)!, patch),
    actions: async (_ws, status) => db.actions.filter((a) => !status || a.status === status),

    upsertFlag: async (_ws, f) => {
      let row = db.flags.find((x) => x.source === f.source && x.external_id === f.external_id);
      if (row) Object.assign(row, f);
      else db.flags.push((row = { ...f, id: randomUUID(), resolved_at: null, created_at: now() }));
      return row;
    },
    flags: async (_ws, o = {}) => db.flags.filter((f) => !o.open || !f.resolved_at),
    resolveFlag: async (_ws, id) => void Object.assign(db.flags.find((f) => f.id === id)!, { resolved_at: now() }),

    saveBrief: async (_ws, d, content) => void db.briefs.set(d, content),
    brief: async (_ws, d) => db.briefs.get(d) ?? null,

    usageToday: async (_ws, day) => db.usage.get(day) ?? 0,
    addUsage: async (_ws, day, c) => {
      db.usage.set(day, (db.usage.get(day) ?? 0) + c);
      return db.usage.get(day)!;
    },
  };
  return { store, ws, db };
}
