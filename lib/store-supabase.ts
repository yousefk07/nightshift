import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "./crypto";
import type { Store } from "./store";
import type { Action, Bot, Connection, Flag, Message, Run, Thread, Workspace } from "./types";

// The production Store. Runs on the server with the service key; every query is scoped to a workspace here,
// and row-level security keeps the browser's anon key out.

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
async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

const num = <T extends Record<string, any>>(row: T, keys: (keyof T)[]) => {
  for (const k of keys) if (row[k] != null) (row as any)[k] = Number(row[k]);
  return row;
};

export function supabaseStore(db = admin()): Store {
  const s: Store = {
    async workspace(id) {
      return num(await q<Workspace>(db.from("workspaces").select("*").eq("id", id).single()), ["daily_budget_usd"]);
    },
    async bots(ws) {
      return q<Bot[]>(db.from("bots").select("*").eq("workspace_id", ws).order("created_at"));
    },
    async bot(ws, kind) {
      return q<Bot | null>(db.from("bots").select("*").eq("workspace_id", ws).eq("kind", kind).maybeSingle());
    },
    async updateBot(id, patch) {
      await q(db.from("bots").update(patch).eq("id", id));
    },
    async dueBots(now) {
      return q<Bot[]>(db.from("bots").select("*").eq("enabled", true).not("next_run_at", "is", null).lte("next_run_at", now.toISOString()).order("next_run_at").limit(20));
    },

    async connections(ws) {
      const rows = await q<any[]>(db.from("connections").select("*").eq("workspace_id", ws));
      return rows.map(({ secret_enc, ...c }) => ({ ...c, secret: decrypt(secret_enc) }) as Connection);
    },
    async saveConnection(ws, provider, account, secret, scopes) {
      const row: Record<string, unknown> = { workspace_id: ws, provider, account, secret_enc: encrypt(secret), status: "ok", error: null, updated_at: new Date().toISOString() };
      if (scopes) row.scopes = scopes;
      await q(db.from("connections").upsert(row, { onConflict: "workspace_id,provider,account" }));
    },
    async markConnection(id, status, error) {
      await q(db.from("connections").update({ status, error: error ?? null, updated_at: new Date().toISOString() }).eq("id", id));
    },

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
      const row = await q<Message>(db.from("messages").insert(m).select().single());
      await db.from("threads").update({ updated_at: row.created_at }).eq("id", m.thread_id);
      return row;
    },
    async messages(threadId, limit = 50) {
      const rows = await q<Message[]>(db.from("messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(limit));
      return rows.reverse();
    },

    async createRun(r) {
      return num(await q<Run>(db.from("runs").insert({ status: "running", ...r }).select().single()), ["cost_usd"]);
    },
    async updateRun(id, patch) {
      await q(db.from("runs").update(patch).eq("id", id));
    },
    async claimQueuedRuns(limit) {
      return (await q<Run[]>(db.rpc("claim_queued_runs", { lim: limit }))).map((r) => num(r, ["cost_usd"]));
    },
    async runs(ws, opts = {}) {
      let query = db.from("runs").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(opts.limit ?? 50);
      if (opts.botId) query = query.eq("bot_id", opts.botId);
      if (opts.since) query = query.gte("created_at", opts.since);
      return (await q<Run[]>(query)).map((r) => num(r, ["cost_usd"]));
    },

    async createAction(a) {
      return q<Action>(db.from("actions").insert(a).select().single());
    },
    async action(ws, id) {
      return q<Action | null>(db.from("actions").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle());
    },
    async updateAction(id, patch) {
      await q(db.from("actions").update(patch).eq("id", id));
    },
    async actions(ws, status) {
      let query = db.from("actions").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100);
      if (status) query = query.eq("status", status);
      return q<Action[]>(query);
    },

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
      await q(db.from("flags").update({ resolved_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", id));
    },

    async saveBrief(ws, forDate, content) {
      await q(db.from("briefs").upsert({ workspace_id: ws, for_date: forDate, content }, { onConflict: "workspace_id,for_date" }));
    },
    async brief(ws, forDate) {
      const row = await q<{ content: string } | null>(db.from("briefs").select("content").eq("workspace_id", ws).eq("for_date", forDate).maybeSingle());
      return row?.content ?? null;
    },

    async usageToday(ws, day) {
      const row = await q<{ cost_usd: string } | null>(db.from("usage_days").select("cost_usd").eq("workspace_id", ws).eq("day", day).maybeSingle());
      return Number(row?.cost_usd ?? 0);
    },
    async addUsage(ws, day, costUsd, searches) {
      return Number(await q(db.rpc("add_usage", { p_workspace: ws, p_day: day, p_cost: costUsd, p_searches: searches })));
    },
  };
  return s;
}
