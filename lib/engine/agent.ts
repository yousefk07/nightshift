import { addUsage, chat, cost, noUsage, type ChatMessage, type Tier, type Usage } from "../deepseek";
import type { Store } from "../store";
import type { Bot, Message, Run, Workspace } from "../types";
import { botDef } from "../bots";
import { toolsFor } from "../tools";
import { localDate } from "./schedule";
import type { EngineEvent, Tool, ToolCtx } from "./tool";

const MAX_STEPS = 14;
const MAX_TOOL_RESULT = 12_000; // characters of a tool result the model sees
export const SEARCH_COST_USD = Number(process.env.SEARCH_COST_USD) || 0.008;

export interface RunResult {
  text: string;
  status: "done" | "failed" | "stopped";
  actions: string[];
  usage: Usage;
  costUsd: number;
}

function systemPrompt(ws: Workspace, bot: Bot, tools: Tool[]) {
  const def = botDef(bot.kind);
  const now = new Date();
  const outward = tools.filter((t) => t.risk === "outward").map((t) => t.name);
  return [
    `You are ${bot.name}, one of the Nightshift bots working for ${ws.name}. ${def.role}`,
    ws.about ? `About the business: ${ws.about}` : "",
    `Today is ${localDate(ws.timezone, now)} (${ws.timezone}).`,
    def.instructions,
    outward.length
      ? bot.approval === "ask"
        ? `Tools that act outside Nightshift (${outward.join(", ")}) don't run right away: each call becomes a card the owner approves. Prepare them fully and carefully, then tell the owner what's waiting.`
        : `The owner lets you act on your own: tools like ${outward.join(", ")} run immediately, so double-check recipients and amounts first.`
      : "",
    "Other bots on the team: Inbox (email), Research (web research), Follow-up (unanswered threads, unpaid invoices and orders), Morning brief (the daily summary). Use hand_off to give one of them work, and post_to_room for anything the team should see.",
    "Be brief and concrete. Never invent facts, emails, amounts or sources; if you don't know, say so.",
    bot.settings && Object.keys(bot.settings).length ? `Your settings from the owner: ${JSON.stringify(bot.settings)}` : "",
  ].filter(Boolean).join("\n\n");
}

export function historyToChat(messages: Message[], botId: string): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role === "bot" && m.bot_id === botId ? "assistant" : "user",
    content: m.role === "bot" && m.bot_id !== botId ? `[another bot] ${m.content}` : m.content,
  }));
}

// Runs one bot on one task: model call, tools, model call, ... until it answers, hits the step limit or the day's
// budget. Outward tools on an 'ask' bot become pending actions instead of running.
export async function runBot(
  store: Store,
  args: { ws: Workspace; bot: Bot; run: Run; input: string; history?: ChatMessage[]; onEvent?: (e: EngineEvent) => void; signal?: AbortSignal },
): Promise<RunResult> {
  const { ws, bot, run } = args;
  const emit = args.onEvent ?? (() => {});
  const def = botDef(bot.kind);
  const conns = await store.connections(ws.id);
  const tools = toolsFor(def.tools, conns);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const ctx: ToolCtx = { store, ws, bot, run, conns, usage: { searches: 0 }, emit };
  const day = localDate(ws.timezone, new Date());

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(ws, bot, tools) }, ...(args.history ?? []), { role: "user", content: args.input }];
  const schemas = tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
  let usage = noUsage(), spent = 0, text = "", status: RunResult["status"] = "done", tier: Tier = def.tier, usedTools = false;
  const actions: string[] = [];

  await store.updateRun(run.id, { status: "running", model: def.tier, started_at: new Date().toISOString() } as Partial<Run>);
  const overBudget = async () => (await store.usageToday(ws.id, day)) + spent >= Number(ws.daily_budget_usd);

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (await overBudget()) {
        status = "stopped";
        text ||= "Paused: today's budget is used up. I'll pick this up tomorrow, or raise the daily budget in settings.";
        emit({ type: "stopped", reason: "budget" });
        break;
      }
      const reply = await chat(tier, messages, { tools: schemas, onText: (d) => emit({ type: "text", delta: d }), signal: args.signal });
      usage = addUsage(usage, reply.usage);
      spent += cost(tier, reply.usage);
      await store.updateRun(run.id, { steps: step + 1 });

      if (!reply.toolCalls.length) {
        text = reply.content;
        break;
      }
      usedTools = true;
      messages.push({ role: "assistant", content: reply.content || null, tool_calls: reply.toolCalls });
      for (const call of reply.toolCalls) {
        const result = await callTool(ctx, byName.get(call.function.name), call.function.name, call.function.arguments, actions);
        messages.push({ role: "tool", tool_call_id: call.id, content: clip(JSON.stringify(result)) });
      }
      if (step === MAX_STEPS - 1) text = reply.content || "I ran out of steps before finishing. Ask me to continue.";
    }

    // Research gathers with Flash, then Pro writes the report from everything it found.
    if (def.proWriteUp && usedTools && status === "done" && !(await overBudget())) {
      tier = "pro";
      messages.push({ role: "assistant", content: text || null }, { role: "user", content: def.proWriteUp });
      emit({ type: "text", delta: "\n\n" });
      const report = await chat("pro", messages, { onText: (d) => emit({ type: "text", delta: d }), maxTokens: 12000, signal: args.signal });
      usage = addUsage(usage, report.usage);
      spent += cost("pro", report.usage);
      text = report.content;
    }
  } catch (e) {
    status = "failed";
    text = `Something went wrong: ${(e as Error).message}`;
  }

  spent += ctx.usage.searches * SEARCH_COST_USD;
  await store.addUsage(ws.id, day, spent, ctx.usage.searches);
  await store.updateRun(run.id, {
    status,
    model: tier,
    tokens_hit: usage.hit,
    tokens_miss: usage.miss,
    tokens_out: usage.out,
    searches: ctx.usage.searches,
    cost_usd: spent,
    summary: text.slice(0, 4000),
    error: status === "failed" ? text : null,
    finished_at: new Date().toISOString(),
  } as Partial<Run>);
  return { text, status, actions, usage, costUsd: spent };
}

const clip = (s: string) => (s.length > MAX_TOOL_RESULT ? s.slice(0, MAX_TOOL_RESULT) + "… (cut)" : s);

async function callTool(ctx: ToolCtx, tool: Tool | undefined, name: string, rawArgs: string, actions: string[]) {
  if (!tool) return { error: `There is no tool called ${name}.` };
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { error: "The arguments weren't valid JSON. Try again." };
  }
  ctx.emit({ type: "tool", name, args });
  if (tool.risk === "outward" && ctx.bot.approval === "ask") {
    const title = tool.title?.(args) ?? `${ctx.bot.name}: ${name}`;
    const action = await ctx.store.createAction({ workspace_id: ctx.ws.id, bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, tool: name, title, payload: args });
    actions.push(action.id);
    ctx.emit({ type: "action", id: action.id, title, tool: name });
    const room = await ctx.store.room(ctx.ws.id);
    await ctx.store.addMessage({ workspace_id: ctx.ws.id, thread_id: room.id, role: "bot", bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, content: `Waiting for your OK: ${title}`, data: { action_id: action.id } });
    return { queued_for_approval: true, action_id: action.id, note: "The owner will approve, edit or reject this. Don't call it again." };
  }
  try {
    const result = await tool.run(ctx, args);
    ctx.emit({ type: "tool_result", name, ok: true });
    return result ?? { ok: true };
  } catch (e) {
    ctx.emit({ type: "tool_result", name, ok: false });
    return { error: (e as Error).message };
  }
}
