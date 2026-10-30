import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBot } from "../lib/engine/agent";
import {
  approveAction, canApprove, chatWithBot, deskView, executeDue, hire, mentions, officeView, postInRoom, rejectAction, reviseAction, suggestedBots, tick, undoAction, UNDO_SECONDS,
} from "../lib/engine/flows";
import { setDelivery } from "../lib/notify";
import { fakeDeepSeek } from "./fake-deepseek";
import { memStore } from "./memstore";

const google = { provider: "google" as const, kinds: ["email", "calendar"] as ("email" | "calendar")[], secret: { access_token: "ya29.test", refresh_token: "r", expires_at: Date.now() + 3_600_000 } };
const stripe = { provider: "stripe" as const, kinds: ["accounting"] as "accounting"[], account: "Stripe (test)", secret: { key: "sk_test_x" } };
const owner = { userId: "owner-1", role: "owner" as const };

// Answers the Gmail and Stripe calls the bots make, and records what was sent.
function services() {
  const sent: any[] = [], credits: any[] = [];
  const handler = (url: string, init?: RequestInit) => {
    if (url.includes("/messages/send")) return sent.push(JSON.parse(String(init?.body))), { id: `sent-${sent.length}` };
    if (url.includes("/messages/m1")) return { id: "m1", threadId: "t1", snippet: "Can you confirm Thursday?", payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Lena <lena@ortiz.test>" }, { name: "Subject", value: "Thursday" }, { name: "Message-ID", value: "<abc@ortiz.test>" }] } };
    if (url.includes("api.stripe.com/v1/credit_notes")) return credits.push(String(init?.body)), { id: "cn_1", number: "CN-0107" };
    if (url.includes("api.stripe.com/v1/invoices/in_1042")) return { id: "in_1042", number: "1042", customer_name: "Acme Hotels", customer_email: "ap@acme.test", total: 248000, amount_due: 0, currency: "usd", status: "paid", due_date: null, created: 1_790_000_000, lines: { data: [] } };
    throw new Error(`unexpected ${url}`);
  };
  return { sent, credits, handler };
}
const sendTurn = (to = "lena@ortiz.test") => ({ tools: [{ name: "send_email", args: { to, subject: "Thursday", body: "Thursday works.", reply_to_id: "m1" } }] });
const later = () => vi.setSystemTime(new Date(Date.now() + (UNDO_SECONDS + 1) * 1000));

beforeEach(() => {
  vi.useRealTimers();
  delete process.env.TAVILY_API_KEY;
  setDelivery({ email: async () => {}, push: async () => 0 });
});

describe("approvals", () => {
  it("an 'ask' bot turns emails into cards; approving sends after the undo window", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    const s = services();
    fakeDeepSeek([sendTurn(), { text: "Your reply to Lena is waiting." }], s.handler);

    const r = await chatWithBot(store, ws, "inbox", "Tell Lena Thursday works");
    expect(r.result.actions).toHaveLength(1);
    expect(s.sent).toHaveLength(0); // nothing left the building
    const card = db.actions[0];
    expect(card).toMatchObject({ tool: "send_email", risk: "message", status: "pending", title: 'Email to lena@ortiz.test: "Thursday"' });
    expect(db.bots.find((b) => b.kind === "inbox")).toMatchObject({ status: "needs_you", status_text: "1 draft for you" });

    const a = await approveAction(store, ws, card.id, owner);
    expect(a.status).toBe("sending");
    expect(await executeDue(store)).toEqual([]); // still inside the undo window
    expect(s.sent).toHaveLength(0);
    later();
    expect(await executeDue(store)).toEqual([{ id: card.id, status: "done", result: { id: "sent-1" } }]);
    expect(s.sent[0].threadId).toBe("t1");
    expect(db.messages.some((m) => m.thread_id === r.thread.id && m.content.startsWith("Sent: Email to lena"))).toBe(true);
    await expect(approveAction(store, ws, card.id, owner)).rejects.toThrow(/already done/);
  });

  it("undo inside the window puts the card back; discard never sends", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    const s = services();
    fakeDeepSeek([sendTurn(), { text: "Queued." }, sendTurn("marco@ruiz.test"), { text: "Queued." }], s.handler);
    await chatWithBot(store, ws, "inbox", "reply to Lena");
    await chatWithBot(store, ws, "inbox", "reply to Marco");
    const [a, b] = db.actions;
    await approveAction(store, ws, a.id, owner, { ...a.payload, body: "Thursday at 3 works." });
    await undoAction(store, ws, a.id, "owner-1");
    expect(db.actions[0].status).toBe("pending");
    expect(db.actions[0].payload.body).toBe("Thursday at 3 works."); // the edit is kept
    await rejectAction(store, ws, b.id, owner);
    later();
    await executeDue(store);
    expect(s.sent).toHaveLength(0);
    expect(db.actions.map((x) => x.status)).toEqual(["pending", "rejected"]);
  });

  it("once the tick has picked a card up, undo can't bring it back (no double send); double decisions are refused", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    const s = services();
    fakeDeepSeek([sendTurn(), { text: "Queued." }], s.handler);
    await chatWithBot(store, ws, "inbox", "reply to Lena");
    const [a] = db.actions;
    await approveAction(store, ws, a.id, owner);
    await expect(approveAction(store, ws, a.id, owner)).rejects.toThrow(/already sending/);
    db.actions[0].status = "executing"; // the tick claimed it a moment ago
    await expect(undoAction(store, ws, a.id, "owner-1")).rejects.toThrow(/going out|executing/);
    expect(db.actions[0].status).toBe("executing");
  });

  it("a tick keeps going past a bot whose template is gone, and reaps work a crashed tick left behind", async () => {
    const { store, db } = memStore({ conns: [google, stripe] });
    const past = new Date(Date.now() - 60_000).toISOString();
    db.bots[0].kind = "no_such_template";
    db.bots[0].next_run_at = past;
    db.bots[1].next_run_at = past;
    db.runs.push({ id: "stuck", workspace_id: db.bots[1].workspace_id, bot_id: db.bots[1].id, trigger: "schedule", status: "running", input: "", started_at: new Date(Date.now() - 3_600_000).toISOString() } as never);
    fakeDeepSeek([{ text: "All quiet." }, { text: "All quiet." }, { text: "All quiet." }]);
    const done = await tick(store);
    expect(done.some((d) => d.trigger === "schedule")).toBe(true); // the next bot still ran
    expect(db.bots[0].next_run_at).toBeNull(); // the broken one is off the schedule
    expect(db.runs.find((r) => r.id === "stuck")?.status).toBe("failed");
  });

  it("'auto' bots send email on their own, but money still waits", async () => {
    const { store, ws, db } = memStore({ conns: [google, stripe] });
    db.bots.find((b) => b.kind === "inbox")!.approval = "auto";
    db.bots.find((b) => b.kind === "invoices")!.approval = "auto";
    const s = services();
    fakeDeepSeek([sendTurn(), { text: "Sent." }, { tools: [{ name: "create_credit_note", args: { invoice_id: "in_1042", amount: 1240, reason: "Billed twice", customer: "Acme Hotels", currency: "USD", group: "acme-1042" } }] }, { text: "Credit note ready." }], s.handler);
    await chatWithBot(store, ws, "inbox", "Tell Lena Thursday works");
    expect(s.sent).toHaveLength(1);
    await chatWithBot(store, ws, "invoices", "Fix the Acme double charge");
    expect(s.credits).toHaveLength(0);
    expect(db.actions[0]).toMatchObject({ tool: "create_credit_note", risk: "money", amount_cents: 124000, counterparty: "Acme Hotels", group_key: "acme-1042" });
  });

  it("money is checked: bad amounts never become cards, an edit is re-checked and the card follows it, a credit can't exceed its invoice", async () => {
    const { store, ws, db } = memStore({ conns: [stripe] });
    const s = services();
    fakeDeepSeek([
      { tools: [{ name: "create_invoice", args: { customer: "Acme", lines: [{ description: "Glaze workshop", amount: -50 }] } }] },
      { tools: [{ name: "create_credit_note", args: { invoice_id: "in_1042", amount: 9999, reason: "Billed twice", customer: "Acme Hotels" } }] },
      { tools: [{ name: "create_credit_note", args: { invoice_id: "in_1042", amount: 1240, reason: "Billed twice", customer: "Acme Hotels" } }] },
      { text: "One credit note waiting." },
    ], s.handler);
    await chatWithBot(store, ws, "invoices", "Bill Acme and fix the double charge");
    expect(db.actions).toHaveLength(1); // the negative invoice and the oversized credit never became cards
    const [a] = db.actions;
    await expect(approveAction(store, ws, a.id, owner, { ...a.payload, amount: 0 })).rejects.toThrow(/above zero/);
    await approveAction(store, ws, a.id, owner, { ...a.payload, amount: 620 });
    expect(db.actions[0]).toMatchObject({ status: "sending", amount_cents: 62000 }); // the card follows the edit
  });

  it("roles: email-only approvers can't approve money, viewers can't approve anything", () => {
    expect(canApprove("approver_email", { risk: "message" })).toBe(true);
    expect(canApprove("approver_email", { risk: "money" })).toBe(false);
    expect(canApprove("viewer", { risk: "message" })).toBe(false);
    expect(canApprove("approver", { risk: "money" })).toBe(true);
  });

  it("'Ask Ledger' sets the card aside and queues a redraft that replaces it", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    const s = services();
    fakeDeepSeek([sendTurn(), { text: "Queued." }, { tools: [{ name: "send_email", args: { to: "lena@ortiz.test", subject: "Thursday", body: "Thursday at 2 works, see you then!", reply_to_id: "m1" } }] }, { text: "Redrafted." }], s.handler);
    await chatWithBot(store, ws, "inbox", "reply to Lena");
    const first = db.actions[0];
    await reviseAction(store, ws, first.id, "Say 2 PM and sound warmer", "owner-1");
    expect(db.actions[0].status).toBe("revising");
    await tick(store);
    expect(db.actions[0].status).toBe("rejected");
    expect(db.actions[1]).toMatchObject({ status: "pending" });
    expect(db.actions[1].payload.body).toContain("Thursday at 2");
  });
});

describe("guardrails", () => {
  it("holds, the do-not-contact list and the weekly cap stop outreach before a card is even made", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    await hire(store, ws, "leads", null); // Nudge isn't on the default team
    await store.setDoNotContact(ws.id, [{ kind: "domain", value: "spam.test" }]);
    await store.placeHold(ws.id, { subject: "acme.test", label: "Acme", scope: "all", reason: "invoice dispute", bot_id: null, user_id: null, resume_at: null });
    await store.addTouch(ws.id, "dana@quiet.test", null);
    const nudge = { to: "dana@quiet.test", subject: "Following up", body: "Any thoughts on the quote?" };
    const ds = fakeDeepSeek([
      { tools: [{ name: "send_email", args: { to: "x@spam.test", subject: "hi", body: "hi" } }] },
      { tools: [{ name: "send_email", args: { to: "ops@acme.test", subject: "hi", body: "hi" } }] },
      { tools: [{ name: "send_email", args: nudge }] },
      { text: "Couldn't contact any of them." },
    ]);
    await chatWithBot(store, ws, "leads", "follow up with everyone");
    const replies = ds.requests[3].messages.filter((m: any) => m.role === "tool").map((m: any) => JSON.parse(m.content).refused);
    expect(replies[0]).toMatch(/do-not-contact/);
    expect(replies[1]).toMatch(/on hold: invoice dispute/);
    expect(replies[2]).toMatch(/already contacted this week/);
    expect(db.actions).toHaveLength(0);
  });

  it("the weekly cap doesn't block Penny replying to someone who wrote in", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    await store.addTouch(ws.id, "lena@ortiz.test", null);
    fakeDeepSeek([sendTurn(), { text: "Draft ready." }], services().handler);
    await chatWithBot(store, ws, "inbox", "reply to Lena");
    expect(db.actions).toHaveLength(1);
  });

  it("place_hold posts a hold in the room and every bot respects it", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    fakeDeepSeek([
      { tools: [{ name: "place_hold", args: { who: "acme.test", label: "Acme", scope: "reminders", reason: "disputes invoice #1042" } }] },
      { text: "Paused reminders for Acme." },
    ]);
    await chatWithBot(store, ws, "invoices", "Acme disputes 1042");
    expect(db.holds[0]).toMatchObject({ subject: "acme.test", scope: "reminders" });
    expect(db.messages.find((m) => m.kind === "hold")?.content).toBe("Paused payment reminders to Acme: disputes invoice #1042");
  });
});

describe("tools, budget, memory", () => {
  it("only offers tools whose connection exists", async () => {
    const { store, ws } = memStore();
    const ds = fakeDeepSeek([{ text: "No mailbox yet." }]);
    await chatWithBot(store, ws, "inbox", "anything new?");
    const names = ds.requests[0].tools.map((t: any) => t.function.name);
    expect(names).toContain("post_to_room");
    expect(names).toContain("remember");
    expect(names).not.toContain("send_email");
  });

  it("stops at the day's budget without calling DeepSeek", async () => {
    const { store, ws, db } = memStore({ budget: 0 });
    db.bots.push({ ...db.bots[0], id: "r1", kind: "research", name: "Sage" });
    const ds = fakeDeepSeek([{ text: "hi" }]);
    const r = await chatWithBot(store, ws, "research", "look into kiln shelves");
    expect(r.result.status).toBe("stopped");
    expect(ds.requests).toHaveLength(0);
  });

  it("shared memory reaches every bot's prompt, and remember doesn't duplicate", async () => {
    const { store, ws, db } = memStore();
    await store.remember(ws.id, { subject: "Acme Hotels", fact: "Pays every invoice on the 15th" });
    const ds = fakeDeepSeek([{ tools: [{ name: "remember", args: { subject: "Acme Hotels", fact: "Pays every invoice on the 15th" } }] }, { text: "Noted." }]);
    await chatWithBot(store, ws, "brief", "hello");
    expect(ds.requests[0].messages[0].content).toContain("Acme Hotels: Pays every invoice on the 15th");
    expect(db.memories).toHaveLength(1);
  });

  it("research gathers with Flash and writes with Pro, metering research time", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    const { store, ws, db } = memStore();
    db.bots.push({ ...db.bots[0], id: "r1", kind: "research", name: "Sage" });
    const ds = fakeDeepSeek(
      [{ tools: [{ name: "web_search", args: { query: "kiln shelf suppliers" } }] }, { text: "Ready." }, { text: "## Summary\nLarkspur is 12% cheaper [1]." }],
      (url) => (url.includes("tavily") ? { results: [{ title: "Shelves", url: "https://example.test", content: "Larkspur $12" }] } : null),
    );
    const r = await chatWithBot(store, ws, "research", "best kiln shelf supplier?");
    expect(ds.requests.map((q) => q.model)).toEqual(["deepseek-flash", "deepseek-flash", "deepseek-v4-pro"]);
    expect(r.result.text).toContain("Larkspur");
    expect(db.runs[0].searches).toBe(1);
  });

  it("a failing DeepSeek call fails the run cleanly", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    process.env.DEEPSEEK_API_KEY = "test";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "Insufficient balance" } }), { status: 402 }));
    const bot = db.bots[0];
    const run = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "manual" });
    const r = await runBot(store, { ws, bot, run, input: "go" });
    expect(r.status).toBe("failed");
    expect(db.runs[0].error).toContain("Insufficient balance");
    expect(bot.status).toBe("failed");
  });
});

describe("the team", () => {
  it("hand_off queues work; the tick runs it and reports in the room", async () => {
    const { store, ws, db } = memStore();
    fakeDeepSeek([
      { tools: [{ name: "hand_off", args: { bot: "invoices", task: "Acme says #1042 was billed twice", title: "Acme #1042 dispute" } }] },
      { text: "Handed to Ledger." },
      { text: "Checked: it was a real duplicate." },
    ]);
    await chatWithBot(store, ws, "inbox", "Acme emailed about a double charge");
    const handoff = db.messages.find((m) => m.kind === "handoff")!;
    expect(handoff).toMatchObject({ content: "@Ledger Acme says #1042 was billed twice", data: { title: "Acme #1042 dispute" } });
    expect(await tick(store)).toContainEqual({ bot: "invoices", trigger: "handoff", status: "done" });
    expect(db.messages.some((m) => m.content === "Checked: it was a real duplicate.")).toBe(true);
  });

  it("@mentions by name or role give a bot a job", async () => {
    const { store, ws, db } = memStore();
    expect(mentions("@Penny anything from Acme? also @ledger", db.bots).map((b) => b.kind).sort()).toEqual(["inbox", "invoices"]);
    expect(mentions("@inbox and @Dawn", db.bots).map((b) => b.kind).sort()).toEqual(["brief", "inbox"]);
    const r = await postInRoom(store, ws, "@Ledger who still owes us?");
    expect(r.queued).toHaveLength(1);
    expect(r.message.mentions).toEqual([db.bots.find((b) => b.kind === "invoices")!.id]);
  });

  it("the tick runs due bots once and moves their schedule on", async () => {
    const { store, ws, db } = memStore({ conns: [stripe] });
    db.bots.forEach((b) => (b.next_run_at = null));
    const ledger = db.bots.find((b) => b.kind === "invoices")!;
    ledger.next_run_at = new Date(Date.now() - 1000).toISOString();
    fakeDeepSeek([{ text: "Nothing overdue tonight." }]);
    const now = new Date();
    expect(await tick(store, { now })).toEqual([{ bot: "invoices", trigger: "schedule", status: "done" }]);
    expect(new Date(ledger.next_run_at!).getTime()).toBeGreaterThan(now.getTime());
    expect(await tick(store, { now })).toEqual([]);
    void ws;
  });

  it("a bot missing a connection it needs waits, shown as stuck, instead of running on nothing", async () => {
    const { store, db } = memStore(); // no email connected
    db.bots.forEach((b) => (b.next_run_at = null));
    const penny = db.bots.find((b) => b.kind === "inbox")!;
    penny.next_run_at = new Date(Date.now() - 1000).toISOString();
    const ds = fakeDeepSeek([{ text: "I have no email tools." }]);
    expect(await tick(store)).toEqual([]);
    expect(ds.requests).toHaveLength(0);
    expect(penny).toMatchObject({ status: "blocked", status_text: "Needs email connected" });
  });

  it("nothing runs after the trial ends", async () => {
    const { store, ws, db } = memStore();
    ws.trial_ends_at = new Date(Date.now() - 1000).toISOString();
    db.bots[0].next_run_at = new Date(Date.now() - 1000).toISOString();
    const ds = fakeDeepSeek([{ text: "hi" }]);
    expect(await tick(store)).toEqual([]);
    expect(ds.requests).toHaveLength(0);
  });

  it("nothing runs before onboarding is finished", async () => {
    const { store, ws, db } = memStore();
    ws.onboarded_at = null;
    db.bots[0].next_run_at = new Date(Date.now() - 1000).toISOString();
    const ds = fakeDeepSeek([{ text: "hi" }]);
    expect(await tick(store)).toEqual([]);
    expect(ds.requests).toHaveLength(0);
  });
});

describe("screens", () => {
  it("the office shows each desk's persona and status; the desk groups and numbers the queue", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    fakeDeepSeek([{ tools: [sendTurn().tools[0], { name: "send_email", args: { to: "dana@acme.test", subject: "Sorry", body: "You're right.", group: "acme" } }] }, { text: "Two drafts." }], services().handler);
    await chatWithBot(store, ws, "inbox", "reply to both");
    const office = await officeView(store, ws);
    expect(office.desks.find((d) => d.kind === "inbox")).toMatchObject({ name: "Penny", role: "Inbox", hue: 65, prop: "papers", status: "needs_you", waiting: 2 });
    expect(office.needs_you).toEqual(["Penny"]);
    const desk = await deskView(store, ws);
    expect(desk.queue.map((q) => q.n)).toEqual([1, 2]);
    expect(desk.groups).toHaveLength(2);
    void db;
  });

  it("onboarding suggests bots from the industry and what eats the owner's evenings", () => {
    const ids = suggestedBots("dental_general", ["Following up leads"]).map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["inbox", "invoices", "brief", "leads"]));
    expect(ids.some((id) => id.startsWith("dental_"))).toBe(true);
  });

  it("hiring adds a specialist with its persona and posts a welcome in the room", async () => {
    const { store, ws, db } = memStore({ industry: "dental_general" });
    const kind = (await import("../lib/bots")).forIndustry("dental_general").find((t) => t.id.startsWith("dental"))!.id;
    const bot = await hire(store, ws, kind, "owner-1");
    expect(bot.kind).toBe(kind);
    expect(db.messages.at(-1)?.content).toMatch(/joined the team/);
  });
});

describe("industry casts in the office", () => {
  it("a new dental workspace hires its own cast, and the office says whose team it is", async () => {
    const { store, ws } = memStore({ industry: "dental_general" });
    const { defaultBots } = await import("../lib/engine/flows");
    const { botDef } = await import("../lib/bots");
    const rows = defaultBots(ws);
    expect(rows.find((r) => r.kind === "inbox")?.name).toBe(botDef("inbox", "dental_general").name);
    const office = await officeView(store, ws);
    expect(office.team).toBe("dental front office");
  });
});

describe("changing industry", () => {
  it("core bots take the new industry's cast names, but a name the owner chose stays", async () => {
    const { store, ws, db } = memStore();
    const { renameToCast } = await import("../lib/engine/flows");
    const { botDef } = await import("../lib/bots");
    db.bots.find((b) => b.kind === "invoices")!.name = "Moneypenny"; // the owner's own name
    ws.industry = "hvac";
    await renameToCast(store, ws);
    expect(db.bots.find((b) => b.kind === "inbox")!.name).toBe(botDef("inbox", "hvac").name);
    expect(db.bots.find((b) => b.kind === "invoices")!.name).toBe("Moneypenny");
    ws.industry = "dental_general";
    await renameToCast(store, ws);
    expect(db.bots.find((b) => b.kind === "inbox")!.name).toBe(botDef("inbox", "dental_general").name); // cast to cast
  });
});

describe("trial cap", () => {
  it("with TRIAL_BUDGET_USD=0 a trial runs nothing: no scheduled runs, and a chat says trials are paused without calling the model", async () => {
    process.env.TRIAL_BUDGET_USD = "0";
    try {
      const { store, ws, db } = memStore({ conns: [google] });
      db.bots[0].next_run_at = new Date(Date.now() - 1000).toISOString();
      const ds = fakeDeepSeek([{ text: "hi" }]);
      expect(await tick(store)).toEqual([]);
      const r = await chatWithBot(store, ws, "inbox", "anything new?");
      expect(ds.requests).toHaveLength(0);
      expect(JSON.stringify(r)).toMatch(/trials are paused/i);
      ws.plan = "solo"; // a paid plan is never held back
      expect(await tick(store)).not.toEqual([]);
    } finally {
      delete process.env.TRIAL_BUDGET_USD;
    }
  });
});

describe("what a bot is told", () => {
  it("knows exactly what's connected, never names its tools, talks like a person, and contact bots can read the sheet", async () => {
    const { store, ws } = memStore({ conns: [google] });
    const ds = fakeDeepSeek([{ text: "Hey! What can I do for you?" }]);
    await chatWithBot(store, ws, "inbox", "hi");
    const system = String((ds.requests[0] as { messages: { content: string }[] }).messages[0].content);
    expect(system).toMatch(/Connected right now: google \(email, calendar/);
    expect(system).toMatch(/Not connected: .*lead list \/ CRM/);
    expect(system).toMatch(/Never mention your tools/);
    expect(system).toMatch(/just saying hi/);
    const { TEMPLATES } = await import("../lib/bots");
    expect(TEMPLATES.filter((t) => t.tools.includes("find_contacts")).every((t) => t.tools.includes("read_sheet"))).toBe(true);
  });
});
