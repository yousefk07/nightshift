import type { Action, Bot, BotKind, Connection, Flag, Message, Provider, Run, RunTrigger, Thread, Workspace } from "./types";

// Everything the engine reads or writes goes through a Store, so bots can be tested against an in-memory one
// (test/memstore.ts) and run in production against Supabase (lib/store-supabase.ts).
export interface Store {
  workspace(id: string): Promise<Workspace>;
  bots(ws: string): Promise<Bot[]>;
  bot(ws: string, kind: BotKind): Promise<Bot | null>;
  updateBot(id: string, patch: Partial<Pick<Bot, "approval" | "enabled" | "settings" | "state" | "next_run_at" | "last_run_at" | "name">>): Promise<void>;
  dueBots(now: Date): Promise<Bot[]>;

  connections(ws: string): Promise<Connection[]>;
  saveConnection(ws: string, provider: Provider, account: string, secret: Record<string, unknown>, scopes?: string[]): Promise<void>;
  markConnection(id: string, status: "ok" | "error", error?: string): Promise<void>;

  room(ws: string): Promise<Thread>;
  directThread(ws: string, botId: string, threadId?: string): Promise<Thread>;
  threads(ws: string, botId: string): Promise<Thread[]>;
  addMessage(m: Omit<Message, "id" | "created_at"> & { workspace_id: string }): Promise<Message>;
  messages(threadId: string, limit?: number): Promise<Message[]>;

  createRun(r: { workspace_id: string; bot_id: string; trigger: RunTrigger; thread_id?: string | null; input?: string; status?: "queued" | "running" }): Promise<Run>;
  updateRun(id: string, patch: Partial<Run>): Promise<void>;
  claimQueuedRuns(limit: number): Promise<Run[]>;
  runs(ws: string, opts?: { botId?: string; since?: string; limit?: number }): Promise<Run[]>;

  createAction(a: Omit<Action, "id" | "created_at" | "status" | "result" | "error">): Promise<Action>;
  action(ws: string, id: string): Promise<Action | null>;
  updateAction(id: string, patch: Partial<Action> & { decided_by?: string | null; decided_at?: string }): Promise<void>;
  actions(ws: string, status?: Action["status"]): Promise<Action[]>;

  upsertFlag(ws: string, f: Omit<Flag, "id" | "created_at" | "resolved_at">): Promise<Flag>;
  flags(ws: string, opts?: { open?: boolean; since?: string }): Promise<Flag[]>;
  resolveFlag(ws: string, id: string): Promise<void>;

  saveBrief(ws: string, forDate: string, content: string): Promise<void>;
  brief(ws: string, forDate: string): Promise<string | null>;

  usageToday(ws: string, day: string): Promise<number>;
  addUsage(ws: string, day: string, costUsd: number, searches: number): Promise<number>;
}
