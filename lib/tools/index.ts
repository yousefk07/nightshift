import { createHash } from "node:crypto";
import { botDef } from "../bots";
import { accountingFor } from "../connectors/accounting";
import { hubspotPush } from "../connectors/crm";
import { calendarFor, freeSlots, mailFor } from "../connectors/mail";
import { readPage, webSearch } from "../connectors/search";
import { listOrders, lowStock } from "../connectors/shopify";
import { localDate } from "../engine/schedule";
import { bool, connectionFor, defineTool, hasNeed, num, obj, str, type Tool, type ToolCtx } from "../engine/tool";
import { notifyEvent, type NotifyEvent } from "../notify";
import type { Connection } from "../types";
import { TOOL_NAMES } from "./names";

const mail = (ctx: ToolCtx) => mailFor(ctx.store, ctx.conns);
const books = (ctx: ToolCtx) => {
  const c = connectionFor(ctx.conns, "accounting", ["quickbooks", "xero", "freshbooks", "stripe"]);
  if (!c) throw new Error("No accounting system is connected.");
  return accountingFor(ctx.store, c);
};
const shop = (ctx: ToolCtx) => {
  const c = connectionFor(ctx.conns, "store");
  if (!c) throw new Error("No store is connected.");
  return c;
};
const emailsIn = (s: string) => (s.match(/[^\s<>,;"']+@[^\s<>,;"']+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase());
const domainOf = (email: string) => email.split("@")[1] ?? "";

// ---- outreach guard: the do-not-contact list, holds, and the weekly cap ----
// Holds match an email, its domain or a company name. The weekly cap counts outreach (follow-ups and reminders by
// any bot), not replies to someone who just wrote in.
export async function outreachGuard(ctx: ToolCtx, recipients: string[], opts: { kind: "reminders" | "followups" | "reply"; company?: string }) {
  const [dnc, holds] = await Promise.all([ctx.store.doNotContact(ctx.ws.id), ctx.store.holds(ctx.ws.id, { open: true })]);
  const company = opts.company?.toLowerCase().trim();
  const held = (subject: string) => holds.find((h) => h.subject === subject && (h.scope === "all" || h.scope === opts.kind));
  if (company) {
    const h = held(company);
    if (h) return `Outreach to ${h.label} is on hold: ${h.reason}.`;
  }
  for (const r of recipients) {
    if (dnc.some((d) => (d.kind === "email" && d.value === r) || (d.kind === "domain" && d.value === domainOf(r)))) return `${r} is on the do-not-contact list.`;
    const h = held(r) ?? held(domainOf(r));
    if (h) return `Outreach to ${h.label} is on hold: ${h.reason}.`;
    if (opts.kind !== "reply" && ctx.ws.guardrails.weekly_cap !== false) {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      if ((await ctx.store.touches(ctx.ws.id, r, since)) > 0) return `${r} was already contacted this week (one follow-up per contact per week).`;
    }
  }
  return null;
}
// Sales and money bots send outreach (capped); everyone else is replying to someone who wrote in.
const outreachKind = (ctx: ToolCtx): "followups" | "reply" => {
  try {
    return ["sales", "money"].includes(botDef(ctx.bot.kind).category) ? "followups" : "reply";
  } catch {
    return "reply";
  }
};

// ---------------- the team ----------------
const postToRoom = defineTool<{ text: string }>({
  name: "post_to_room",
  description: "Post a short update in the bot room, the group chat the owner and the other bots read.",
  parameters: obj({ text: str("One or two sentences") }, ["text"]),
  risk: "quiet",
  async run(ctx, { text }) {
    const room = await ctx.store.room(ctx.ws.id);
    await ctx.store.addMessage({ workspace_id: ctx.ws.id, thread_id: room.id, role: "bot", bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, content: text });
    ctx.emit({ type: "room", botId: ctx.bot.id, text });
    return { posted: true };
  },
});

const handOff = defineTool<{ bot: string; task: string; title?: string }>({
  name: "hand_off",
  description: "Give another bot on the team a job. It runs on its own shortly and reports back in the bot room.",
  parameters: obj({ bot: str("The teammate's id, from the team list in your instructions"), task: str("What it should do, with every detail it needs"), title: str("A few words for the room, e.g. 'Acme #1042 dispute'") }, ["bot", "task"]),
  risk: "quiet",
  async run(ctx, { bot, task, title }) {
    if (bot === ctx.bot.kind) return { error: "That's you." };
    const team = await ctx.store.bots(ctx.ws.id);
    const target = team.find((b) => b.kind === bot) ?? team.find((b) => b.name.toLowerCase() === String(bot).toLowerCase());
    if (!target) return { error: `There's no ${bot} on the team. Hired: ${team.map((b) => b.kind).join(", ")}.` };
    if (!target.enabled) return { error: `${target.name} is paused.` };
    const room = await ctx.store.room(ctx.ws.id);
    await ctx.store.createRun({ workspace_id: ctx.ws.id, bot_id: target.id, trigger: "handoff", status: "queued", thread_id: room.id, input: `${ctx.bot.name} handed you this: ${task}` });
    const text = `@${target.name} ${task}`;
    await ctx.store.addMessage({ workspace_id: ctx.ws.id, thread_id: room.id, role: "bot", kind: "handoff", bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, content: text, data: { from_bot: ctx.bot.id, to_bot: target.id, title: title ?? task.slice(0, 60) }, mentions: [target.id] });
    await ctx.store.log(ctx.ws.id, { actor_type: "bot", actor_id: ctx.bot.id, action: "handed_off", target: target.name, why: title ?? task.slice(0, 200) });
    ctx.emit({ type: "room", botId: ctx.bot.id, text });
    return { handed_off: target.name };
  },
});

const flagItem = defineTool<{ kind?: string; source: string; external_id: string; title: string; why: string; importance: number; url?: string }>({
  name: "flag",
  description: "Flag something the owner should look at (it shows on their desk and in the morning brief). Use the item's own id so it's only flagged once.",
  parameters: obj(
    {
      kind: str("What it is", { enum: ["dispute", "complaint", "time_sensitive", "lead_reply", "deadline", "info"] }),
      source: str("Where it came from", { enum: ["email", "accounting", "store", "calendar", "web", "crm"] }),
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
    const importance = Math.min(3, Math.max(1, Math.round(a.importance))) as 1 | 2 | 3;
    const f = await ctx.store.upsertFlag(ctx.ws.id, { bot_id: ctx.bot.id, kind: a.kind ?? "info", source: a.source, external_id: a.external_id, title: a.title, why: a.why, importance, url: a.url ?? null });
    return { flagged: f.id };
  },
});

const notifyOwner = defineTool<{ event: NotifyEvent; title: string; body: string }>({
  name: "notify_owner",
  description: "Alert the owner right away, on the channels they chose. Only for disputes, complaints, time-sensitive drafts and lead replies; everything else waits for the brief.",
  parameters: obj({ event: str("Why", { enum: ["dispute_or_complaint", "time_sensitive", "lead_reply"] }), title: str("Headline"), body: str("One or two sentences") }, ["event", "title", "body"]),
  risk: "quiet",
  async run(ctx, { event, title, body }) {
    const sent = await notifyEvent(ctx.store, ctx.ws, event, { title: `${ctx.bot.name}: ${title}`, body });
    return { notified: sent.length };
  },
});

const reviewActivity = defineTool<{ hours?: number }>({
  name: "review_activity",
  description: "Everything the team did recently: each bot's runs and summaries, open flags, holds, and actions waiting for the owner.",
  parameters: obj({ hours: num("How far back, default 24") }),
  risk: "quiet",
  async run(ctx, { hours = 24 }) {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    const [bots, runs, flags, pending, holds] = await Promise.all([ctx.store.bots(ctx.ws.id), ctx.store.runs(ctx.ws.id, { since, limit: 80 }), ctx.store.flags(ctx.ws.id, { open: true }), ctx.store.actions(ctx.ws.id, "pending"), ctx.store.holds(ctx.ws.id, { open: true })]);
    const name = (id: string | null) => bots.find((b) => b.id === id)?.name ?? "a bot";
    return {
      runs: runs.filter((r) => r.bot_id !== ctx.bot.id && r.summary).map((r) => ({ bot: name(r.bot_id), when: r.created_at, status: r.status, summary: r.summary?.slice(0, 500) })),
      open_flags: flags.map((f) => ({ bot: name(f.bot_id), kind: f.kind, title: f.title, why: f.why, importance: f.importance })),
      waiting_for_owner: pending.map((a) => ({ bot: name(a.bot_id), title: a.title, amount: a.amount_cents != null ? `${(a.amount_cents / 100).toFixed(2)} ${a.currency ?? ""}`.trim() : undefined })),
      holds: holds.map((h) => ({ who: h.label, scope: h.scope, reason: h.reason, by: name(h.bot_id) })),
    };
  },
});

const saveBrief = defineTool<{ headline: string; markdown: string }>({
  name: "save_brief",
  description: "Save today's morning brief. It stays a draft you can rewrite until it's delivered at the owner's brief time.",
  parameters: obj({ headline: str("The one-line summary, e.g. 'Quiet night. One thing worth your coffee:'"), markdown: str("The brief") }, ["headline", "markdown"]),
  risk: "quiet",
  async run(ctx, { headline, markdown }) {
    await ctx.store.saveBrief(ctx.ws.id, localDate(ctx.ws.timezone, new Date()), { headline, content: markdown });
    return { saved: true };
  },
});

const saveDocument = defineTool<{ kind: string; title: string; markdown: string }>({
  name: "save_document",
  description: "Save a finished deliverable for the owner (a report, quote, proposal, post, SOP, checklist or script). It appears in their documents.",
  parameters: obj({ kind: str("What it is", { enum: ["report", "quote", "proposal", "post", "sop", "checklist", "script", "letter", "other"] }), title: str("Title"), markdown: str("The document, in Markdown") }, ["kind", "title", "markdown"]),
  risk: "quiet",
  async run(ctx, { kind, title, markdown }) {
    const d = await ctx.store.saveDocument(ctx.ws.id, { bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, kind, title, body: markdown });
    return { document_id: d.id };
  },
});

const remember = defineTool<{ subject: string; fact: string }>({
  name: "remember",
  description: "Add a lasting fact to the team's shared memory (every bot can recall it): a client's habits, the owner's preferences, a supplier's terms. Not for one-off details.",
  parameters: obj({ subject: str("Who or what it's about, e.g. 'Acme Hotels'"), fact: str("One sentence, e.g. 'Pays every invoice on the 15th'") }, ["subject", "fact"]),
  risk: "quiet",
  async run(ctx, { subject, fact }) {
    const existing = await ctx.store.memories(ctx.ws.id, { query: subject, limit: 20 });
    if (existing.some((m) => m.fact.toLowerCase() === fact.toLowerCase())) return { already_known: true };
    const m = await ctx.store.remember(ctx.ws.id, { subject, fact, bot_id: ctx.bot.id });
    return { remembered: m.id };
  },
});

const recall = defineTool<{ query: string }>({
  name: "recall",
  description: "Search the team's shared memory for what's known about a person, company or topic.",
  parameters: obj({ query: str("A name or word") }, ["query"]),
  risk: "quiet",
  async run(ctx, { query }) {
    return (await ctx.store.memories(ctx.ws.id, { query, limit: 20 })).map((m) => ({ subject: m.subject, fact: m.fact, when: m.created_at }));
  },
});

const placeHold = defineTool<{ who: string; label: string; scope?: "all" | "reminders" | "followups"; reason: string; resume_on?: string }>({
  name: "place_hold",
  description: "Pause the team's outreach to someone (an email, a domain like acme.com, or a company name): every bot respects it until it's released or the resume date.",
  parameters: obj({ who: str("Email, domain or company name"), label: str("How to show it, e.g. 'Acme'"), scope: str("What to pause", { enum: ["all", "reminders", "followups"] }), reason: str("Why, in a few words"), resume_on: str("YYYY-MM-DD to resume automatically (optional)") }, ["who", "label", "reason"]),
  risk: "quiet",
  async run(ctx, { who, label, scope = "all", reason, resume_on }) {
    const h = await ctx.store.placeHold(ctx.ws.id, { subject: who.toLowerCase().trim(), label, scope, reason, bot_id: ctx.bot.id, user_id: null, resume_at: resume_on ? new Date(`${resume_on}T09:00:00Z`).toISOString() : null });
    const room = await ctx.store.room(ctx.ws.id);
    const what = scope === "reminders" ? "payment reminders" : scope === "followups" ? "follow-ups" : "all outreach";
    await ctx.store.addMessage({ workspace_id: ctx.ws.id, thread_id: room.id, role: "bot", kind: "hold", bot_id: ctx.bot.id, run_id: ctx.run?.id ?? null, content: `Paused ${what} to ${label}: ${reason}`, data: { hold_id: h.id, label, scope } });
    await ctx.store.log(ctx.ws.id, { actor_type: "bot", actor_id: ctx.bot.id, action: "placed_hold", target: label, why: reason });
    return { hold: h.id };
  },
});

const listHolds = defineTool<Record<string, never>>({
  name: "list_holds",
  description: "Holds in place: who the team must not contact right now, and why.",
  parameters: obj({}),
  risk: "quiet",
  async run(ctx) {
    return (await ctx.store.holds(ctx.ws.id, { open: true })).map((h) => ({ who: h.subject, label: h.label, scope: h.scope, reason: h.reason, until: h.resume_at }));
  },
});

// ---------------- email ----------------
const searchEmail = defineTool<{ query?: string; since?: string; max?: number; sent?: boolean }>({
  name: "search_email",
  description: "Search the mailbox. Returns sender, subject, date and a snippet for each email (use read_email for the full text).",
  parameters: obj({ query: str("Search words, in the mailbox's own syntax (e.g. from:acme.com is:unread)"), since: str("Only mail after this ISO time"), max: num("How many, up to 50 (default 20)"), sent: bool("Search what the owner sent instead of what came in") }),
  risk: "quiet",
  needs: ["email"],
  run: (ctx, a) => mail(ctx).search(a),
});

const readEmail = defineTool<{ id: string }>({
  name: "read_email",
  description: "Read one email in full (quoted history removed).",
  parameters: obj({ id: str("The email id from search_email") }, ["id"]),
  risk: "quiet",
  needs: ["email"],
  run: (ctx, { id }) => mail(ctx).read(id),
});

const labelEmail = defineTool<{ id: string; label: string }>({
  name: "label_email",
  description: "File an email under a Nightshift label (e.g. Important, Receipts, Newsletters, Waiting).",
  parameters: obj({ id: str("Email id"), label: str("One or two words") }, ["id", "label"]),
  risk: "quiet",
  needs: ["email"],
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
  needs: ["email"],
  run: (ctx, { id, body }) => mail(ctx).draftReply(id, body),
});

const sendEmail = defineTool<{ to: string; subject: string; body: string; reply_to_id?: string; company?: string; group?: string }>({
  name: "send_email",
  description: "Send an email from the owner's mailbox. Give reply_to_id to answer in the same thread. Checked against the do-not-contact list, holds and the weekly follow-up cap.",
  parameters: obj({ to: str("Recipient address(es), comma separated"), subject: str("Subject"), body: str("Plain text body"), reply_to_id: str("The email this replies to"), company: str("The recipient's company, if known"), group: str("A short key tying this to related cards (e.g. 'acme-1042') so the owner can approve them together") }, ["to", "subject", "body"]),
  risk: "message",
  needs: ["email"],
  card: (a) => ({ title: `Email to ${a.to}: "${a.subject}"`, counterparty: a.company ?? a.to }),
  guard: (ctx, a) => {
    const to = emailsIn(a.to);
    return to.length ? outreachGuard(ctx, to, { kind: outreachKind(ctx), company: a.company }) : Promise.resolve("There's no valid recipient address.");
  },
  async run(ctx, a) {
    const r = await mail(ctx).send({ to: a.to, subject: a.subject, body: a.body, replyToId: a.reply_to_id });
    for (const e of emailsIn(a.to)) await ctx.store.addTouch(ctx.ws.id, e, ctx.bot.id);
    await ctx.store.log(ctx.ws.id, { actor_type: "bot", actor_id: ctx.bot.id, action: "sent_email", target: a.to, why: a.subject });
    return r;
  },
});

// ---------------- calendar ----------------
const listEvents = defineTool<{ from: string; to: string }>({
  name: "list_events",
  description: "The owner's calendar between two times.",
  parameters: obj({ from: str("ISO start"), to: str("ISO end") }, ["from", "to"]),
  risk: "quiet",
  needs: ["calendar"],
  run: (ctx, { from, to }) => calendarFor(ctx.store, ctx.conns).events(from, to),
});

const findFreeSlots = defineTool<{ minutes: number; days?: number; count?: number }>({
  name: "find_free_slots",
  description: "Open times in the owner's working hours for a meeting of a given length, over the next few days.",
  parameters: obj({ minutes: num("Meeting length"), days: num("How many days ahead to look (default 7)"), count: num("How many options (default 3)") }, ["minutes"]),
  risk: "quiet",
  needs: ["calendar"],
  async run(ctx, { minutes, days = 7, count = 3 }) {
    const from = new Date(), to = new Date(Date.now() + days * 86_400_000);
    const events = await calendarFor(ctx.store, ctx.conns).events(from.toISOString(), to.toISOString());
    return freeSlots(events, { from, to, minutes, count, timeZone: ctx.ws.timezone, hours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] } });
  },
});

const createEvent = defineTool<{ title: string; start: string; end: string; attendees?: string[]; description?: string }>({
  name: "create_event",
  description: "Put an event in the owner's calendar and invite the attendees.",
  parameters: obj({ title: str("Title"), start: str("ISO start with offset"), end: str("ISO end with offset"), attendees: { type: "array", items: { type: "string" } }, description: str("Notes") }, ["title", "start", "end"]),
  risk: "message",
  needs: ["calendar"],
  card: (a) => ({ title: `Add "${a.title}" to the calendar${a.attendees?.length ? ` and invite ${a.attendees.join(", ")}` : ""}`, counterparty: a.attendees?.[0] }),
  guard: (ctx, a) => (a.attendees?.length ? outreachGuard(ctx, a.attendees.map((x) => x.toLowerCase()), { kind: "reply" }) : Promise.resolve(null)),
  run: (ctx, a) => calendarFor(ctx.store, ctx.conns).create(a),
});

// ---------------- contacts ----------------
const findContacts = defineTool<{ query?: string; stage?: string }>({
  name: "find_contacts",
  description: "Search contacts and leads (Nightshift's list, kept in sync with HubSpot and the lead sheet).",
  parameters: obj({ query: str("Name, email or company"), stage: str("Only this stage, e.g. lead, quoted, customer") }),
  risk: "quiet",
  run: (ctx, { query, stage }) => ctx.store.contacts(ctx.ws.id, { query, stage, limit: 30 }),
});

const saveContact = defineTool<{ email: string; name?: string; company?: string; phone?: string; stage?: string; tags?: string[]; note?: string }>({
  name: "save_contact",
  description: "Add or update a contact (by email): stage, tags, a note. Synced back to HubSpot when connected.",
  parameters: obj({ email: str("Their email"), name: str("Full name"), company: str("Company"), phone: str("Phone"), stage: str("lead, quoted, customer, lost ..."), tags: { type: "array", items: { type: "string" } }, note: str("A dated note to add") }, ["email"]),
  risk: "quiet",
  async run(ctx, a) {
    const existing = (await ctx.store.contacts(ctx.ws.id, { query: a.email, limit: 1 }))[0];
    const notes = a.note ? `${existing?.notes ? existing.notes + "\n" : ""}${localDate(ctx.ws.timezone, new Date())}: ${a.note}` : undefined;
    const c = await ctx.store.saveContact(ctx.ws.id, { email: a.email.toLowerCase(), ...(a.name && { name: a.name }), ...(a.company && { company: a.company }), ...(a.phone && { phone: a.phone }), ...(a.stage && { stage: a.stage }), ...(a.tags && { tags: a.tags }), ...(notes && { notes }) });
    const hs = connectionFor(ctx.conns, "crm", ["hubspot"]);
    if (hs?.provider === "hubspot") await hubspotPush(hs, c).catch(() => {});
    return { saved: c.id };
  },
});

const staleLeads = defineTool<{ days?: number; stage?: string }>({
  name: "list_stale_leads",
  description: "Leads (or another stage) with no touch in N days, oldest first.",
  parameters: obj({ days: num("Days without a touch (default 5)"), stage: str("Stage, default lead") }),
  risk: "quiet",
  async run(ctx, { days = 5, stage = "lead" }) {
    const rows = await ctx.store.contacts(ctx.ws.id, { staleDays: days, stage, limit: 50 });
    return rows.sort((a, b) => (a.last_touch_at ?? "").localeCompare(b.last_touch_at ?? "")).map((c) => ({ name: c.name, email: c.email, company: c.company, last_touch: c.last_touch_at, notes: c.notes.slice(-300) }));
  },
});

const logTouch = defineTool<{ email: string; channel?: string }>({
  name: "log_touch",
  description: "Record that a contact was reached outside email (a call, a text, in person). Counts toward the weekly cap.",
  parameters: obj({ email: str("Their email"), channel: str("call, text, visit ...") }, ["email"]),
  risk: "quiet",
  async run(ctx, { email, channel = "other" }) {
    await ctx.store.addTouch(ctx.ws.id, email, ctx.bot.id, channel);
    return { logged: true };
  },
});

// ---------------- accounting ----------------
const listInvoices = defineTool<{ status?: "open" | "overdue" | "paid" | "all" }>({
  name: "list_invoices",
  description: "Invoices from the accounting system, with amount due and days overdue. Default: open (including overdue).",
  parameters: obj({ status: str("Which", { enum: ["open", "overdue", "paid", "all"] }) }),
  risk: "quiet",
  needs: ["accounting"],
  run: (ctx, { status = "open" }) => books(ctx).listInvoices(status),
});

const getInvoice = defineTool<{ id: string }>({
  name: "get_invoice",
  description: "One invoice in full: its lines, total, amount due and link.",
  parameters: obj({ id: str("Invoice id from list_invoices") }, ["id"]),
  risk: "quiet",
  needs: ["accounting"],
  run: (ctx, { id }) => books(ctx).getInvoice(id),
});

const listPayments = defineTool<{ since: string }>({
  name: "list_payments",
  description: "Payments received since a date.",
  parameters: obj({ since: str("ISO date") }, ["since"]),
  risk: "quiet",
  needs: ["accounting"],
  run: (ctx, { since }) => books(ctx).listPayments(since),
});

const remindInvoice = defineTool<{ invoice_id: string; customer?: string; email?: string; amount?: number; currency?: string; group?: string }>({
  name: "send_invoice_reminder",
  description: "Have the accounting system email the customer their invoice again, with its pay link. Give their email and company so holds and the weekly cap are respected.",
  parameters: obj({ invoice_id: str("Invoice id"), customer: str("Who (company or name), for holds and the card"), email: str("Their email"), amount: { type: "number", description: "Amount due" }, currency: str("Currency"), group: str("Key tying related cards together") }, ["invoice_id", "customer"]),
  risk: "message",
  needs: ["accounting"],
  card: (a) => ({ title: `Payment reminder to ${a.customer ?? "the customer"}`, counterparty: a.customer, amount_cents: a.amount != null ? Math.round(a.amount * 100) : undefined, currency: a.currency }),
  guard: (ctx, a) => outreachGuard(ctx, a.email ? [a.email.toLowerCase()] : [], { kind: "reminders", company: a.customer }),
  async run(ctx, a) {
    const r = await books(ctx).sendReminder(a.invoice_id);
    if (a.email) await ctx.store.addTouch(ctx.ws.id, a.email, ctx.bot.id, "reminder");
    await ctx.store.log(ctx.ws.id, { actor_type: "bot", actor_id: ctx.bot.id, action: "sent_reminder", target: a.customer ?? a.invoice_id, why: `Invoice ${a.invoice_id}` });
    return r;
  },
});

const createInvoice = defineTool<{ customer: string; email?: string; lines: { description: string; amount: number; quantity?: number }[]; due_in_days?: number; currency?: string; memo?: string; group?: string }>({
  name: "create_invoice",
  description: "Create an invoice in the accounting system and send it to the customer. Money: always waits for the owner.",
  parameters: obj(
    {
      customer: str("Customer name"),
      email: str("Customer email"),
      lines: { type: "array", items: obj({ description: str("What"), amount: { type: "number", description: "Unit price" }, quantity: { type: "number" } }, ["description", "amount"]) },
      due_in_days: num("Days until due (default 14)"),
      currency: str("Currency code"),
      memo: str("Note on the invoice"),
      group: str("Key tying related cards together"),
    },
    ["customer", "lines"],
  ),
  risk: "money",
  needs: ["accounting"],
  card: (a) => ({ title: `Invoice to ${a.customer}`, counterparty: a.customer, amount_cents: Math.round(a.lines.reduce((s, l) => s + l.amount * (l.quantity ?? 1), 0) * 100), currency: a.currency }),
  async run(ctx, a) {
    const r = await books(ctx).createInvoice({ customer: a.customer, email: a.email, lines: a.lines, dueInDays: a.due_in_days, currency: a.currency, memo: a.memo });
    await ctx.store.log(ctx.ws.id, { actor_type: "bot", actor_id: ctx.bot.id, action: "created_invoice", target: a.customer, why: a.memo ?? "" });
    return r;
  },
});

const createCreditNote = defineTool<{ invoice_id: string; amount: number; reason: string; customer?: string; currency?: string; group?: string }>({
  name: "create_credit_note",
  description: "Issue a credit note against an invoice (e.g. a duplicate charge). Money: always waits for the owner.",
  parameters: obj({ invoice_id: str("The invoice"), amount: { type: "number", description: "How much to credit" }, reason: str("Why, as it should read on the note"), customer: str("Who, for the approval card"), currency: str("Currency"), group: str("Key tying related cards together") }, ["invoice_id", "amount", "reason"]),
  risk: "money",
  needs: ["accounting"],
  card: (a) => ({ title: `Credit note → ${a.customer ?? "invoice " + a.invoice_id}`, counterparty: a.customer, amount_cents: Math.round(a.amount * 100), currency: a.currency }),
  async run(ctx, a) {
    const n = await ctx.store.nextCounter(ctx.ws.id, "credit_note");
    const r = await books(ctx).createCreditNote({ invoiceId: a.invoice_id, amount: a.amount, reason: a.reason });
    const label = r.number ?? `CN-${String(n).padStart(4, "0")}`;
    await ctx.store.log(ctx.ws.id, { actor_type: "bot", actor_id: ctx.bot.id, action: "issued_credit_note", target: a.customer ?? a.invoice_id, why: a.reason, data: { number: label, amount: a.amount } });
    return { ...r, number: label };
  },
});

// ---------------- store ----------------
const listOrdersTool = defineTool<{ since?: string; filter?: "paid" | "unpaid" | "unfulfilled" | "any" }>({
  name: "list_orders",
  description: "Recent store orders, optionally only paid, unpaid or unfulfilled.",
  parameters: obj({ since: str("ISO date"), filter: str("Which", { enum: ["paid", "unpaid", "unfulfilled", "any"] }) }),
  risk: "quiet",
  needs: ["store"],
  run: (ctx, a) => listOrders(shop(ctx), a),
});

const unpaidOrders = defineTool<Record<string, never>>({
  name: "list_unpaid_orders",
  description: "Open store orders that haven't been paid, with how long each has been open.",
  parameters: obj({}),
  risk: "quiet",
  needs: ["store"],
  run: (ctx) => listOrders(shop(ctx), { filter: "unpaid" }),
});

const lowStockTool = defineTool<{ threshold?: number }>({
  name: "list_low_stock",
  description: "Products whose stock is at or below a level (default 5).",
  parameters: obj({ threshold: num("Stock level") }),
  risk: "quiet",
  needs: ["store"],
  run: (ctx, { threshold }) => lowStock(shop(ctx), threshold),
});

// ---------------- web ----------------
const searchWeb = defineTool<{ query: string; recent?: boolean }>({
  name: "web_search",
  description: "Search the web. Returns titles, links and the relevant text of the top pages.",
  parameters: obj({ query: str("What to search for"), recent: bool("Prefer recent news") }, ["query"]),
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

const checkPage = defineTool<{ url: string }>({
  name: "check_page",
  description: "Has this page changed since you last checked it? Returns whether it changed, and its current text when it did.",
  parameters: obj({ url: str("http(s) link") }, ["url"]),
  risk: "quiet",
  needs: ["search"],
  async run(ctx, { url }) {
    ctx.usage.searches++;
    const page = await readPage(url);
    const hash = createHash("sha256").update(page.text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 32);
    const pages = { ...((ctx.bot.state.pages as Record<string, { hash: string; at: string }>) ?? {}) };
    const before = pages[url];
    pages[url] = { hash, at: new Date().toISOString() };
    ctx.bot.state = { ...ctx.bot.state, pages };
    await ctx.store.updateBot(ctx.bot.id, { state: ctx.bot.state });
    if (!before) return { first_look: true, text: page.text.slice(0, 6000) };
    return before.hash === hash ? { changed: false, last_checked: before.at } : { changed: true, last_checked: before.at, text: page.text.slice(0, 8000) };
  },
});

export const ALL_TOOLS: Tool[] = [
  postToRoom, handOff, flagItem, notifyOwner, reviewActivity, saveBrief, saveDocument, remember, recall, placeHold, listHolds,
  searchEmail, readEmail, labelEmail, draftReply, sendEmail,
  listEvents, findFreeSlots, createEvent,
  findContacts, saveContact, staleLeads, logTouch,
  listInvoices, getInvoice, listPayments, remindInvoice, createInvoice, createCreditNote,
  listOrdersTool, unpaidOrders, lowStockTool,
  searchWeb, readWebPage, checkPage,
];
export const toolByName = (name: string) => ALL_TOOLS.find((t) => t.name === name);

// The bot's tools that can actually work with what's connected.
export function toolsFor(names: string[], conns: Connection[]) {
  return ALL_TOOLS.filter((t) => names.includes(t.name) && (t.needs ?? []).every((n) => hasNeed(conns, n)));
}

// Every name in lib/tools/names.ts has an implementation, with the approval class it declares.
export function checkToolNames() {
  const missing = Object.keys(TOOL_NAMES).filter((n) => !toolByName(n));
  const mismatched = ALL_TOOLS.filter((t) => !TOOL_NAMES[t.name as keyof typeof TOOL_NAMES]?.startsWith(t.risk));
  return { missing, mismatched: mismatched.map((t) => t.name) };
}
