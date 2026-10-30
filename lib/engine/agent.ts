import { addUsage, chat, cost, noUsage, type ChatMessage, type Tier, type Usage } from "../deepseek";
import type { Store } from "../store";
import type { Bot, Connection, Message, Run, Workspace } from "../types";
import { botDef, type BotTemplate } from "../bots";
import { dailyBudget, trialPaused } from "../plans";
import { toolsFor } from "../tools";
import { localDate } from "./schedule";
import type { EngineEvent, Tool, ToolCtx } from "./tool";

const MAX_STEPS = 14;
const MAX_TOOL_RESULT = 12_000; // characters of a tool result the model sees
export const SEARCH_COST_USD = Number(process.env.SEARCH_COST_USD) || 0.008;

export interface RunResult {
  text: string;
  status: "done" | "partial" | "failed" | "stopped";
  actions: string[];
  usage: Usage;
  costUsd: number;
}

// What the business has connected right now, so a bot never guesses ("maybe the sync is broken"): it knows.
const KIND_LABEL: Record<string, string> = { email: "email", calendar: "calendar", accounting: "accounting", crm: "lead list / CRM", store: "online store" };
function connectedLine(conns: { provider: string; kinds: string[]; account: string; status: string }[]) {
  const ok = conns.filter((c) => c.status === "ok"), broken = conns.filter((c) => c.status !== "ok");
  const have = new Set(ok.flatMap((c) => c.kinds));
  const missing = Object.keys(KIND_LABEL).filter((k) => !have.has(k)).map((k) => KIND_LABEL[k]);
  return [
    ok.length ? `Connected right now: ${ok.map((c) => `${c.provider} (${c.kinds.map((k) => KIND_LABEL[k] ?? k).join(", ")}: ${c.account})`).join("; ")}.` : "Nothing is connected yet.",
    broken.length ? `Needs reconnecting: ${broken.map((c) => `${c.provider} (${c.account})`).join(", ")}.` : "",
    missing.length ? `Not connected: ${missing.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
}

// Who else is on the team, so the bot knows whom to hand work to.
function teamLine(bot: Bot, team: Bot[], industry: string) {
  const others = team.filter((b) => b.id !== bot.id).map((b) => {
    try {
      const t = botDef(b.kind, industry);
      return `${b.kind} (${b.name}, ${t.role}: ${t.title})`;
    } catch {
      return `${b.kind} (${b.name})`;
    }
  });
  return others.length ? `Your teammates, by id: ${others.join("; ")}. Use hand_off to give one of them work, and post_to_room for anything the team should see.` : "";
}

async function systemPrompt(store: Store, ws: Workspace, bot: Bot, tools: Tool[], team: Bot[]) {
  const def = botDef(bot.kind, ws.industry);
  const [memories, members, conns] = await Promise.all([store.memories(ws.id, { limit: 25 }), store.members(ws.id, { emails: false }), store.connectionList(ws.id)]);
  const owner = members.find((m) => m.role === "owner");
  const messages = tools.filter((t) => t.risk === "message").map((t) => t.name);
  const money = tools.filter((t) => t.risk === "money").map((t) => t.name);
  return [
    `You are ${bot.name}, the ${def.role} bot on the Nightshift team working for ${ws.name}. ${def.title}.`,
    ws.about ? `About the business: ${ws.about}` : "",
    `Today is ${localDate(ws.timezone, new Date())} (${ws.timezone}).${owner?.full_name ? ` The owner is ${owner.full_name}.` : ""}`,
    def.instructions,
    messages.length
      ? bot.approval === "ask"
        ? `Tools that contact people (${messages.join(", ")}) don't run right away: each call becomes a card the owner approves. Prepare them fully, then say what's waiting.`
        : `The owner lets you contact people on your own: ${messages.join(", ")} run immediately, so double-check recipients first.`
      : "",
    money.length ? `Money tools (${money.join(", ")}) always wait for the owner's approval, whatever else you're allowed to do.` : "",
    "If a tool says someone is on hold, on the do-not-contact list or was already contacted this week, respect it: don't try another way to reach them.",
    teamLine(bot, team, ws.industry),
    connectedLine(conns),
    memories.length ? `What the team knows (shared memory; add lasting facts with remember):\n${memories.map((m) => `- ${m.subject ? m.subject + ": " : ""}${m.fact}`).join("\n")}` : "",
    "The owner reads your chats and everything in the bot room: talk to them as \"you\" and never write \"the owner\", \"he\" or \"she\". Talk like a friendly, capable colleague, not a report. Teammates in the room are colleagues too: one or two plain sentences, no formal requests.",
    "Match what they said. If they're just saying hi, thanks or chatting, reply like a person in one short sentence (greet them back, and ask what they need or mention the one thing worth knowing, if there is one) and don't use any tools. Only do work when they ask for something.",
    "Do what the owner asks. Anything that goes out waits for their approval, so don't refuse, don't ask for proof and don't make them ask twice: make your best attempt, and if something is missing, use a sensible placeholder and mention it in one short line. Ask a question only when you can't do anything useful without the answer.",
    "Keep it short. In a chat, answer in one to three sentences, with a short list only when you're naming several things. In scheduled runs and room posts, open with one sentence, then at most 5 short '- ' bullets. No filler (\"nothing else touched\", \"standing offer\"), no advice nobody asked for, no restating what they just told you. Use **bold** only for a label at the start of a bullet. No tables, no headings, no sign-off.",
    "Never mention your tools or how you work inside (no tool names like find_contacts, no \"synced copy\", no \"my brief\"): say what you did and found in plain words. If something isn't connected, say so plainly and where to connect it (Settings → Connections), instead of guessing why.",
    "Never invent facts, emails, amounts or sources; if you don't know, say so. Never give medical, legal or financial advice to customers.",
    Object.keys(bot.settings ?? {}).length ? `Your settings from the owner: ${JSON.stringify(bot.settings)}` : "",
  ].filter(Boolean).join("\n\n");
}

export function historyToChat(messages: Message[], botId: string): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role === "bot" && m.bot_id === botId ? "assistant" : "user",
    content: m.role === "bot" && m.bot_id !== botId ? `[another bot] ${m.content}` : m.role === "system" ? `[note] ${m.content}` : m.content,
  }));
}

// The office status for a bot: what it's doing in a few words.
async function setStatus(ctx: Pick<ToolCtx, "store" | "bot" | "emit">, status: Bot["status"], text: string) {
  ctx.bot.status = status;
  ctx.bot.status_text = text;
  await ctx.store.updateBot(ctx.bot.id, { status, status_text: text });
  ctx.emit({ type: "status", botId: ctx.bot.id, status, text });
}
const doing: Record<string, string> = {
  search_email: "Reading new mail", read_email: "Reading an email", draft_reply: "Drafting a reply", send_email: "Writing an email",
  web_search: "Searching the web", read_page: "Reading a web page", check_page: "Checking a page",
  list_invoices: "Going through invoices", get_invoice: "Checking an invoice", list_payments: "Matching payments", create_credit_note: "Drafting a credit note",
  send_invoice_reminder: "Drafting a reminder", create_invoice: "Drafting an invoice", review_activity: "Catching up on the night", save_brief: "Writing the morning brief",
  list_stale_leads: "Looking for quiet leads", find_contacts: "Looking someone up", save_document: "Writing it up", list_events: "Checking the calendar", find_free_slots: "Finding open times",
  list_orders: "Going through orders", list_low_stock: "Checking stock",
};

// Runs one bot on one task: model call, tools, model call, ... until it answers, hits the step limit or the day's
// budget. Message tools on an 'ask' bot and every money tool become approval cards instead of running.
export async function runBot(
  store: Store,
  args: { ws: Workspace; bot: Bot; run: Run; input: string; history?: ChatMessage[]; onEvent?: (e: EngineEvent) => void; signal?: AbortSignal },
): Promise<RunResult> {
  const { ws, bot, run } = args;
  const emit = args.onEvent ?? (() => {});
  const def = botDef(bot.kind, ws.industry);
  const conns = await store.connections(ws.id);
  const tools = toolsFor(def.tools, conns);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const team = (await store.bots(ws.id)).filter((b) => b.enabled);
  const ctx: ToolCtx = { store, ws, bot, run, conns, usage: { searches: 0 }, emit };
  const day = localDate(ws.timezone, new Date());
  const started = Date.now();

  const messages: ChatMessage[] = [{ role: "system", content: await systemPrompt(store, ws, bot, tools, team) }, ...(args.history ?? []), { role: "user", content: args.input }];
  const schemas = tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
  let usage = noUsage(), spent = 0, text = "", status: RunResult["status"] = "done", tier: Tier = def.tier, usedTools = false;
  const actions: string[] = [];

  await store.updateRun(run.id, { status: "running", model: def.tier, started_at: new Date().toISOString() });
  await setStatus(ctx, "working", "Thinking it through");
  const overBudget = async () => (await store.usageToday(ws.id, day)) + spent >= dailyBudget(ws);

  try {
    if (trialPaused(ws)) {
      // free trials are switched off for now: say so plainly, without calling the model
      status = "stopped";
      text = "Free trials are paused for now, so I can't start yet. Pick a plan in Settings → Plan & billing and I'll get to work right away.";
      emit({ type: "stopped", reason: "budget" });
    }
    for (let step = 0; step < MAX_STEPS && !trialPaused(ws); step++) {
      if (await overBudget()) {
        status = "stopped";
        text ||= "Paused: today's budget is used up. I'll pick this up on my next shift.";
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
        const tool = byName.get(call.function.name);
        if (tool && doing[tool.name]) await setStatus(ctx, "working", doing[tool.name]);
        const result = await callTool(ctx, tool, call.function.name, call.function.arguments, actions);
        messages.push({ role: "tool", tool_call_id: call.id, content: clip(JSON.stringify(result)) });
      }
      if (step === MAX_STEPS - 1) {
        status = "partial";
        text = reply.content || "I ran out of steps before finishing. Here's where I got to; ask me to continue.";
      }
    }

    // Research-style bots gather with Flash, then Pro writes the report from everything they found.
    if (def.proWriteUp && usedTools && status === "done" && !(await overBudget())) {
      tier = "pro";
      await setStatus(ctx, "working", "Writing it up");
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

  const seconds = Math.round((Date.now() - started) / 1000);
  spent += ctx.usage.searches * SEARCH_COST_USD;
  await store.addUsage(ws.id, day, spent, ctx.usage.searches, def.category === "research" ? seconds : 0);
  await store.updateRun(run.id, {
    status, model: tier, tokens_hit: usage.hit, tokens_miss: usage.miss, tokens_out: usage.out, searches: ctx.usage.searches, seconds, cost_usd: spent,
    summary: text.slice(0, 4000), error: status === "failed" ? text : null, finished_at: new Date().toISOString(),
  });
  await settleStatus(store, ws, bot, emit, status === "failed" ? text : null);
  return { text, status, actions, usage, costUsd: spent };
}

// The connections a bot can't work without that aren't there yet (web search is built in).
export const missingNeeds = (def: Pick<BotTemplate, "needs">, conns: Pick<Connection, "kinds">[]) =>
  (def.needs as string[]).filter((n) => n !== "web" && !conns.some((c) => (c.kinds as string[]).includes(n)));

// After a run (or a decision): needs you if cards are waiting, blocked if a connection it needs is broken or
// missing, failed if the run failed, otherwise idle until its next shift.
export async function settleStatus(store: Store, ws: Workspace, bot: Bot, emit: (e: EngineEvent) => void = () => {}, failure: string | null = null) {
  const [pending, conns] = await Promise.all([store.actions(ws.id, "pending"), store.connections(ws.id)]);
  const mine = pending.filter((a) => a.bot_id === bot.id).length;
  const def = botDef(bot.kind);
  const broken = conns.find((c) => c.status !== "ok" && c.kinds.some((k) => (def.needs as string[]).includes(k)));
  const ctx = { store, bot, emit };
  if (!bot.enabled) return setStatus(ctx, "paused", "Paused");
  if (broken) {
    await store.updateBot(bot.id, { blocked_reason: `${broken.provider} connection lost` });
    return setStatus(ctx, "blocked", `Blocked: ${broken.provider} connection lost`);
  }
  const missing = missingNeeds(def, conns);
  if (missing.length) {
    await store.updateBot(bot.id, { blocked_reason: `needs ${missing.join(" and ")}` });
    return setStatus(ctx, "blocked", `Needs ${missing.join(" and ")} connected`);
  }
  if (bot.blocked_reason) await store.updateBot(bot.id, { blocked_reason: null });
  if (mine) return setStatus(ctx, "needs_you", `${mine} ${mine === 1 ? "draft" : "drafts"} for you`);
  if (failure) return setStatus(ctx, "failed", "Couldn't finish the last run");
  const next = bot.next_run_at ? new Date(bot.next_run_at) : null;
  const when = next ? next.toLocaleTimeString("en-US", { timeZone: ws.timezone, hour: "numeric", minute: "2-digit" }) : null;
  return setStatus(ctx, "idle", when ? `Idle · next check ${when}` : "Works when you ask");
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

  const wrong = tool.check?.(args);
  if (wrong) {
    ctx.emit({ type: "tool_result", name, ok: false });
    return { error: `${wrong} Fix the arguments and try again.` };
  }
  if (tool.guard) {
    const refused = await tool.guard(ctx, args);
    if (refused) {
      ctx.emit({ type: "tool_result", name, ok: false });
      return { refused };
    }
  }

  const needsApproval = tool.risk === "money" || (tool.risk === "message" && ctx.bot.approval === "ask");
  if (needsApproval) {
    const card = tool.card?.(args) ?? { title: `${ctx.bot.name}: ${name}` };
    const action = await ctx.store.createAction({
      workspace_id: ctx.ws.id, bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, thread_id: ctx.run?.thread_id ?? null,
      tool: name, risk: tool.risk === "money" ? "money" : "message", title: card.title, payload: args,
      counterparty: card.counterparty ?? null, amount_cents: card.amount_cents ?? null, currency: card.currency ?? null,
      group_key: typeof args.group === "string" && args.group ? args.group : null,
    });
    actions.push(action.id);
    ctx.emit({ type: "action", id: action.id, title: card.title, tool: name, risk: tool.risk });
    await ctx.store.log(ctx.ws.id, { actor_type: "bot", actor_id: ctx.bot.id, action: "drafted", target: card.title, data: { action_id: action.id } });
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
