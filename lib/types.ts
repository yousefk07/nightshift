// Shapes shared by the engine, the store and the API. They mirror supabase/migrations/0001_init.sql.

export type BotKind = "inbox" | "research" | "followup" | "brief";
export type Approval = "ask" | "auto";
export type Provider = "google" | "microsoft" | "stripe" | "shopify";
export type RunTrigger = "schedule" | "chat" | "room" | "manual" | "handoff";
export type RunStatus = "queued" | "running" | "done" | "failed" | "stopped";
export type ActionStatus = "pending" | "approved" | "rejected" | "done" | "failed";

export interface Workspace {
  id: string;
  name: string;
  timezone: string;
  about: string;
  daily_budget_usd: number;
}

export interface Bot {
  id: string;
  workspace_id: string;
  kind: BotKind;
  name: string;
  approval: Approval;
  enabled: boolean;
  settings: Record<string, unknown>;
  state: Record<string, unknown>;
  next_run_at: string | null;
  last_run_at: string | null;
}

export interface Connection {
  id: string;
  workspace_id: string;
  provider: Provider;
  account: string;
  secret: Record<string, unknown>; // decrypted by the store
  status: "ok" | "error";
}

export interface Thread {
  id: string;
  workspace_id: string;
  kind: "direct" | "room";
  bot_id: string | null;
  title: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: "owner" | "bot" | "system";
  bot_id: string | null;
  run_id: string | null;
  content: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Run {
  id: string;
  workspace_id: string;
  bot_id: string;
  thread_id: string | null;
  trigger: RunTrigger;
  status: RunStatus;
  input: string;
  model: string | null;
  steps: number;
  tokens_hit: number;
  tokens_miss: number;
  tokens_out: number;
  searches: number;
  cost_usd: number;
  summary: string | null;
  error: string | null;
  created_at: string;
}

export interface Action {
  id: string;
  workspace_id: string;
  bot_id: string;
  run_id: string | null;
  tool: string;
  title: string;
  payload: Record<string, unknown>;
  status: ActionStatus;
  result: unknown;
  error: string | null;
  created_at: string;
}

export interface Flag {
  id: string;
  bot_id: string;
  source: string;
  external_id: string;
  title: string;
  why: string;
  importance: 1 | 2 | 3;
  url: string | null;
  resolved_at: string | null;
  created_at: string;
}
