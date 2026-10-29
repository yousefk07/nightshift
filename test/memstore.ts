import { randomUUID } from "node:crypto";
import type { Store } from "../lib/store";
import type { Action, Bot, Brief, Connection, Contact, Doc, Flag, Hold, Memory, Message, Run, Thread, Workspace } from "../lib/types";
import { defaultBots } from "../lib/engine/flows";

// An in-memory Store for tests: same behaviour as the Supabase one, no database.
export function memStore(opts: { budget?: number; conns?: Partial<Connection>[]; industry?: string; guardrails?: Workspace["guardrails"] } = {}) {
  let seq = 0;
  const now = () => new Date(Date.now() + seq++).toISOString(); // strictly increasing, so ordering is stable
  const ws: Workspace = {
    id: randomUUID(), name: "Kiln & Co.", about: "A ceramics studio.", industry: opts.industry ?? "general", team_size: "2–5 people", pain_points: [],
    timezone: "America/Toronto", shift_start: "19:00:00", region: "us", onboarding_step: 5, onboarded_at: now(),
    guardrails: opts.guardrails ?? { pause_on_dispute: true, weekly_cap: true },
    brief_prefs: { time: "06:30", days: [1, 2, 3, 4, 5, 6], length: "short", channels: ["app", "email"] },
    daily_budget_usd: opts.budget ?? 2, plan: "trial", plan_interval: null, trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    extra_seats: 0, stripe_customer_id: null, stripe_subscription_id: null, current_period_end: null, billing_email: null, deleted_at: null, created_at: now(),
  };
  const newBot = (row: { kind: string; name: string; approval: "ask" | "auto"; next_run_at: string | null }): Bot => ({
    ...row, id: randomUUID(), workspace_id: ws.id, enabled: true, status: "idle", status_text: "", blocked_reason: null, settings: {}, state: {}, last_run_at: null,
  });
  const db = {
    bots: defaultBots(ws).map(newBot),
    conns: (opts.conns ?? []).map((c) => ({ id: randomUUID(), workspace_id: ws.id, account: "owner@example.com", kinds: ["email", "calendar"], secret: {}, status: "ok", ...c }) as Connection),
    threads: [] as Thread[],
    messages: [] as Message[],
    runs: [] as Run[],
    actions: [] as Action[],
    flags: [] as Flag[],
    holds: [] as Hold[],
    contacts: [] as Contact[],
    dnc: [] as { id: string; kind: "email" | "domain"; value: string }[],
    touches: [] as { email: string; at: string }[],
    memories: [] as Memory[],
    docs: [] as Doc[],
    briefs: new Map<string, Brief>(),
    activity: [] as any[],
    notifications: [] as any[],
    usage: new Map<string, { cost_usd: number; searches: number; research_seconds: number }>(),
    counters: new Map<string, number>(),
  };
  const lc = (s?: string | null) => (s ?? "").toLowerCase();

  const store: Store = {
    workspace: async () => ws,
    updateWorkspace: async (_id, patch) => void Object.assign(ws, patch),
    members: async () => [{ user_id: "owner-1", role: "owner", notify: {}, email: "sam@kilnandco.test", full_name: "Sam Avery" }],

    bots: async () => db.bots,
    bot: async (_ws, kind) => db.bots.find((b) => b.kind === kind) ?? null,
    hireBot: async (_ws, row) => {
      const existing = db.bots.find((b) => b.kind === row.kind);
      if (existing) return existing;
      const b = newBot(row);
      db.bots.push(b);
      return b;
    },
    fireBot: async (_ws, kind) => void (db.bots = db.bots.filter((b) => b.kind !== kind)),
    updateBot: async (id, patch) => void Object.assign(db.bots.find((b) => b.id === id)!, patch),
    dueBots: async (at) => db.bots.filter((b) => b.enabled && b.next_run_at && new Date(b.next_run_at) <= at),

    connections: async () => db.conns,
    saveConnection: async (_ws, provider, kinds, account, secret) => {
      const c = db.conns.find((x) => x.provider === provider && x.account === account);
      if (c) Object.assign(c, { secret, kinds, status: "ok" });
      else db.conns.push({ id: randomUUID(), workspace_id: ws.id, provider, kinds, account, secret, status: "ok" });
    },
    markConnection: async (id, { status, error }) => void Object.assign(db.conns.find((c) => c.id === id)!, { status, error }),

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
      const row: Message = { kind: "text", bot_id: null, user_id: null, run_id: null, data: {}, mentions: [], ...m, id: randomUUID(), created_at: now() };
      db.messages.push(row);
      return row;
    },
    messages: async (threadId, o = {}) => db.messages.filter((m) => m.thread_id === threadId && (!o.after || m.created_at > o.after)).slice(-(o.limit ?? 50)),

    createRun: async (r) => {
      const run: Run = { id: randomUUID(), thread_id: null, input: "", status: "running", model: null, steps: 0, tokens_hit: 0, tokens_miss: 0, tokens_out: 0, searches: 0, seconds: 0, cost_usd: 0, summary: null, error: null, retry_at: null, created_at: now(), ...r };
      db.runs.push(run);
      return run;
    },
    updateRun: async (id, patch) => void Object.assign(db.runs.find((r) => r.id === id)!, patch),
    run: async (_ws, id) => db.runs.find((r) => r.id === id) ?? null,
    claimQueuedRuns: async (limit) => {
      const q = db.runs.filter((r) => r.status === "queued").slice(0, limit);
      q.forEach((r) => (r.status = "running"));
      return q;
    },
    runs: async (_ws, o = {}) => db.runs.filter((r) => (!o.botId || r.bot_id === o.botId) && (!o.since || r.created_at >= o.since)).reverse().slice(0, o.limit ?? 50),

    createAction: async (a) => {
      const row: Action = { counterparty: null, amount_cents: null, currency: null, group_key: null, ...a, id: randomUUID(), status: "pending", send_after: null, result: null, error: null, created_at: now() };
      db.actions.push(row);
      return row;
    },
    action: async (_ws, id) => db.actions.find((a) => a.id === id) ?? null,
    updateAction: async (id, patch) => void Object.assign(db.actions.find((a) => a.id === id)!, patch),
    actions: async (_ws, status) => db.actions.filter((a) => !status || (Array.isArray(status) ? status.includes(a.status) : a.status === status)),
    claimDueActions: async (limit) => {
      const due = db.actions.filter((a) => a.status === "sending" && a.send_after && new Date(a.send_after) <= new Date()).slice(0, limit);
      due.forEach((a) => (a.status = "executing"));
      return due;
    },

    upsertFlag: async (_ws, f) => {
      let row = db.flags.find((x) => x.source === f.source && x.external_id === f.external_id);
      if (row) Object.assign(row, f);
      else db.flags.push((row = { ...f, id: randomUUID(), resolved_at: null, created_at: now() }));
      return row;
    },
    flags: async (_ws, o = {}) => db.flags.filter((f) => !o.open || !f.resolved_at),
    resolveFlag: async (_ws, id) => void Object.assign(db.flags.find((f) => f.id === id)!, { resolved_at: now() }),

    holds: async (_ws, o = {}) => db.holds.filter((h) => !o.open || (!h.released_at && (!h.resume_at || new Date(h.resume_at) > new Date()))),
    placeHold: async (_ws, h) => {
      const row: Hold = { ...h, subject: lc(h.subject), id: randomUUID(), released_at: null, created_at: now() };
      db.holds.push(row);
      return row;
    },
    releaseHold: async (_ws, id) => void Object.assign(db.holds.find((h) => h.id === id)!, { released_at: now() }),

    contacts: async (_ws, o = {}) =>
      db.contacts.filter((c) =>
        (!o.query || [c.name, c.email, c.company].some((v) => lc(v).includes(lc(o.query)))) &&
        (!o.stage || c.stage === o.stage) &&
        (!o.staleDays || !c.last_touch_at || new Date(c.last_touch_at).getTime() < Date.now() - o.staleDays * 86_400_000)),
    saveContact: async (_ws, c) => {
      let row = ("id" in c && c.id ? db.contacts.find((x) => x.id === c.id) : undefined) ?? (c.email ? db.contacts.find((x) => lc(x.email) === lc(c.email)) : undefined);
      if (row) Object.assign(row, c);
      else db.contacts.push((row = { id: randomUUID(), name: "", email: null, phone: null, company: null, stage: "lead", tags: [], notes: "", source: "nightshift", external_id: null, last_touch_at: null, ...c } as Contact));
      return row;
    },
    doNotContact: async () => db.dnc,
    setDoNotContact: async (_ws, entries) => void (db.dnc = entries.map((e) => ({ id: randomUUID(), kind: e.kind, value: lc(e.value) }))),
    touches: async (_ws, email, since) => db.touches.filter((t) => t.email === lc(email) && t.at >= since).length,
    addTouch: async (_ws, email) => {
      db.touches.push({ email: lc(email), at: now() });
      const c = db.contacts.find((x) => lc(x.email) === lc(email));
      if (c) c.last_touch_at = now();
    },

    memories: async (_ws, o = {}) => db.memories.filter((m) => !o.query || lc(m.subject + " " + m.fact).includes(lc(o.query))).slice(-(o.limit ?? 40)).reverse(),
    remember: async (_ws, m) => {
      const row: Memory = { bot_id: null, user_id: null, ...m, id: randomUUID(), created_at: now() };
      db.memories.push(row);
      return row;
    },
    forget: async (_ws, id) => void (db.memories = db.memories.filter((m) => m.id !== id)),

    saveDocument: async (_ws, d) => {
      const row: Doc = { ...d, id: randomUUID(), created_at: now() };
      db.docs.push(row);
      return row;
    },
    documents: async () => [...db.docs].reverse(),
    document: async (_ws, id) => db.docs.find((d) => d.id === id) ?? null,

    saveBrief: async (_ws, d, b) => void db.briefs.set(d, { for_date: d, status: "draft", headline: "", delivered_at: null, ...db.briefs.get(d), ...b, updated_at: now() }),
    brief: async (_ws, d) => db.briefs.get(d) ?? null,
    markBriefDelivered: async (_ws, d) => void Object.assign(db.briefs.get(d)!, { status: "final", delivered_at: now() }),

    log: async (_ws, e) => void db.activity.push({ id: db.activity.length + 1, target: "", why: "", data: {}, actor_id: null, ...e, at: now() }),
    activity: async () => [...db.activity].reverse(),
    notify: async (_ws, userId, n) => void db.notifications.push({ user_id: userId, ...n }),

    usageToday: async (_ws, day) => db.usage.get(day)?.cost_usd ?? 0,
    addUsage: async (_ws, day, c, s, r = 0) => {
      const u = db.usage.get(day) ?? { cost_usd: 0, searches: 0, research_seconds: 0 };
      u.cost_usd += c;
      u.searches += s;
      u.research_seconds += r;
      db.usage.set(day, u);
      return u.cost_usd;
    },
    usageSince: async () => [...db.usage.values()].reduce((a, u) => ({ cost_usd: a.cost_usd + u.cost_usd, searches: a.searches + u.searches, research_seconds: a.research_seconds + u.research_seconds }), { cost_usd: 0, searches: 0, research_seconds: 0 }),
    nextCounter: async (_ws, key) => {
      db.counters.set(key, (db.counters.get(key) ?? 0) + 1);
      return db.counters.get(key)!;
    },
  };
  return { store, ws, db };
}
