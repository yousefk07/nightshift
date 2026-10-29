import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "./crypto";
import type { Store } from "./store";
import { exactly } from "./like";
import type { Action, Bot, Brief, Connection, Contact, Doc, Flag, Hold, Member, Memory, Message, Run, Thread, Workspace } from "./types";

// The production Store. Runs on the server with the service key; every query is scoped to a workspace here,
// and row-level security keeps the browser's anon key out of other workspaces.

let client: SupabaseClient | null = null;
export function admin() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

// Unwraps a Supabase reply, turning its error into a thrown one.
async function q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

const numbers = <T extends Record<string, any>>(row: T, keys: string[]) => {
  for (const k of keys) if (row?.[k] != null) (row as any)[k] = Number(row[k]);
  return row;
};
const ws_ = (w: Workspace) => numbers(w, ["daily_budget_usd"]);
const run_ = (r: Run) => numbers(r, ["cost_usd"]);
const act_ = (a: Action) => numbers(a, ["amount_cents"]);
const now = () => new Date().toISOString();
const like = (s: string) => `%${s.replace(/[%_,()]/g, " ").trim()}%`;

export function supabaseStore(db = admin()): Store {
  return {
    // ---- workspace and people ----
    async workspace(id) {
      return ws_(await q<Workspace>(db.from("workspaces").select("*").eq("id", id).single()));
    },
    async updateWorkspace(id, patch) {
      await q(db.from("workspaces").update(patch).eq("id", id));
    },
    async members(ws, opts = {}) {
      const rows = await q<(Member & { workspace_id: string })[]>(db.from("members").select("user_id, role, notify").eq("workspace_id", ws));
      const profiles = await q<{ user_id: string; full_name: string }[]>(db.from("profiles").select("user_id, full_name").in("user_id", rows.map((r) => r.user_id)));
      const name = (id: string) => profiles.find((p) => p.user_id === id)?.full_name ?? "";
      if (opts.emails === false) return rows.map((r) => ({ ...r, email: "", full_name: name(r.user_id) }));
      return Promise.all(rows.map(async (r) => {
        const { data } = await db.auth.admin.getUserById(r.user_id);
        return { ...r, email: data.user?.email ?? "", full_name: name(r.user_id) };
      }));
    },

    // ---- bots ----
    async bots(ws) {
      return q<Bot[]>(db.from("bots").select("*").eq("workspace_id", ws).order("created_at"));
    },
    async bot(ws, kind) {
      return q<Bot | null>(db.from("bots").select("*").eq("workspace_id", ws).eq("kind", kind).maybeSingle());
    },
    async hireBot(ws, row) {
      return q<Bot>(db.from("bots").upsert({ workspace_id: ws, ...row, enabled: true }, { onConflict: "workspace_id,kind" }).select().single());
    },
    async fireBot(ws, kind) {
      await q(db.from("bots").delete().eq("workspace_id", ws).eq("kind", kind));
    },
    async updateBot(id, patch) {
      await q(db.from("bots").update(patch).eq("id", id));
    },
    async dueBots(at) {
      return q<Bot[]>(db.from("bots").select("*").eq("enabled", true).not("next_run_at", "is", null).lte("next_run_at", at.toISOString()).order("next_run_at").limit(20));
    },

    // ---- connections ----
    async connectionList(ws) {
      return q<Omit<Connection, "secret">[]>(db.from("connections").select("id, workspace_id, provider, kinds, account, scopes, status, error, broken_at, last_synced_at, created_at, updated_at").eq("workspace_id", ws));
    },
    async connections(ws) {
      const rows = await q<any[]>(db.from("connections").select("*").eq("workspace_id", ws));
      return rows.map(({ secret_enc, ...c }) => ({ ...c, secret: decrypt(secret_enc) }) as Connection);
    },
    async saveConnection(ws, provider, kinds, account, secret, scopes) {
      const row: Record<string, unknown> = { workspace_id: ws, provider, kinds, account, secret_enc: encrypt(secret), status: "ok", error: null, broken_at: null, updated_at: now() };
      if (scopes) row.scopes = scopes;
      await q(db.from("connections").upsert(row, { onConflict: "workspace_id,provider,account" }));
    },
    async markConnection(id, { status, error, synced }) {
      const patch: Record<string, unknown> = { status, error: error ?? null, updated_at: now() };
      if (status === "ok") patch.broken_at = null;
      if (synced) patch.last_synced_at = now();
      if (status !== "ok") {
        const cur = await q<{ broken_at: string | null }>(db.from("connections").select("broken_at").eq("id", id).single());
        if (!cur.broken_at) patch.broken_at = now();
      }
      await q(db.from("connections").update(patch).eq("id", id));
    },

    // ---- threads and messages ----
    async room(ws) {
      const found = await q<Thread | null>(db.from("threads").select("*").eq("workspace_id", ws).eq("kind", "room").maybeSingle());
      if (found) return found;
      const { data } = await db.from("threads").insert({ workspace_id: ws, kind: "room", title: "Bot room" }).select().single();
      return data ?? (await q<Thread>(db.from("threads").select("*").eq("workspace_id", ws).eq("kind", "room").single())); // lost a race: use theirs
    },
    async directThread(ws, botId, threadId) {
      if (threadId) {
        const t = await q<Thread | null>(db.from("threads").select("*").eq("id", threadId).eq("workspace_id", ws).eq("bot_id", botId).maybeSingle());
        if (!t) throw new Error("No such conversation.");
        return t;
      }
      return q<Thread>(db.from("threads").insert({ workspace_id: ws, kind: "direct", bot_id: botId }).select().single());
    },
    async threads(ws, botId) {
      return q<Thread[]>(db.from("threads").select("*").eq("workspace_id", ws).eq("bot_id", botId).order("updated_at", { ascending: false }).limit(50));
    },
    async addMessage(m) {
      const row = await q<Message>(db.from("messages").insert({ kind: "text", data: {}, mentions: [], ...m }).select().single());
      await db.from("threads").update({ updated_at: row.created_at }).eq("id", m.thread_id);
      return row;
    },
    async messages(threadId, opts = {}) {
      let query = db.from("messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(opts.limit ?? 50);
      if (opts.after) query = query.gt("created_at", opts.after);
      return (await q<Message[]>(query)).reverse();
    },

    // ---- runs ----
    async createRun(r) {
      return run_(await q<Run>(db.from("runs").insert({ status: "running", ...r }).select().single()));
    },
    async updateRun(id, patch) {
      await q(db.from("runs").update(patch).eq("id", id));
    },
    async run(ws, id) {
      const r = await q<Run | null>(db.from("runs").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle());
      return r && run_(r);
    },
    async claimQueuedRuns(limit) {
      return (await q<Run[]>(db.rpc("claim_queued_runs", { lim: limit }))).map(run_);
    },
    async runs(ws, opts = {}) {
      let query = db.from("runs").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(opts.limit ?? 50);
      if (opts.botId) query = query.eq("bot_id", opts.botId);
      if (opts.since) query = query.gte("created_at", opts.since);
      return (await q<Run[]>(query)).map(run_);
    },

    // ---- approvals ----
    async createAction(a) {
      return act_(await q<Action>(db.from("actions").insert(a).select().single()));
    },
    async action(ws, id) {
      const a = await q<Action | null>(db.from("actions").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle());
      return a && act_(a);
    },
    async updateAction(id, patch) {
      await q(db.from("actions").update(patch).eq("id", id));
    },
    async moveAction(id, from, patch) {
      const rows = await q<{ id: string }[]>(db.from("actions").update(patch).eq("id", id).in("status", from).select("id"));
      return rows.length > 0;
    },
    async reapStuck(before) {
      const at = before.toISOString();
      const runs = await q<{ id: string }[]>(db.from("runs").update({ status: "failed", error: "Stopped partway (the shift ran out of time). It will run again on schedule.", finished_at: new Date().toISOString() }).eq("status", "running").lt("started_at", at).select("id"));
      // never retried automatically: a half-done send or invoice needs a person to look
      const actions = await q<{ id: string }[]>(db.from("actions").update({ status: "failed", error: "Interrupted while going out. Check whether it arrived before trying again." }).eq("status", "executing").lt("send_after", at).select("id"));
      return { runs: runs.length, actions: actions.length };
    },
    async actions(ws, status) {
      let query = db.from("actions").select("*").eq("workspace_id", ws).order("created_at").limit(200);
      if (Array.isArray(status)) query = query.in("status", status);
      else if (status) query = query.eq("status", status);
      return (await q<Action[]>(query)).map(act_);
    },
    async claimDueActions(limit) {
      return (await q<Action[]>(db.rpc("claim_due_actions", { lim: limit }))).map(act_);
    },

    // ---- flags and holds ----
    async upsertFlag(ws, f) {
      return q<Flag>(db.from("flags").upsert({ workspace_id: ws, ...f }, { onConflict: "workspace_id,source,external_id" }).select().single());
    },
    async flags(ws, opts = {}) {
      let query = db.from("flags").select("*").eq("workspace_id", ws).order("importance", { ascending: false }).order("created_at", { ascending: false }).limit(100);
      if (opts.open) query = query.is("resolved_at", null);
      if (opts.since) query = query.gte("created_at", opts.since);
      return q<Flag[]>(query);
    },
    async resolveFlag(ws, id) {
      await q(db.from("flags").update({ resolved_at: now() }).eq("workspace_id", ws).eq("id", id));
    },
    async holds(ws, opts = {}) {
      let query = db.from("holds").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(200);
      if (opts.open) query = query.is("released_at", null);
      const rows = await q<Hold[]>(query);
      return opts.open ? rows.filter((h) => !h.resume_at || new Date(h.resume_at) > new Date()) : rows;
    },
    async placeHold(ws, h) {
      return q<Hold>(db.from("holds").insert({ workspace_id: ws, ...h, subject: h.subject.toLowerCase() }).select().single());
    },
    async releaseHold(ws, id) {
      await q(db.from("holds").update({ released_at: now() }).eq("workspace_id", ws).eq("id", id));
    },

    // ---- contacts and outreach ----
    async contacts(ws, opts = {}) {
      let query = db.from("contacts").select("*").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(opts.limit ?? 50);
      if (opts.query) query = query.or(`name.ilike.${like(opts.query)},email.ilike.${like(opts.query)},company.ilike.${like(opts.query)}`);
      if (opts.stage) query = query.eq("stage", opts.stage);
      if (opts.staleDays) query = query.or(`last_touch_at.is.null,last_touch_at.lt.${new Date(Date.now() - opts.staleDays * 86_400_000).toISOString()}`);
      return q<Contact[]>(query);
    },
    async saveContact(ws, c) {
      const patch = { ...c, updated_at: now() } as Record<string, unknown>;
      if ("id" in c && c.id) return q<Contact>(db.from("contacts").update(patch).eq("workspace_id", ws).eq("id", c.id).select().single());
      if (c.email) {
        const existing = await q<Contact | null>(db.from("contacts").select("*").eq("workspace_id", ws).ilike("email", exactly(c.email)).limit(1).maybeSingle());
        if (existing) return q<Contact>(db.from("contacts").update(patch).eq("id", existing.id).select().single());
      }
      return q<Contact>(db.from("contacts").insert({ workspace_id: ws, ...patch }).select().single());
    },
    async doNotContact(ws) {
      return q(db.from("do_not_contact").select("id, kind, value").eq("workspace_id", ws));
    },
    async setDoNotContact(ws, entries) {
      await q(db.from("do_not_contact").delete().eq("workspace_id", ws));
      if (entries.length) await q(db.from("do_not_contact").insert(entries.map((e) => ({ workspace_id: ws, kind: e.kind, value: e.value.toLowerCase() }))));
    },
    async touches(ws, email, since) {
      const { count, error } = await db.from("touches").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("email", email.toLowerCase()).gte("at", since);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async addTouch(ws, email, botId, channel = "email") {
      await q(db.from("touches").insert({ workspace_id: ws, email: email.toLowerCase(), bot_id: botId, channel }));
      await db.from("contacts").update({ last_touch_at: now() }).eq("workspace_id", ws).ilike("email", exactly(email));
    },

    // ---- memory and documents ----
    async memories(ws, opts = {}) {
      let query = db.from("memories").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(opts.limit ?? 40);
      if (opts.query) query = query.or(`subject.ilike.${like(opts.query)},fact.ilike.${like(opts.query)}`);
      return q<Memory[]>(query);
    },
    async remember(ws, m) {
      return q<Memory>(db.from("memories").insert({ workspace_id: ws, ...m }).select().single());
    },
    async forget(ws, id) {
      await q(db.from("memories").delete().eq("workspace_id", ws).eq("id", id));
    },
    async saveDocument(ws, d) {
      return q<Doc>(db.from("documents").insert({ workspace_id: ws, ...d }).select().single());
    },
    async documents(ws, opts = {}) {
      let query = db.from("documents").select("id, bot_id, run_id, kind, title, created_at, body").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(opts.limit ?? 50);
      if (opts.botId) query = query.eq("bot_id", opts.botId);
      return q<Doc[]>(query);
    },
    async document(ws, id) {
      return q<Doc | null>(db.from("documents").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle());
    },

    // ---- briefs ----
    async saveBrief(ws, forDate, b) {
      await q(db.from("briefs").upsert({ workspace_id: ws, for_date: forDate, ...b, updated_at: now() }, { onConflict: "workspace_id,for_date" }));
    },
    async brief(ws, forDate) {
      return q<Brief | null>(db.from("briefs").select("for_date, status, headline, content, delivered_at, updated_at").eq("workspace_id", ws).eq("for_date", forDate).maybeSingle());
    },
    async markBriefDelivered(ws, forDate) {
      await q(db.from("briefs").update({ status: "final", delivered_at: now() }).eq("workspace_id", ws).eq("for_date", forDate));
    },

    // ---- activity and notifications ----
    async log(ws, e) {
      await q(db.from("activity").insert({ workspace_id: ws, target: "", why: "", data: {}, ...e }));
    },
    async activity(ws, opts = {}) {
      let query = db.from("activity").select("*").eq("workspace_id", ws).order("at", { ascending: false }).limit(opts.limit ?? 100);
      if (opts.before) query = query.lt("at", opts.before);
      return q(query);
    },
    async notify(ws, userId, n) {
      await q(db.from("notifications").insert({ workspace_id: ws, user_id: userId, ...n }));
    },

    // ---- usage and counters ----
    async usageToday(ws, day) {
      const row = await q<{ cost_usd: string } | null>(db.from("usage_days").select("cost_usd").eq("workspace_id", ws).eq("day", day).maybeSingle());
      return Number(row?.cost_usd ?? 0);
    },
    async addUsage(ws, day, costUsd, searches, researchSeconds = 0) {
      return Number(await q(db.rpc("add_usage", { p_workspace: ws, p_day: day, p_cost: costUsd, p_searches: searches, p_seconds: researchSeconds })));
    },
    async usageSince(ws, fromDay) {
      const rows = await q<{ cost_usd: string; searches: number; research_seconds: number }[]>(db.from("usage_days").select("cost_usd, searches, research_seconds").eq("workspace_id", ws).gte("day", fromDay));
      return rows.reduce((a, r) => ({ cost_usd: a.cost_usd + Number(r.cost_usd), searches: a.searches + r.searches, research_seconds: a.research_seconds + r.research_seconds }), { cost_usd: 0, searches: 0, research_seconds: 0 });
    },
    async nextCounter(ws, key) {
      return Number(await q(db.rpc("next_counter", { p_workspace: ws, p_key: key })));
    },
  };
}
