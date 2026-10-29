import { stripeOpenInvoices, stripeSendInvoice, shopifyUnpaidOrders } from "../connectors/commerce";
import { calendarFor, mailFor } from "../connectors/mail";
import { readPage, webSearch } from "../connectors/search";
import { localDate } from "../engine/schedule";
import type { BotKind, Connection } from "../types";
import { connection, defineTool, hasNeed, num, obj, str, type Tool, type ToolCtx } from "../engine/tool";

const BOT_KINDS: BotKind[] = ["inbox", "research", "followup", "brief"];
const mail = (ctx: ToolCtx) => mailFor(ctx.store, ctx.conns);
const need = (ctx: ToolCtx, p: "stripe" | "shopify") => {
  const c = connection(ctx, p);
  if (!c) throw new Error(`${p === "stripe" ? "Stripe" : "Shopify"} isn't connected.`);
  return c;
};

// ---- the team ----
const postToRoom = defineTool<{ text: string }>({
  name: "post_to_room",
  description: "Post a short update in the bot room, the group chat the owner and the other bots read.",
  parameters: obj({ text: str("One or two sentences") }, ["text"]),
  risk: "quiet",
  async run(ctx, { text }) {
    const room = await ctx.store.room(ctx.ws.id);
    await ctx.store.addMessage({ workspace_id: ctx.ws.id, thread_id: room.id, role: "bot", bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, content: text, data: {} });
    ctx.emit({ type: "room", botId: ctx.bot.id, text });
    return { posted: true };
  },
});

const handOff = defineTool<{ bot: BotKind; task: string }>({
  name: "hand_off",
  description: "Give another bot a job. It runs on its own shortly and reports back in the bot room.",
  parameters: obj({ bot: str("Which bot", { enum: BOT_KINDS }), task: str("What it should do, with every detail it needs") }, ["bot", "task"]),
  risk: "quiet",
  async run(ctx, { bot, task }) {
    if (bot === ctx.bot.kind) return { error: "That's you." };
    const target = await ctx.store.bot(ctx.ws.id, bot);
    if (!target?.enabled) return { error: `The ${bot} bot is switched off.` };
    const room = await ctx.store.room(ctx.ws.id);
    await ctx.store.createRun({ workspace_id: ctx.ws.id, bot_id: target.id, trigger: "handoff", status: "queued", thread_id: room.id, input: `${ctx.bot.name} handed you this: ${task}` });
    await ctx.store.addMessage({ workspace_id: ctx.ws.id, thread_id: room.id, role: "bot", bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, content: `@${target.name} ${task}`, data: { handoff_to: target.id } });
    ctx.emit({ type: "room", botId: ctx.bot.id, text: `@${target.name} ${task}` });
    return { handed_off: true };
  },
});

const flagItem = defineTool<{ source: string; external_id: string; title: string; why: string; importance: number; url?: string }>({
  name: "flag",
  description: "Flag something the owner should look at (it shows on their desk and in the morning brief). Use the item's own id so it's only flagged once.",
  parameters: obj(
    {
      source: str("Where it came from", { enum: ["email", "stripe", "shopify", "calendar", "web"] }),
      external_id: str("The email, invoice, order or event id"),
      title: str("Short headline, e.g. 'Acme disputes invoice #1042'"),
      why: str("One sentence: why it matters"),
      importance: num("3 = needs the owner today, 2 = this week, 1 = good to know", { minimum: 1, maximum: 3 }),
      url: str("Link to open it, if there is one"),
    },
    ["source", "external_id", "title", "why", "importance"],
  ),
  risk: "quiet",
  async run(ctx, a) {
    const f = await ctx.store.upsertFlag(ctx.ws.id, { bot_id: ctx.bot.id, source: a.source, external_id: a.external_id, title: a.title, why: a.why, importance: Math.min(3, Math.max(1, a.importance)) as 1 | 2 | 3, url: a.url ?? null });
    return { flagged: f.id };
  },
});

const reviewActivity = defineTool<{ hours?: number }>({
  name: "review_activity",
  description: "Everything the team did recently: each bot's runs and summaries, open flags, and actions waiting for the owner.",
  parameters: obj({ hours: num("How far back, default 24") }),
  risk: "quiet",
  async run(ctx, { hours = 24 }) {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    const [bots, runs, flags, pending] = await Promise.all([ctx.store.bots(ctx.ws.id), ctx.store.runs(ctx.ws.id, { since, limit: 60 }), ctx.store.flags(ctx.ws.id, { open: true }), ctx.store.actions(ctx.ws.id, "pending")]);
    const name = (id: string) => bots.find((b) => b.id === id)?.name ?? "a bot";
    return {
      runs: runs.filter((r) => r.bot_id !== ctx.bot.id).map((r) => ({ bot: name(r.bot_id), when: r.created_at, status: r.status, summary: r.summary?.slice(0, 600) })),
      open_flags: flags.map((f) => ({ bot: name(f.bot_id), title: f.title, why: f.why, importance: f.importance, url: f.url })),
      waiting_for_owner: pending.map((a) => ({ bot: name(a.bot_id), title: a.title, since: a.created_at })),
    };
  },
});

const saveBrief = defineTool<{ markdown: string }>({
  name: "save_brief",
  description: "Save today's morning brief (Markdown). It's what the owner reads first.",
  parameters: obj({ markdown: str("The brief") }, ["markdown"]),
  risk: "quiet",
  async run(ctx, { markdown }) {
    await ctx.store.saveBrief(ctx.ws.id, localDate(ctx.ws.timezone, new Date()), markdown);
    return { saved: true };
  },
});

// ---- mail ----
const searchEmail = defineTool<{ query?: string; since?: string; max?: number; sent?: boolean }>({
  name: "search_email",
  description: "Search the mailbox. Returns sender, subject, date and a snippet for each email (use read_email for the full text).",
  parameters: obj({
    query: str("Search words, in the mailbox's own syntax (e.g. from:acme.com is:unread)"),
    since: str("Only mail after this ISO time"),
    max: num("How many, up to 50 (default 20)"),
    sent: { type: "boolean", description: "Search what the owner sent instead of what came in" },
  }),
  risk: "quiet",
  needs: ["mail"],
  run: (ctx, a) => mail(ctx).search(a),
});

const readEmail = defineTool<{ id: string }>({
  name: "read_email",
  description: "Read one email in full (quoted history removed).",
  parameters: obj({ id: str("The email id from search_email") }, ["id"]),
  risk: "quiet",
  needs: ["mail"],
  run: (ctx, { id }) => mail(ctx).read(id),
});

const labelEmail = defineTool<{ id: string; label: string }>({
  name: "label_email",
  description: "File an email under a Nightshift label (e.g. Important, Receipts, Newsletters, Waiting).",
  parameters: obj({ id: str("Email id"), label: str("One or two words") }, ["id", "label"]),
  risk: "quiet",
  needs: ["mail"],
  async run(ctx, { id, label }) {
    await mail(ctx).label(id, label);
    return { labelled: label };
  },
});

const draftReply = defineTool<{ id: string; body: string }>({
  name: "draft_reply",
  description: "Save a reply as a draft in the owner's mailbox, under the original email. Nothing is sent.",
  parameters: obj({ id: str("The email being replied to"), body: str("The reply, plain text, in the owner's voice, signed off as the owner") }, ["id", "body"]),
  risk: "quiet",
  needs: ["mail"],
  run: (ctx, { id, body }) => mail(ctx).draftReply(id, body),
});

const sendEmail = defineTool<{ to: string; subject: string; body: string; reply_to_id?: string }>({
  name: "send_email",
  description: "Send an email from the owner's mailbox. Give reply_to_id to answer an email in its thread.",
  parameters: obj({ to: str("Recipient address(es), comma separated"), subject: str("Subject"), body: str("Plain text body"), reply_to_id: str("The email this replies to") }, ["to", "subject", "body"]),
  risk: "outward",
  needs: ["mail"],
  title: (a) => `Send email to ${a.to}: "${a.subject}"`,
  run: (ctx, a) => mail(ctx).send({ to: a.to, subject: a.subject, body: a.body, replyToId: a.reply_to_id }),
});

// ---- calendar ----
const listEvents = defineTool<{ from: string; to: string }>({
  name: "list_events",
  description: "The owner's calendar between two times.",
  parameters: obj({ from: str("ISO start"), to: str("ISO end") }, ["from", "to"]),
  risk: "quiet",
  needs: ["calendar"],
  run: (ctx, { from, to }) => calendarFor(ctx.store, ctx.conns).events(from, to),
});

const createEvent = defineTool<{ title: string; start: string; end: string; attendees?: string[]; description?: string }>({
  name: "create_event",
  description: "Put an event in the owner's calendar and invite the attendees.",
  parameters: obj({ title: str("Title"), start: str("ISO start with offset"), end: str("ISO end with offset"), attendees: { type: "array", items: { type: "string" } }, description: str("Notes") }, ["title", "start", "end"]),
  risk: "outward",
  needs: ["calendar"],
  title: (a) => `Add "${a.title}" to the calendar${a.attendees?.length ? ` and invite ${a.attendees.join(", ")}` : ""}`,
  run: (ctx, a) => calendarFor(ctx.store, ctx.conns).create(a),
});

// ---- web ----
const searchWeb = defineTool<{ query: string; recent?: boolean }>({
  name: "web_search",
  description: "Search the web. Returns titles, links and the relevant text of the top pages.",
  parameters: obj({ query: str("What to search for"), recent: { type: "boolean", description: "Prefer recent news" } }, ["query"]),
  risk: "quiet",
  needs: ["search"],
  async run(ctx, { query, recent }) {
    ctx.usage.searches++;
    return webSearch(query, { recent });
  },
});

const readWebPage = defineTool<{ url: string }>({
  name: "read_page",
  description: "Read the full text of one web page.",
  parameters: obj({ url: str("http(s) link") }, ["url"]),
  risk: "quiet",
  needs: ["search"],
  async run(ctx, { url }) {
    ctx.usage.searches++;
    return readPage(url);
  },
});

// ---- money ----
const openInvoices = defineTool<Record<string, never>>({
  name: "list_open_invoices",
  description: "Unpaid Stripe invoices, with how many days overdue each one is.",
  parameters: obj({}),
  risk: "quiet",
  needs: ["stripe"],
  run: (ctx) => stripeOpenInvoices(need(ctx, "stripe")),
});

const remindInvoice = defineTool<{ invoice_id: string; customer?: string; amount?: string }>({
  name: "send_invoice_reminder",
  description: "Have Stripe email the customer their invoice again, with the pay link. Only for invoices where can_send is true.",
  parameters: obj({ invoice_id: str("Stripe invoice id (in_...)"), customer: str("Who, for the approval card"), amount: str("How much, for the approval card") }, ["invoice_id"]),
  risk: "outward",
  needs: ["stripe"],
  title: (a) => `Resend Stripe invoice${a.customer ? ` to ${a.customer}` : ""}${a.amount ? ` (${a.amount})` : ""}`,
  run: (ctx, { invoice_id }) => stripeSendInvoice(need(ctx, "stripe"), invoice_id),
});

const unpaidOrders = defineTool<Record<string, never>>({
  name: "list_unpaid_orders",
  description: "Open Shopify orders that haven't been paid, with how long each has been open.",
  parameters: obj({}),
  risk: "quiet",
  needs: ["shopify"],
  run: (ctx) => shopifyUnpaidOrders(need(ctx, "shopify")),
});

export const ALL_TOOLS: Tool[] = [
  postToRoom, handOff, flagItem, reviewActivity, saveBrief,
  searchEmail, readEmail, labelEmail, draftReply, sendEmail,
  listEvents, createEvent, searchWeb, readWebPage,
  openInvoices, remindInvoice, unpaidOrders,
];
export const toolByName = (name: string) => ALL_TOOLS.find((t) => t.name === name);

// The bot's tools that can actually work with what's connected.
export function toolsFor(names: string[], conns: Connection[]) {
  return ALL_TOOLS.filter((t) => names.includes(t.name) && (t.needs ?? []).every((n) => hasNeed(conns, n)));
}
