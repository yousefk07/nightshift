import type { Store } from "../store";
import type { Bot, Connection, ConnectionKind, Provider, Run, Workspace } from "../types";

// What a tool can reach while it runs.
export interface ToolCtx {
  store: Store;
  ws: Workspace;
  bot: Bot;
  run: Run | null; // null when an approved action runs outside its original run
  conns: Connection[];
  usage: { searches: number };
  emit: (e: EngineEvent) => void;
}

// quiet   = reading, flagging, labelling, drafting, internal records: always runs.
// message = sends something to a person: waits for the owner when the bot is on 'ask'.
// money   = moves or commits money: always waits for the owner.
export type Risk = "quiet" | "message" | "money";

// What a tool needs connected: a kind of connection (any provider that offers it), or the server's search key.
export type Need = ConnectionKind | "search";

export interface Tool<A = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
  risk: Risk;
  needs?: Need[];
  // How a queued action reads on its approval card, and the card's summary fields.
  card?: (args: A) => { title: string; counterparty?: string; amount_cents?: number; currency?: string };
  // Checked before an outward tool is queued or run (do-not-contact, holds, the weekly cap). A string = refused, with why.
  guard?: (ctx: ToolCtx, args: A) => Promise<string | null>;
  run: (ctx: ToolCtx, args: A) => Promise<unknown>;
}

export type EngineEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; args: unknown }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "action"; id: string; title: string; tool: string; risk: Risk }
  | { type: "room"; botId: string; text: string }
  | { type: "status"; botId: string; status: string; text: string }
  | { type: "stopped"; reason: string };

export const defineTool = <A>(t: Tool<A>) => t as unknown as Tool;

export const live = (c: Connection) => c.status === "ok";
export function connectionFor(conns: Connection[], kind: ConnectionKind, prefer?: Provider[]) {
  const ok = conns.filter((c) => live(c) && c.kinds.includes(kind));
  for (const p of prefer ?? []) {
    const hit = ok.find((c) => c.provider === p);
    if (hit) return hit;
  }
  return ok[0];
}

export function hasNeed(conns: Connection[], need: Need) {
  if (need === "search") return !!process.env.TAVILY_API_KEY;
  return !!connectionFor(conns, need);
}

// Small JSON-schema helpers so tool definitions stay readable.
export const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
export const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
export const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: "integer", description, ...extra });
export const bool = (description: string) => ({ type: "boolean", description });
