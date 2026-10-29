// Builds lib/showcase-data.json: a made-up dental practice ("Maple Street Dental") run through the app's real
// view code on the in-memory store, so the local showcase mode (lib/showcase.ts) shows true-to-life screens.
// Everything here is fictional. Run: npx tsx scripts/showcase.mts
import fs from "node:fs";
import { botDef } from "../lib/bots/index";
import { localDate } from "../lib/engine/schedule";
import { deskView, hireRow, officeView, renameToCast } from "../lib/engine/flows";
import { limits, planOf } from "../lib/plans";
import { memStore } from "../test/memstore";

const { store, ws, db } = memStore({
  industry: "dental_general",
  conns: [
    { provider: "google", kinds: ["email", "calendar"], account: "frontdesk@maplestreetdental.example", last_synced_at: new Date(Date.now() - 4 * 60_000).toISOString() },
    { provider: "quickbooks", kinds: ["accounting"], account: "Maple Street Dental", last_synced_at: new Date(Date.now() - 26 * 60_000).toISOString() },
  ],
});
Object.assign(ws, { name: "Maple Street Dental", about: "A family dental practice with three chairs.", timezone: "America/Toronto" });
await renameToCast(store, ws);
for (const id of ["research", "dental_general.postop"]) await store.hireBot(ws.id, hireRow(ws, id));
const bot = (kind: string) => db.bots.find((b) => b.kind === kind)!;
const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

// the team right now
const desk = bot("inbox"), billing = bot("invoices"), huddle = bot("brief"), recall = bot("dental_general.recall"), filler = bot("dental_general.cancel_fill"), research = bot("research"), postop = bot("dental_general.postop");
Object.assign(research, { status: "working", status_text: "Comparing clear-aligner prices nearby" });
Object.assign(recall, { status: "working", status_text: "Writing recall reminders for 14 patients" });
Object.assign(filler, { status: "idle", next_run_at: new Date(Date.now() + 50 * 60_000).toISOString() });
Object.assign(postop, { status: "idle", next_run_at: new Date(Date.now() + 3 * 3600_000).toISOString() });
Object.assign(huddle, { status: "idle" });

// cards waiting for the owner
const card = (b: typeof desk, a: { tool: string; risk: "message" | "money"; title: string; counterparty: string; payload: Record<string, unknown>; amount_cents?: number; group_key?: string }) =>
  store.createAction({ workspace_id: ws.id, bot_id: b.id, run_id: null, thread_id: null, currency: a.amount_cents ? "USD" : null, amount_cents: a.amount_cents ?? null, group_key: a.group_key ?? null, ...a });
const c1 = await card(desk, { tool: "send_email", risk: "message", title: 'Email to l.chen@example.com: "Re: Swelling after Tuesday\'s extraction"', counterparty: "Lena Chen",
  payload: { to: "l.chen@example.com", subject: "Re: Swelling after Tuesday's extraction", body: "Hi Lena,\n\nThanks for letting us know. Some swelling is normal for a few days, but we'd like to take a look. Dr. Shah has an opening today at 11:30. Does that work?\n\nIf the pain gets worse or you get a fever before then, call us right away at (416) 555-0142.\n\nMaple Street Dental" } });
const c2 = await card(desk, { tool: "send_email", risk: "message", title: 'Email to anika.patel@example.com: "Re: Moving Thursday\'s cleaning"', counterparty: "Anika Patel",
  payload: { to: "anika.patel@example.com", subject: "Re: Moving Thursday's cleaning", body: "Hi Anika,\n\nNo problem at all. We can move your cleaning to Monday at 4:15 or Wednesday at 9:00. Just reply with the one you'd like and it's yours.\n\nMaple Street Dental" }, group_key: "patel" });
const c3 = await card(billing, { tool: "create_credit_note", risk: "money", title: "Credit note → Anika Patel", counterparty: "Anika Patel", amount_cents: 8500,
  payload: { invoice_id: "2231", amount: 85, reason: "March cleaning was charged twice", customer: "Anika Patel" }, group_key: "patel" });
Object.assign(desk, { status: "needs_you", status_text: "2 drafts for you" });
Object.assign(billing, { status: "needs_you", status_text: "1 draft for you" });

// the bot room
const room = await store.room(ws.id);
const say = async (b: typeof desk | null, content: string, extra: { kind?: "text" | "handoff" | "event"; role?: "bot" | "owner" | "system"; data?: Record<string, unknown> } = {}) =>
  store.addMessage({ workspace_id: ws.id, thread_id: room.id, role: extra.role ?? "bot", kind: extra.kind ?? "text", bot_id: b?.id ?? null, content, data: extra.data ?? {} });
await say(null, `${postop.name} (${botDef(postop.kind, ws.industry).role}) joined the team.`, { role: "system", kind: "event" });
await say(desk, "**Overnight inbox:** 23 emails since 7 PM.\n- **Urgent:** Lena Chen has swelling two days after her extraction. I drafted a same-day slot at 11:30 and flagged it for you.\n- **Reschedule:** Anika Patel wants to move Thursday's cleaning; two times offered, waiting for your OK.\n- Filed 14 newsletters and supplier promos, 3 insurance remittances to **Billing**.");
await say(desk, `@${billing.name} Anika Patel says her March cleaning was charged twice (invoice 2231). Can you check before I reply?`, { kind: "handoff", data: { to_bot: billing.id, title: "Patel double charge" } });
await say(billing, "Checked QuickBooks: invoice 2231 was paid twice on Mar 12, once by card and once through her insurance. A **credit note for $85.00** is waiting for your OK, grouped with Mirela's reply so you can approve both at once.");
await say(null, `@${research.name} what are clear aligners going for around here?`, { role: "owner" });
await say(research, "On it. Comparing six practices within 10 km, their listed prices and what's included (refinements, retainers). I'll post a short table here.");
await say(recall, "**Recall list:** 14 patients are due for a cleaning this month and haven't booked. I'm drafting friendly reminders; they'll come to you as one batch to approve.");
await say(huddle, "Your morning huddle is ready: **3 things need you**, 11 patients in today's chairs, and one open slot at 2:40 that Gus is trying to fill.");

// a chat with the front desk, with one of its drafts inline
const thread = await store.directThread(ws.id, desk.id);
await store.addMessage({ workspace_id: ws.id, thread_id: thread.id, role: "owner", content: "Anything urgent from patients?", data: {} });
await store.addMessage({ workspace_id: ws.id, thread_id: thread.id, role: "bot", bot_id: desk.id, content: "One, and it's waiting for you:\n- **Lena Chen** has swelling two days after Tuesday's extraction. Dr. Shah is free at 11:30, so I drafted that offer, plus when to call us right away.\n\nEverything else can wait: a reschedule from Anika Patel (drafted), two new-patient enquiries (passed to Iris's list for tomorrow) and the usual supplier mail.", data: { action_ids: [c1.id] } });

// the morning brief
const today = localDate(ws.timezone, new Date());
await store.saveBrief(ws.id, today, { status: "final", headline: "Three things need you before 9.", content: "Three things need you before 9.\n\n**Needs you**\n- Lena Chen: swelling after an extraction, same-day slot drafted (11:30)\n- Anika Patel: reschedule + an $85 credit for a double charge, approve both together\n\n**Today's chairs**\n- 11 patients, first at 8:00; one open slot at 2:40 (Gus is on it)\n\n**What the team did**\n- Mirela sorted 23 emails; Rosa matched 3 insurance payments; Molly found 14 patients due for recall\n\n**Good to know**\n- Theo is pricing clear aligners in the area; results by noon" });

const office = await officeView(store, ws);
const deskData = await deskView(store, ws);
const me = {
  user: { id: "showcase-user", email: "jordan@maplestreetdental.example", role: "owner", full_name: "Jordan Lee", two_step: true },
  workspace: { ...ws, deleted_at: null },
  plan: { name: planOf(ws.plan), active: true, limits: limits(ws), trial_ends_at: ws.trial_ends_at },
  connections: db.conns.map(({ secret: _s, ...c }) => c),
  search: true, waiting: deskData.queue.length, open_flags: 1, unread_notifications: 2, spent_today_usd: 0.41,
};
const msgs = await store.messages(room.id, { limit: 150 });
const roomData = {
  thread_id: room.id, messages: msgs,
  in_the_room: db.bots.map((b) => ({ id: b.id, kind: b.kind, name: b.name, status: b.status, status_text: b.status_text, next_run_at: b.next_run_at })),
  holds: [{ id: "h1", label: "Anika Patel", scope: "reminders", reason: "Disputing a charge (invoice 2231)", by: billing.name, resume_at: null }],
};
const botData = Object.fromEntries(db.bots.map((b) => {
  const t = botDef(b.kind, ws.industry);
  return [b.kind, { bot: b, template: { name: t.name, role: t.role, title: t.title, hue: t.hue, prop: t.prop, category: t.category, needs: t.needs, schedule: t.schedule }, waiting: db.actions.filter((a) => a.bot_id === b.id && a.status === "pending"), runs: [
    { id: "r1", at: at(18), trigger: "schedule", status: "done", summary: b.id === desk.id ? "Sorted 23 new emails, flagged 1 urgent, drafted 2 replies." : "Checked what's new; nothing needed you.", cost_usd: 0.004, retry_at: null },
    { id: "r2", at: at(78), trigger: "schedule", status: "done", summary: "Quiet hour: 4 emails, all filed.", cost_usd: 0.002, retry_at: null },
  ] }];
}));
const used = (k: string) => db.bots.filter((b) => (botDef(b.kind).needs as string[]).includes(k)).map((b) => b.name);
const connections = {
  connections: db.conns.map(({ secret: _s, ...c }) => ({ ...c, health: "Healthy", used_by: [...new Set(c.kinds.flatMap(used))] })),
  missing: [{ kind: "crm", needed_by: used("crm") }].filter((m) => m.needed_by.length),
};
const billingData = {
  plan: { staff: false, id: "studio", name: "Studio", interval: "month", active: true, renews: new Date(Date.now() + 30 * 86_400_000).toISOString(), trial_ends_at: null, cancels: null, status: "active" },
  prices: { solo: { month: 39, year: 390 }, studio: { month: 89, year: 890 }, team: { month: 189, year: 1890 }, seat: 15 },
  meters: { research_hours: { used: 3.5, of: 100, resets: new Date(Date.now() + 30 * 86_400_000).toISOString() }, seats: { used: 1, of: 2 }, inboxes: { used: 1, of: 3 } },
  billing_email: "jordan@maplestreetdental.example",
  invoices: [{ date: new Date().toISOString(), description: "1 × Nightshift Studio (at $89.00 / month)", amount: 89, currency: "USD", status: "paid", pdf: null }],
  card: { brand: "visa", last4: "4242", exp: "12/30" },
};
const threadData = { thread, messages: await store.messages(thread.id, { limit: 200 }), actions: db.actions.filter((a) => a.id === c1.id) };
void c2; void c3;

fs.writeFileSync(new URL("../lib/showcase-data.json", import.meta.url), JSON.stringify({ me, office, desk: deskData, room: roomData, bots: botData, connections, billing: billingData, threads: { [desk.kind]: { threads: [thread] } }, thread: threadData }, null, 1));
console.log(`showcase: ${office.desks.length} desks (${office.desks.map((d) => d.name).join(", ")}), ${deskData.queue.length} cards, ${msgs.length} room messages`);
