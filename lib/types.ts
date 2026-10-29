// Shapes shared by the engine, the store and the API. They mirror supabase/migrations/0001_init.sql.

export type BotKind = string; // a template id from lib/bots: "inbox", "dental_general.recall" ...
export type Approval = "ask" | "auto";
export type BotStatus = "idle" | "working" | "needs_you" | "blocked" | "failed" | "paused";
export type Provider = "google" | "microsoft" | "stripe" | "quickbooks" | "xero" | "freshbooks" | "shopify" | "hubspot" | "sheets";
export type ConnectionKind = "email" | "calendar" | "accounting" | "crm" | "store";
export type RunTrigger = "schedule" | "chat" | "room" | "manual" | "handoff" | "retry" | "revise";
export type RunStatus = "queued" | "running" | "done" | "partial" | "failed" | "stopped";
export type ActionStatus = "pending" | "sending" | "executing" | "done" | "rejected" | "undone" | "failed" | "revising";
export type Risk = "message" | "money";
export type Role = "owner" | "approver" | "approver_email" | "viewer";
export type Plan = "trial" | "solo" | "studio" | "team" | "canceled";

export interface Workspace {
  id: string;
  name: string;
  about: string;
  industry: string;
  team_size: string | null;
  pain_points: string[];
  timezone: string;
  shift_start: string; // "19:00:00"
  region: "us" | "eu";
  onboarding_step: number;
  onboarded_at: string | null;
  guardrails: { pause_on_dispute?: boolean; weekly_cap?: boolean };
  brief_prefs: { time: string; days: number[]; length: "short" | "standard" | "detailed"; channels: string[] };
  daily_budget_usd: number;
  plan: Plan;
  plan_interval: "month" | "year" | null;
  trial_ends_at: string;
  extra_seats: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  billing_email: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface Bot {
  id: string;
  workspace_id: string;
  kind: BotKind;
  name: string;
  approval: Approval;
  enabled: boolean;
  status: BotStatus;
  status_text: string;
  blocked_reason: string | null;
  settings: Record<string, unknown>;
  state: Record<string, unknown>;
  next_run_at: string | null;
  last_run_at: string | null;
}

export interface Connection {
  id: string;
  workspace_id: string;
  provider: Provider;
  kinds: ConnectionKind[];
  account: string;
  secret: Record<string, unknown>; // decrypted by the store
  status: "ok" | "needs_signin" | "error";
  error?: string | null;
  last_synced_at?: string | null;
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
  kind: "text" | "handoff" | "hold" | "approval" | "event";
  bot_id: string | null;
  user_id: string | null;
  run_id: string | null;
  content: string;
  data: Record<string, unknown>;
  mentions: string[];
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
  seconds: number;
  cost_usd: number;
  summary: string | null;
  error: string | null;
  retry_at: string | null;
  created_at: string;
}

export interface Action {
  id: string;
  workspace_id: string;
  bot_id: string;
  run_id: string | null;
  thread_id: string | null;
  tool: string;
  risk: Risk;
  title: string;
  counterparty: string | null;
  amount_cents: number | null;
  currency: string | null;
  payload: Record<string, unknown>;
  group_key: string | null;
  status: ActionStatus;
  send_after: string | null;
  result: unknown;
  error: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at: string;
}

export interface Flag {
  id: string;
  bot_id: string;
  kind: string;
  source: string;
  external_id: string;
  title: string;
  why: string;
  importance: 1 | 2 | 3;
  url: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Hold {
  id: string;
  subject: string;
  label: string;
  scope: "all" | "reminders" | "followups";
  reason: string;
  bot_id: string | null;
  user_id: string | null;
  resume_at: string | null;
  released_at: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  stage: string;
  tags: string[];
  notes: string;
  source: string;
  external_id: string | null;
  last_touch_at: string | null;
}

export interface Memory {
  id: string;
  subject: string;
  fact: string;
  bot_id: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Doc {
  id: string;
  bot_id: string | null;
  run_id: string | null;
  kind: string;
  title: string;
  body: string;
  created_at: string;
}

export interface Brief {
  for_date: string;
  status: "draft" | "final";
  headline: string;
  content: string;
  delivered_at: string | null;
  updated_at: string;
}

export interface Member {
  user_id: string;
  role: Role;
  notify: Record<string, unknown>;
  email?: string;
  full_name?: string;
}
