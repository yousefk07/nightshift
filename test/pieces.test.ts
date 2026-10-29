import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyWebhook } from "../lib/billing";
import { accountingFor } from "../lib/connectors/accounting";
import { parseCsv, rowsToContacts, sheetId } from "../lib/connectors/crm";
import { freeSlots } from "../lib/connectors/mail";
import { inQuietHours, notifyEvent, setDelivery } from "../lib/notify";
import { limits } from "../lib/plans";
import { checkToolNames } from "../lib/tools";
import { memStore } from "./memstore";

afterEach(() => vi.unstubAllGlobals());

describe("tools", () => {
  it("every tool in names.ts is implemented, with the approval class it declares", () => {
    expect(checkToolNames()).toEqual({ missing: [], mismatched: [] });
  });
});

describe("notifications", () => {
  it("quiet hours wrap past midnight in the workspace's time zone", () => {
    const q = { on: true, start: "21:00", end: "07:00" };
    expect(inQuietHours(q, "America/Toronto", new Date("2026-10-29T03:00:00Z"))).toBe(true); // 11 PM in Toronto
    expect(inQuietHours(q, "America/Toronto", new Date("2026-10-29T16:00:00Z"))).toBe(false); // noon
    expect(inQuietHours({ ...q, on: false }, "America/Toronto", new Date("2026-10-29T03:00:00Z"))).toBe(false);
  });

  it("during quiet hours only disputes break through; the rest waits in the app", async () => {
    const { store, ws, db } = memStore();
    const emails: string[] = [];
    setDelivery({ email: async (to, subject) => void emails.push(subject), push: async () => 1 });
    const night = new Date("2026-10-29T03:00:00Z");
    await notifyEvent(store, ws, "connection_broken", { title: "Accounting got disconnected" }, night);
    await notifyEvent(store, ws, "dispute_or_complaint", { title: "Acme disputes #1042" }, night);
    expect(emails).toEqual(["Acme disputes #1042"]);
    expect(db.notifications.map((n) => [n.title, n.channels])).toEqual([["Accounting got disconnected", ["app"]], ["Acme disputes #1042", ["app", "email", "push"]]]);
  });
});

describe("calendar", () => {
  it("free slots skip events, stay in working hours and spread out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z")); // Monday 7 AM Toronto
    const slots = freeSlots([{ id: "1", title: "Kiln firing", start: "2026-11-02T14:00:00Z", end: "2026-11-02T16:00:00Z", attendees: [] }], {
      from: new Date(), to: new Date("2026-11-04T00:00:00Z"), minutes: 60, count: 3, timeZone: "America/Toronto", hours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    });
    vi.useRealTimers();
    expect(slots[0].start).toBe("2026-11-02T16:00:00.000Z"); // 11 AM, right after the firing
    expect(slots.every((s) => new Date(s.start).getUTCHours() >= 14 && new Date(s.end).getUTCHours() <= 23)).toBe(true);
    expect(slots).toHaveLength(3);
  });
});

describe("contacts import", () => {
  it("reads a messy CSV by its headers", () => {
    const csv = 'First Name,Last name,E-mail,Business,Status,Last contacted,Notes\r\nLena,Ortiz,LENA@ortiz.test,"Ortiz Design, LLC",Quoted,2026-10-01,"Wants March, ""maybe"" April"\r\nNo,Email,,,,,\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    const [c] = rowsToContacts(rows);
    expect(c).toMatchObject({ email: "lena@ortiz.test", name: "Lena Ortiz", company: "Ortiz Design, LLC", stage: "quoted", notes: 'Wants March, "maybe" April' });
    expect(c.last_touch_at).toBe("2026-10-01T00:00:00.000Z");
    expect(rowsToContacts(rows)).toHaveLength(1); // the row without an email is skipped
    expect(sheetId("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0")).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
  });

  it("a sheet with blank cells or missing columns never wipes what's known", () => {
    const [c] = rowsToContacts(parseCsv("Email,Name,Stage,Notes\nlena@ortiz.test,,,\n"));
    expect(c).toEqual({ email: "lena@ortiz.test" }); // no stage reset to "lead", no empty notes
  });

  it("email matching is exact: _ and % aren't wildcards", async () => {
    const { exactly } = await import("../lib/like");
    expect(exactly("a_b%c@x.com")).toBe("a\\_b\\%c@x.com");
  });

  it("send_email refuses line breaks in headers and anything that isn't a plain address", async () => {
    const { toolByName } = await import("../lib/tools");
    const { store, ws, db } = memStore();
    const ctx = { store, ws, bot: db.bots[0], run: null, conns: [], usage: { searches: 0 }, emit: () => {} } as never;
    const guard = toolByName("send_email")!.guard!;
    expect(await guard(ctx, { to: "lena@ortiz.test\r\nBcc: z@evil.test", subject: "Hi", body: "x" })).toMatch(/line break/);
    expect(await guard(ctx, { to: "lena@ortiz.test, Bcc:z@evil.test bob", subject: "Hi", body: "x" })).toMatch(/valid recipient/);
    expect(await guard(ctx, { to: "lena@ortiz.test", subject: "Hi", body: "x" })).toBeNull();
  });
});

describe("billing", () => {
  it("accepts only correctly signed, recent Stripe webhooks", () => {
    const secret = "whsec_test", body = '{"type":"customer.subscription.updated"}';
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(verifyWebhook(body, `t=${t},v1=${sig}`, secret)).toBe(true);
    expect(verifyWebhook(body + " ", `t=${t},v1=${sig}`, secret)).toBe(false);
    expect(verifyWebhook(body, `t=${t - 600},v1=${createHmac("sha256", secret).update(`${t - 600}.${body}`).digest("hex")}`, secret)).toBe(false);
  });

  it("a purchase shows up without the webhook, and cancel / switch go through Stripe", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const { store, ws } = memStore();
    ws.stripe_customer_id = "cus_1";
    const sub = (over: Record<string, unknown> = {}) => ({
      id: "sub_1", status: "active", cancel_at_period_end: false, metadata: {}, current_period_end: 1_800_000_000,
      items: { data: [{ id: "si_1", price: { lookup_key: "nightshift_solo_month", recurring: { interval: "month" } }, quantity: 1 }] }, ...over,
    });
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? "") });
      const j = url.includes("/subscriptions?customer=") ? { data: [sub()] }
        : url.includes("/prices?") ? { data: [{ id: "price_studio_year" }] }
        : url.endsWith("/subscriptions/sub_1") && init?.method === "POST" ? sub(String(init.body).includes("cancel_at_period_end=true") ? { cancel_at_period_end: true } : { items: { data: [{ id: "si_1", price: { lookup_key: "nightshift_studio_year", recurring: { interval: "year" } }, quantity: 1 }] } })
        : sub();
      return new Response(JSON.stringify(j), { status: 200 });
    });
    const { syncSubscription, setCancel, changePlan } = await import("../lib/billing");

    expect(await syncSubscription(store, ws)).toMatchObject({ status: "active", cancel_at_period_end: false });
    expect(await store.workspace(ws.id)).toMatchObject({ plan: "solo", plan_interval: "month", stripe_subscription_id: "sub_1" });

    expect(await setCancel(store, await store.workspace(ws.id), true)).toMatchObject({ cancel_at_period_end: true });
    expect(calls.at(-1)!.body).toContain("cancel_at_period_end=true");
    expect((await store.workspace(ws.id)).plan).toBe("solo"); // still on Solo until the period ends

    await changePlan(store, await store.workspace(ws.id), "studio", "year");
    expect(decodeURIComponent(calls.at(-1)!.body)).toContain("items[0][price]=price_studio_year");
    expect(await store.workspace(ws.id)).toMatchObject({ plan: "studio", plan_interval: "year" });
  });

  it("plan limits follow the pricing table, with extra seats", () => {
    expect(limits({ plan: "solo", extra_seats: 0 })).toMatchObject({ bots: 3, seats: 1, room: false });
    expect(limits({ plan: "trial", extra_seats: 0 })).toMatchObject({ bots: 10, seats: 2, researchHours: 100, room: true });
    expect(limits({ plan: "team", extra_seats: 3 }).seats).toBe(13);
  });
});

describe("accounting", () => {
  it("maps Stripe invoices to open/overdue with days overdue", async () => {
    const due = Math.floor((Date.now() - 10 * 86_400_000) / 1000);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: [
      { id: "in_1", number: "1042", customer: "cus_1", customer_name: "Acme Hotels", customer_email: "dana@acme.test", total: 124000, amount_remaining: 124000, currency: "usd", due_date: due, status: "open", hosted_invoice_url: "https://pay" },
      { id: "in_2", number: "1043", customer: "cus_2", customer_name: "Harbor Café", customer_email: null, total: 50000, amount_remaining: 50000, currency: "usd", due_date: null, status: "open", hosted_invoice_url: null },
    ] }), { status: 200 }));
    const { store } = memStore();
    const books = accountingFor(store, { id: "c", workspace_id: "w", provider: "stripe", kinds: ["accounting"], account: "Stripe", secret: { key: "sk_test" }, status: "ok" });
    const [a, b] = await books.listInvoices("open");
    expect(a).toMatchObject({ customer: "Acme Hotels", amountDue: 1240, status: "overdue", currency: "USD" });
    expect(a.daysOverdue).toBeGreaterThanOrEqual(9);
    expect(b).toMatchObject({ status: "open", daysOverdue: 0 });
    expect(await books.listInvoices("overdue")).toHaveLength(1);
  });
});

describe("connections", () => {
  it("two refreshes at once: the loser uses the winner's fresh token instead of calling the connection broken", async () => {
    process.env.MICROSOFT_CLIENT_ID = "id"; process.env.MICROSOFT_CLIENT_SECRET = "secret";
    const { accessToken } = await import("../lib/connectors/oauth");
    const { store, db } = memStore({ conns: [{ provider: "microsoft", kinds: ["email", "calendar"], account: "me@outlook.test", secret: { access_token: "old", refresh_token: "r1", expires_at: Date.now() - 1000 } }] });
    const conn = db.conns[0];
    vi.stubGlobal("fetch", async () => {
      // meanwhile another request refreshed and saved: r1 is spent
      conn.secret = { access_token: "fresh", refresh_token: "r2", expires_at: Date.now() + 3_600_000 };
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    });
    expect(await accessToken(store, { ...conn, secret: { ...(conn.secret as object) } } as never)).toBe("fresh");
    expect(conn.status).toBe("ok");
  });
});
