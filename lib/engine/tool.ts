import type { Store } from "../store";
import type { Bot, Connection, Provider, Run, Workspace } from "../types";

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

// quiet = reading, flagging, labelling, drafting: always allowed.
// outward = sends, pays, posts or deletes something outside Nightshift: waits for the owner when the bot is on 'ask'.
export type Risk = "quiet" | "outward";

// What a tool needs connected: 'mail' is Google or Microsoft, 'calendar' likewise, 'search' is the search API key.
export type Need = Provider | "mail" | "calendar" | "search";

export interface Tool<A = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
  risk: Risk;
  needs?: Need[];
  title?: (args: A) => string; // how a queued action reads on the approval card
  run: (ctx: ToolCtx, args: A) => Promise<unknown>;
}

export type EngineEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; args: unknown }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "action"; id: string; title: string; tool: string }
  | { type: "room"; botId: string; text: string }
  | { type: "stopped"; reason: string };

export const defineTool = <A>(t: Tool<A>) => t as unknown as Tool;

export function connection(ctx: Pick<ToolCtx, "conns">, provider: Provider) {
  return ctx.conns.find((c) => c.provider === provider && c.status === "ok");
}

export function hasNeed(conns: Connection[], need: Need) {
  const has = (p: Provider) => conns.some((c) => c.provider === p && c.status === "ok");
  if (need === "mail" || need === "calendar") return has("google") || has("microsoft");
  if (need === "search") return !!process.env.TAVILY_API_KEY;
  return has(need);
}

// Small JSON-schema helpers so tool definitions stay readable.
export const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
export const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
export const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: "integer", description, ...extra });
