import { describe, expect, it } from "vitest";
import { TEMPLATES, forIndustry, starters } from "../lib/bots";
import { CATEGORIES, INDUSTRIES, NEEDS, PROPS, type Industry } from "../lib/bots/template";
import { TOOL_NAMES } from "../lib/tools/names";

// Guards the catalog: every template is complete, unique and only uses tools and industries that exist.
describe("bot catalog", () => {
  it("has unique ids", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s is a complete, valid template", (_id, t) => {
    expect(t.id).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/);
    expect(t.name).toMatch(/^[A-Z][A-Za-z' -]{1,19}$/);
    expect(t.role.length).toBeGreaterThan(2);
    expect(t.role.length).toBeLessThanOrEqual(24);
    expect(t.title.length).toBeGreaterThan(10);
    expect(t.title.length).toBeLessThanOrEqual(90);
    expect(t.hue).toBeGreaterThanOrEqual(0);
    expect(t.hue).toBeLessThan(360);
    expect(PROPS).toContain(t.prop);
    expect(Object.keys(CATEGORIES)).toContain(t.category);
    expect(t.industries.length).toBeGreaterThan(0);
    for (const i of [...t.industries, ...(t.starter ?? [])]) expect(Object.keys(INDUSTRIES)).toContain(i);
    for (const s of t.starter ?? []) expect(t.industries.includes(s) || t.industries.includes("general")).toBe(true);
    for (const n of t.needs) expect(NEEDS).toContain(n);
    expect(t.instructions.length).toBeGreaterThan(150);
    expect(["flash", "pro"]).toContain(t.tier);
    expect(t.tools.length).toBeGreaterThan(1);
    for (const tool of t.tools) expect(Object.keys(TOOL_NAMES), `${t.id} uses unknown tool ${tool}`).toContain(tool);
    expect(new Set(t.tools).size).toBe(t.tools.length);
    if (t.schedule && "dailyAt" in t.schedule) expect(t.schedule.dailyAt).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    if (t.schedule && "everyMinutes" in t.schedule) expect(t.schedule.everyMinutes).toBeGreaterThanOrEqual(15);
    if (t.schedule) expect(t.scheduledTask, `${t.id} runs on a schedule but has no scheduledTask`).toBeTruthy();
    // a bot that needs a kind of connection uses at least one tool of that kind
    const uses = (names: string[]) => names.some((n) => t.tools.includes(n));
    if (t.needs.includes("email")) expect(uses(["search_email", "read_email", "send_email", "draft_reply"])).toBe(true);
    if (t.needs.includes("accounting")) expect(uses(["list_invoices", "get_invoice", "list_payments", "create_invoice", "create_credit_note", "send_invoice_reminder"])).toBe(true);
    if (t.needs.includes("store")) expect(uses(["list_orders", "list_unpaid_orders", "list_low_stock"])).toBe(true);
    if (t.needs.includes("web")) expect(uses(["web_search", "read_page", "check_page"])).toBe(true);
  });

  it("no two bots in the same industry share a persona name", () => {
    for (const industry of Object.keys(INDUSTRIES) as Industry[]) {
      const names = forIndustry(industry).map((t) => t.name);
      expect(names.length, industry).toBe(new Set(names).size);
    }
  });

  it("every industry has its own specialists and a sensible starting team", () => {
    for (const industry of Object.keys(INDUSTRIES) as Industry[]) {
      if (industry === "general") continue;
      const own = TEMPLATES.filter((t) => t.industries.includes(industry));
      expect(own.length, `${industry} specialists`).toBeGreaterThanOrEqual(3);
      expect(starters(industry).length, `${industry} starters`).toBeGreaterThanOrEqual(4);
      expect(starters(industry).length, `${industry} starters`).toBeLessThanOrEqual(8);
    }
  });
});

// The industry casts: every business but "Any business" gets its own names and jobs for the core five.
describe("industry casts", () => {
  it("every industry has a full cast with five distinct names, none of them the default team's", async () => {
    const { CASTS } = await import("../lib/bots");
    for (const industry of Object.keys(INDUSTRIES).filter((i) => i !== "general")) {
      const c = CASTS[industry as Industry];
      expect(c, industry).toBeTruthy();
      const names = Object.values(c!.bots).map((b) => b.name);
      expect(new Set(names).size, `${industry} names`).toBe(5);
      for (const n of names) expect(["Penny", "Sage", "Ledger", "Nudge", "Dawn"], `${industry}: ${n}`).not.toContain(n);
      expect(c!.people && c!.jobs && c!.urgent && c!.today, industry).toBeTruthy();
    }
  });

  it("a dentist's front desk is its own bot, in dental words, handing billing to its own billing bot", async () => {
    const { botDef } = await import("../lib/bots");
    const desk = botDef("inbox", "dental_general"), billing = botDef("invoices", "dental_general");
    expect(desk.name).not.toBe("Penny");
    expect(desk.role).toBe("Front desk");
    expect(desk.title).toMatch(/patients/);
    expect(desk.instructions).toContain(billing.name); // "hand invoice questions to Rosa", not to Ledger
    expect(desk.instructions).not.toMatch(/\bLedger\b/);
    expect(desk.instructions).toMatch(/tooth pain/);
    expect(desk.tools).toEqual(botDef("inbox").tools); // same skills, new words
    expect(botDef("brief", "hvac").instructions).toContain("Today's service calls");
  });

  it("'Any business' keeps the default team", async () => {
    const { botDef } = await import("../lib/bots");
    expect(botDef("inbox", "general").name).toBe("Penny");
    expect(botDef("invoices").name).toBe("Ledger");
  });
});
