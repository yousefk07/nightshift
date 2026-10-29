import { beforeEach, describe, expect, it } from "vitest";
import { runBot } from "../lib/engine/agent";
import { chatWithBot, decideAction, mentions, postInRoom, tick } from "../lib/engine/flows";
import { fakeDeepSeek } from "./fake-deepseek";
import { memStore } from "./memstore";

const google = { provider: "google" as const, secret: { access_token: "ya29.test", refresh_token: "r", expires_at: Date.now() + 3_600_000 } };

// Answers the Gmail calls the bots make, and records what was sent.
function gmailApi() {
  const sent: any[] = [];
  const handler = (url: string, init?: RequestInit) => {
    if (url.includes("/messages/send")) {
      sent.push(JSON.parse(String(init?.body)));
      return { id: "sent-1" };
    }
    if (url.includes("/messages/m1")) return { id: "m1", threadId: "t1", snippet: "Can you confirm Thursday?", payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Ana <ana@acme.test>" }, { name: "Subject", value: "Thursday" }, { name: "Message-ID", value: "<abc@acme.test>" }] } };
    throw new Error(`unexpected ${url}`);
  };
  return { sent, handler };
}

const sendTurn = { tools: [{ name: "send_email", args: { to: "ana@acme.test", subject: "Thursday", body: "Thursday works.", reply_to_id: "m1" } }] };

describe("approvals", () => {
  beforeEach(() => {
    delete process.env.TAVILY_API_KEY;
  });

  it("an 'ask' bot queues outward actions instead of running them, and approving runs them", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    const gm = gmailApi();
    fakeDeepSeek([sendTurn, { text: "Your reply to Ana is waiting for your OK." }], gm.handler);

    const r = await chatWithBot(store, ws, "inbox", "Tell Ana Thursday works");
    expect(r.result.status).toBe("done");
    expect(r.result.actions).toHaveLength(1);
    expect(gm.sent).toHaveLength(0); // nothing left the building
    const action = db.actions[0];
    expect(action).toMatchObject({ tool: "send_email", status: "pending", title: 'Send email to ana@acme.test: "Thursday"' });
    expect(db.messages.some((m) => m.content.startsWith("Waiting for your OK"))).toBe(true);

    const d = await decideAction(store, ws, action.id, "approve", "owner-1");
    expect(d.status).toBe("done");
    expect(gm.sent).toHaveLength(1);
    expect(gm.sent[0].threadId).toBe("t1"); // sent in Ana's thread
    expect(db.actions[0].status).toBe("done");
    await expect(decideAction(store, ws, action.id, "approve", "owner-1")).rejects.toThrow(/already done/);
  });

  it("an edited card is sent as edited; a rejected one never runs", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    const gm = gmailApi();
    fakeDeepSeek([sendTurn, { text: "Queued." }, sendTurn, { text: "Queued." }], gm.handler);
    await chatWithBot(store, ws, "inbox", "reply to Ana");
    await chatWithBot(store, ws, "inbox", "reply to Ana again");
    const [a, b] = db.actions;
    await decideAction(store, ws, a.id, "approve", "o", { ...a.payload, body: "Thursday at 3 works." });
    await decideAction(store, ws, b.id, "reject", "o");
    expect(gm.sent).toHaveLength(1);
    expect(Buffer.from(gm.sent[0].raw, "base64url").toString()).toContain("Thursday at 3 works.");
    expect(db.actions.map((x) => x.status)).toEqual(["done", "rejected"]);
  });

  it("an 'auto' bot acts right away", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    db.bots.find((b) => b.kind === "inbox")!.approval = "auto";
    const gm = gmailApi();
    fakeDeepSeek([sendTurn, { text: "Sent." }], gm.handler);
    const r = await chatWithBot(store, ws, "inbox", "Tell Ana Thursday works");
    expect(r.result.actions).toHaveLength(0);
    expect(gm.sent).toHaveLength(1);
    expect(db.actions).toHaveLength(0);
  });

  it("quiet tools run even on 'ask'", async () => {
    const { store, ws, db } = memStore({ conns: [google] });
    fakeDeepSeek([
      { tools: [{ name: "flag", args: { source: "email", external_id: "m1", title: "Acme disputes invoice", why: "They say they were double-billed.", importance: 3 } }] },
      { tools: [{ name: "flag", args: { source: "email", external_id: "m1", title: "Acme disputes invoice #1042", why: "Double-billed.", importance: 3 } }] },
      { text: "Flagged one." },
    ]);
    await chatWithBot(store, ws, "inbox", "check mail");
    expect(db.flags).toHaveLength(1); // the same email is only flagged once
    expect(db.flags[0].title).toBe("Acme disputes invoice #1042");
    expect(db.actions).toHaveLength(0);
  });
});

describe("tools and budget", () => {
  it("only offers tools whose service is connected", async () => {
    const { store, ws } = memStore(); // nothing connected
    const ds = fakeDeepSeek([{ text: "No mailbox yet." }]);
    await chatWithBot(store, ws, "inbox", "anything new?");
    const names = ds.requests[0].tools.map((t: any) => t.function.name);
    expect(names).toContain("post_to_room");
    expect(names).not.toContain("send_email");
    expect(names).not.toContain("search_email");
  });

  it("stops when the day's budget is used up, without calling DeepSeek", async () => {
    const { store, ws, db } = memStore({ budget: 0 });
    const ds = fakeDeepSeek([{ text: "hi" }]);
    const r = await chatWithBot(store, ws, "research", "look into dental chairs");
    expect(r.result.status).toBe("stopped");
    expect(ds.requests).toHaveLength(0);
    expect(db.runs[0].status).toBe("stopped");
  });

  it("records tokens and cost on the run and the day", async () => {
    const { store, ws, db } = memStore();
    fakeDeepSeek([{ text: "Done.", usage: { hit: 10_000, miss: 2_000, out: 500 } }]);
    const r = await chatWithBot(store, ws, "brief", "hello");
    const run = db.runs[0];
    expect(run).toMatchObject({ tokens_hit: 10_000, tokens_miss: 2_000, tokens_out: 500, status: "done" });
    expect(r.result.costUsd).toBeGreaterThan(0);
    expect([...db.usage.values()][0]).toBeCloseTo(r.result.costUsd, 10);
  });

  it("research gathers with Flash, then writes the report with Pro", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    const { store, ws } = memStore();
    const ds = fakeDeepSeek(
      [{ tools: [{ name: "web_search", args: { query: "dental chair prices 2026" } }] }, { text: "Ready to write up." }, { text: "## Summary\nChairs cost $X [1]." }],
      (url) => (url.includes("tavily") ? { results: [{ title: "Chair guide", url: "https://example.test/chairs", content: "Chairs cost $X." }] } : null),
    );
    const r = await chatWithBot(store, ws, "research", "What do dental chairs cost?");
    expect(ds.requests.map((q) => q.model)).toEqual(["deepseek-v4.1-flash", "deepseek-v4.1-flash", "deepseek-v4-pro"]);
    expect(r.result.text).toContain("## Summary");
    expect(r.run.id).toBeTruthy();
    delete process.env.TAVILY_API_KEY;
  });

  it("an unknown tool or bad JSON is told to the model, not thrown", async () => {
    const { store, ws } = memStore();
    const ds = fakeDeepSeek([{ tools: [{ name: "delete_everything", args: {} }] }, { text: "Sorry." }]);
    const r = await chatWithBot(store, ws, "brief", "go");
    expect(r.result.status).toBe("done");
    expect(ds.requests[1].messages.at(-1).content).toContain("no tool called delete_everything");
  });
});

describe("the team", () => {
  it("hand_off queues work for another bot, and the tick runs it and reports in the room", async () => {
    const { store, ws, db } = memStore();
    fakeDeepSeek([
      { tools: [{ name: "hand_off", args: { bot: "research", task: "Find three suppliers of nitrile gloves in Ontario" } }] },
      { text: "Asked Research." },
      { text: "Here are three suppliers." }, // Research, on the tick
    ]);
    await chatWithBot(store, ws, "inbox", "we need gloves");
    const queued = db.runs.find((r) => r.status === "queued")!;
    expect(queued.trigger).toBe("handoff");
    expect(queued.input).toContain("nitrile gloves");

    const done = await tick(store, { now: new Date() });
    expect(done).toContainEqual({ bot: "research", trigger: "handoff", status: "done" });
    const room = db.messages.filter((m) => m.thread_id === db.threads.find((t) => t.kind === "room")!.id).map((m) => m.content);
    expect(room.some((t) => t.startsWith("@Research"))).toBe(true);
    expect(room).toContain("Here are three suppliers.");
  });

  it("@mentions in the room give that bot a job", async () => {
    const { store, ws, db } = memStore();
    expect(mentions("@inbox anything from Acme? also @Research", db.bots).map((b) => b.kind).sort()).toEqual(["inbox", "research"]);
    expect(mentions("@followup and @morning brief", db.bots).map((b) => b.kind).sort()).toEqual(["brief", "followup"]);
    const r = await postInRoom(store, ws, "@followup who still owes us?");
    expect(r.queued).toHaveLength(1);
    expect(db.runs[0]).toMatchObject({ status: "queued", trigger: "room" });
  });

  it("the tick runs due bots once and moves their schedule on", async () => {
    const { store, ws, db } = memStore();
    const brief = db.bots.find((b) => b.kind === "brief")!;
    db.bots.forEach((b) => (b.next_run_at = null));
    brief.next_run_at = new Date(Date.now() - 1000).toISOString();
    fakeDeepSeek([{ tools: [{ name: "save_brief", args: { markdown: "**Needs you:** nothing." } }] }, { text: "Brief saved." }]);
    const now = new Date();
    const done = await tick(store, { now });
    expect(done).toEqual([{ bot: "brief", trigger: "schedule", status: "done" }]);
    expect(new Date(brief.next_run_at!).getTime()).toBeGreaterThan(now.getTime());
    expect([...db.briefs.values()][0]).toContain("Needs you");
    expect(await tick(store, { now })).toEqual([]); // not due again
    void ws;
  });

  it("a failing DeepSeek call fails the run cleanly", async () => {
    const { store, ws, db } = memStore();
    process.env.DEEPSEEK_API_KEY = "test";
    const { vi } = await import("vitest");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "Insufficient balance" } }), { status: 402 }));
    const bot = db.bots[0];
    const run = await store.createRun({ workspace_id: ws.id, bot_id: bot.id, trigger: "manual" });
    const r = await runBot(store, { ws, bot, run, input: "go" });
    expect(r.status).toBe("failed");
    expect(db.runs[0].error).toContain("Insufficient balance");
  });
});
