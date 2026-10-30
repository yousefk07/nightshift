import { beforeEach, describe, expect, it, vi } from "vitest";

// Invite-only trials: who may start a workspace, what happens to everyone else, and the approval email.
// The database, alerts and mail are fakes; the rules in lib/access.ts are real.
const rows: { id: number; email: string; status: string; source?: string }[] = [];
const alerts: unknown[] = [], mails: { to: string; from?: string; subject: string; text: string }[] = [];

vi.mock("../lib/store-supabase", () => ({
  admin: () => ({
    from: () => {
      let match: (r: (typeof rows)[number]) => boolean = () => true;
      const q = {
        select: () => q,
        ilike: (_c: string, v: string) => ((match = (r) => r.email.toLowerCase() === v.replace(/\\(.)/g, "$1").toLowerCase()), q),
        maybeSingle: async () => ({ data: rows.find(match) ?? null, error: null }),
        insert: async (r: { email: string; source: string }) => {
          if (rows.some((x) => x.email === r.email)) return { error: { code: "23505", message: "duplicate key" } };
          rows.push({ id: rows.length + 1, status: "new", ...r });
          return { error: null };
        },
        update: (patch: { status: string }) => ({ ilike: (c: string, v: string) => (q.ilike(c, v), { then: (ok: () => void) => (rows.filter(match).forEach((r) => Object.assign(r, patch)), ok()) }) }),
      };
      return q;
    },
  }),
}));
vi.mock("../lib/alerts", () => ({ ownerAlert: async (a: unknown) => void alerts.push(a) }));
vi.mock("../lib/email", () => ({ layout: (o: { heading: string; lead?: string }) => ({ html: `<h1>${o.heading}</h1>`, text: `${o.heading}\n${o.lead ?? ""}` }), sendMail: async (m: (typeof mails)[number]) => void mails.push(m) }));

const { joinWaitlist, markStarted, mayStart, sendApproval, WaitlistError } = await import("../lib/access");

beforeEach(() => {
  rows.length = 0; alerts.length = 0; mails.length = 0;
  delete process.env.OPEN_SIGNUPS;
});

describe("who may start a trial", () => {
  it("only approved (or already started) emails, matched without caring about case", async () => {
    rows.push({ id: 1, email: "info@imperial.example", status: "approved" }, { id: 2, email: "new@x.example", status: "new" }, { id: 3, email: "old@x.example", status: "started" }, { id: 4, email: "no@x.example", status: "not_now" });
    expect(await mayStart("INFO@Imperial.example")).toBe(true);
    expect(await mayStart("old@x.example")).toBe(true);
    expect(await mayStart("new@x.example")).toBe(false);
    expect(await mayStart("no@x.example")).toBe(false);
    expect(await mayStart("stranger@x.example")).toBe(false);
  });

  it("an email with % or _ can't match someone else's approval", async () => {
    rows.push({ id: 1, email: "a_b@x.example", status: "approved" });
    expect(await mayStart("a%b@x.example")).toBe(false);
  });

  it("OPEN_SIGNUPS=on lets anyone start", async () => {
    process.env.OPEN_SIGNUPS = "on";
    expect(await mayStart("stranger@x.example")).toBe(true);
  });
});

describe("the waitlist", () => {
  it("a stranger is added once, the owner hears once, and they're told to wait", async () => {
    await expect(joinWaitlist("Stranger@x.example")).rejects.toBeInstanceOf(WaitlistError);
    await expect(joinWaitlist("stranger@x.example")).rejects.toMatchObject({ status: 403, code: "waitlist" });
    expect(rows).toEqual([{ id: 1, email: "stranger@x.example", status: "new", source: "signin" }]);
    expect(alerts).toHaveLength(1);
  });

  it("two requests at once (the app's first screens) add them once and alert once", async () => {
    // both looked before either saved: simulate by racing the lookups
    const a = joinWaitlist("race@x.example"), b = joinWaitlist("race@x.example");
    await expect(Promise.all([a, b])).rejects.toBeInstanceOf(WaitlistError);
    await Promise.allSettled([a, b]);
    expect(rows.filter((r) => r.email === "race@x.example")).toHaveLength(1);
    expect(alerts).toHaveLength(1);
  });

  it("someone already on the list (an outreach click) isn't added again or re-alerted", async () => {
    rows.push({ id: 1, email: "info@imperial.example", status: "new", source: "outreach" });
    await expect(joinWaitlist("info@imperial.example")).rejects.toBeInstanceOf(WaitlistError);
    expect(rows).toHaveLength(1);
    expect(alerts).toHaveLength(0);
  });

  it("starting a workspace marks them started", async () => {
    rows.push({ id: 1, email: "info@imperial.example", status: "approved" });
    await markStarted("Info@Imperial.example");
    expect(rows[0].status).toBe("started");
  });
});

describe("the approval email", () => {
  it("comes from admin@ and names them and their business", async () => {
    await sendApproval({ email: "info@imperial.example", business: "Imperial Heating", contact_name: "Sam" });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "info@imperial.example", subject: "Your Nightshift trial is ready", from: expect.stringContaining("<admin@nightshiftai.ca>") });
    expect(mails[0].text).toContain("You're in, Sam!");
    expect(mails[0].text).toContain("Imperial Heating");
  });
});
