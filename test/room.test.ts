import { beforeEach, describe, expect, it, vi } from "vitest";
import { canWork, postInRoom, runQueued, tick } from "../lib/engine/flows";
import { setDelivery } from "../lib/notify";
import { fakeDeepSeek } from "./fake-deepseek";
import { memStore } from "./memstore";

// The bot room starts @mention jobs straight away (the route claims each one and runs it after replying);
// the tick is only the backstop. Each job runs once and the bot says one thing in the room.
beforeEach(() => {
  vi.useRealTimers();
  setDelivery({ email: async () => {}, push: async () => 0 });
});

const roomBotMessages = (db: ReturnType<typeof memStore>["db"], botId: string) => db.messages.filter((m) => m.role === "bot" && m.bot_id === botId);

describe("bot room jobs", () => {
  it("an @mention runs right away, once, and answers in the room", async () => {
    const { store, ws, db } = memStore();
    fakeDeepSeek([{ text: "Hi! Nothing urgent tonight." }]);
    const r = await postInRoom(store, ws, "@Ledger hello");
    const ledger = db.bots.find((b) => b.kind === "invoices")!;
    expect(ledger.status_text).toBe("Reading the room");

    const run = await store.claimRun(r.queued[0].id);
    expect(run).not.toBeNull();
    expect(await store.claimRun(r.queued[0].id)).toBeNull(); // a second claim (the tick, a retry) gets nothing
    expect(await runQueued(store, ws, run!)).toEqual({ bot: "invoices", trigger: "room", status: "done" });

    expect(roomBotMessages(db, ledger.id).map((m) => m.content)).toEqual(["Hi! Nothing urgent tonight."]);
    expect(ledger.status_text).not.toBe("Reading the room");
    expect(await tick(store)).toEqual([]); // nothing left for the tick
  });

  it("tells the bot it was mentioned and what was said", async () => {
    const { store, ws } = memStore();
    const r = await postInRoom(store, ws, "@Ledger who still owes us?");
    expect(r.queued[0].input).toBe('You were mentioned in the bot room. The owner wrote: "@Ledger who still owes us?"');
  });

  it("a bot that hands off in the room posts one message, not a hand-off plus a summary", async () => {
    const { store, ws, db } = memStore();
    fakeDeepSeek([
      { tools: [{ name: "hand_off", args: { bot: "invoices", task: "Check who still owes us", title: "Overdue check" } }] },
      { text: "Passed it to Ledger." },
    ]);
    const r = await postInRoom(store, ws, "@Penny ask Ledger who owes us");
    const penny = db.bots.find((b) => b.kind === "inbox")!;
    await runQueued(store, ws, (await store.claimRun(r.queued[0].id))!);
    const said = roomBotMessages(db, penny.id);
    expect(said).toHaveLength(1);
    expect(said[0].kind).toBe("handoff");
  });

  it("a paused bot's job stops and the bot isn't left on 'Reading the room'", async () => {
    const { store, ws, db } = memStore();
    const r = await postInRoom(store, ws, "@Ledger hello");
    const ledger = db.bots.find((b) => b.kind === "invoices")!;
    ledger.enabled = false; // paused between the post and the run
    const ds = fakeDeepSeek([{ text: "hi" }]);
    expect(await runQueued(store, ws, (await store.claimRun(r.queued[0].id))!)).toBeNull();
    expect(ds.requests).toHaveLength(0);
    expect(db.runs.find((x) => x.id === r.queued[0].id)).toMatchObject({ status: "stopped", error: "Bot is paused" });
    expect(ledger.status_text).not.toBe("Reading the room");
  });

  it("after the trial ends a room job stops instead of running", async () => {
    const { store, ws, db } = memStore();
    const r = await postInRoom(store, ws, "@Ledger hello");
    ws.trial_ends_at = new Date(Date.now() - 1000).toISOString();
    const ds = fakeDeepSeek([{ text: "hi" }]);
    expect(await runQueued(store, ws, (await store.claimRun(r.queued[0].id))!)).toBeNull();
    expect(ds.requests).toHaveLength(0);
    expect(db.runs.find((x) => x.id === r.queued[0].id)?.error).toBe("Plan inactive");
  });
});

describe("canWork", () => {
  it("only onboarded, live, in-trial or paid workspaces with a budget", () => {
    const { ws } = memStore();
    expect(canWork(ws)).toBe(true);
    expect(canWork({ ...ws, onboarded_at: null })).toBe(false);
    expect(canWork({ ...ws, deleted_at: new Date().toISOString() })).toBe(false);
    expect(canWork({ ...ws, plan: "canceled" })).toBe(false);
    expect(canWork({ ...ws, trial_ends_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    expect(canWork({ ...ws, plan: "solo", trial_ends_at: new Date(Date.now() - 1000).toISOString() })).toBe(true);
    process.env.TRIAL_BUDGET_USD = "0";
    try {
      expect(canWork(ws)).toBe(false);
      expect(canWork({ ...ws, plan: "studio" })).toBe(true);
    } finally {
      delete process.env.TRIAL_BUDGET_USD;
    }
  });
});
