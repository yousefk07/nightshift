import type { Action, Bot, BotKind, Brief, Connection, ConnectionKind, Contact, Doc, Flag, Hold, Member, Memory, Message, Provider, Run, RunTrigger, Thread, Workspace } from "./types";

// Everything the engine reads or writes goes through a Store, so bots can be tested against an in-memory one
// (test/memstore.ts) and run in production against Supabase (lib/store-supabase.ts).
export interface Store {
  workspace(id: string): Promise<Workspace>;
  updateWorkspace(id: string, patch: Partial<Workspace>): Promise<void>;
  members(ws: string): Promise<Member[]>;

  bots(ws: string): Promise<Bot[]>;
  bot(ws: string, kind: BotKind): Promise<Bot | null>;
  hireBot(ws: string, row: { kind: string; name: string; approval: "ask" | "auto"; next_run_at: string | null }): Promise<Bot>;
  fireBot(ws: string, kind: BotKind): Promise<void>;
  updateBot(id: string, patch: Partial<Omit<Bot, "id" | "workspace_id" | "kind">>): Promise<void>;
  dueBots(now: Date): Promise<Bot[]>;

  connections(ws: string): Promise<Connection[]>;
  saveConnection(ws: string, provider: Provider, kinds: ConnectionKind[], account: string, secret: Record<string, unknown>, scopes?: string[]): Promise<void>;
  markConnection(id: string, patch: { status: Connection["status"]; error?: string | null; synced?: boolean }): Promise<void>;

  room(ws: string): Promise<Thread>;
  directThread(ws: string, botId: string, threadId?: string): Promise<Thread>;
  threads(ws: string, botId: string): Promise<Thread[]>;
  addMessage(m: { workspace_id: string; thread_id: string; role: Message["role"]; content: string; kind?: Message["kind"]; bot_id?: string | null; user_id?: string | null; run_id?: string | null; data?: Record<string, unknown>; mentions?: string[] }): Promise<Message>;
  messages(threadId: string, opts?: { limit?: number; after?: string }): Promise<Message[]>;

  createRun(r: { workspace_id: string; bot_id: string; trigger: RunTrigger; thread_id?: string | null; input?: string; status?: "queued" | "running" }): Promise<Run>;
  updateRun(id: string, patch: Partial<Run> & { started_at?: string; finished_at?: string }): Promise<void>;
  run(ws: string, id: string): Promise<Run | null>;
  claimQueuedRuns(limit: number): Promise<Run[]>;
  runs(ws: string, opts?: { botId?: string; since?: string; limit?: number }): Promise<Run[]>;

  createAction(a: Pick<Action, "workspace_id" | "bot_id" | "run_id" | "thread_id" | "tool" | "risk" | "title" | "payload"> & Partial<Pick<Action, "counterparty" | "amount_cents" | "currency" | "group_key">>): Promise<Action>;
  action(ws: string, id: string): Promise<Action | null>;
  updateAction(id: string, patch: Partial<Action>): Promise<void>;
  actions(ws: string, status?: Action["status"] | Action["status"][]): Promise<Action[]>;
  claimDueActions(limit: number): Promise<Action[]>;

  upsertFlag(ws: string, f: Omit<Flag, "id" | "created_at" | "resolved_at">): Promise<Flag>;
  flags(ws: string, opts?: { open?: boolean; since?: string }): Promise<Flag[]>;
  resolveFlag(ws: string, id: string): Promise<void>;

  holds(ws: string, opts?: { open?: boolean }): Promise<Hold[]>;
  placeHold(ws: string, h: Omit<Hold, "id" | "created_at" | "released_at">): Promise<Hold>;
  releaseHold(ws: string, id: string): Promise<void>;

  contacts(ws: string, opts?: { query?: string; staleDays?: number; stage?: string; limit?: number }): Promise<Contact[]>;
  saveContact(ws: string, c: Partial<Contact> & ({ email: string } | { id: string } | { name: string })): Promise<Contact>;
  doNotContact(ws: string): Promise<{ id: string; kind: "email" | "domain"; value: string }[]>;
  setDoNotContact(ws: string, entries: { kind: "email" | "domain"; value: string }[]): Promise<void>;
  touches(ws: string, email: string, since: string): Promise<number>;
  addTouch(ws: string, email: string, botId: string | null, channel?: string): Promise<void>;

  memories(ws: string, opts?: { query?: string; limit?: number }): Promise<Memory[]>;
  remember(ws: string, m: { subject: string; fact: string; bot_id?: string | null; user_id?: string | null }): Promise<Memory>;
  forget(ws: string, id: string): Promise<void>;

  saveDocument(ws: string, d: Omit<Doc, "id" | "created_at">): Promise<Doc>;
  documents(ws: string, opts?: { botId?: string; limit?: number }): Promise<Doc[]>;
  document(ws: string, id: string): Promise<Doc | null>;

  saveBrief(ws: string, forDate: string, b: { content: string; headline?: string; status?: "draft" | "final" }): Promise<void>;
  brief(ws: string, forDate: string): Promise<Brief | null>;
  markBriefDelivered(ws: string, forDate: string): Promise<void>;

  log(ws: string, e: { actor_type: "user" | "bot" | "system"; actor_id?: string | null; action: string; target?: string; why?: string; data?: Record<string, unknown> }): Promise<void>;
  activity(ws: string, opts?: { limit?: number; before?: string }): Promise<{ id: number; actor_type: string; actor_id: string | null; action: string; target: string; why: string; data: Record<string, unknown>; at: string }[]>;

  notify(ws: string, userId: string, n: { event: string; title: string; body?: string; url?: string; channels: string[] }): Promise<void>;

  usageToday(ws: string, day: string): Promise<number>;
  addUsage(ws: string, day: string, costUsd: number, searches: number, researchSeconds?: number): Promise<number>;
  usageSince(ws: string, fromDay: string): Promise<{ cost_usd: number; searches: number; research_seconds: number }>;
  nextCounter(ws: string, key: string): Promise<number>;
}
