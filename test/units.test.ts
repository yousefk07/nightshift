import { describe, expect, it } from "vitest";
import { decrypt, encrypt, readState, signState } from "../lib/crypto";
import { cost, isPeak, price, readStream } from "../lib/deepseek";
import { rawMessage } from "../lib/connectors/google";
import { htmlToText, stripQuoted } from "../lib/connectors/mail";
import { nextRun, zonedToUtc } from "../lib/engine/schedule";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

describe("schedule", () => {
  it("daily runs follow the local clock across the November clock change", () => {
    // Toronto leaves daylight time on Sunday 1 Nov 2026: 07:00 is 11:00 UTC before, 12:00 UTC after.
    expect(nextRun({ dailyAt: "07:00" }, "America/Toronto", new Date("2026-10-31T12:00:00Z"))!.toISOString()).toBe("2026-11-01T12:00:00.000Z");
    expect(nextRun({ dailyAt: "07:00" }, "America/Toronto", new Date("2026-10-30T10:00:00Z"))!.toISOString()).toBe("2026-10-30T11:00:00.000Z");
    expect(nextRun({ dailyAt: "07:00" }, "America/Toronto", new Date("2026-11-02T13:00:00Z"))!.toISOString()).toBe("2026-11-03T12:00:00.000Z");
  });
  it("late evening in Toronto is already tomorrow in UTC", () => {
    expect(nextRun({ dailyAt: "09:00" }, "America/Toronto", new Date("2026-10-30T02:30:00Z"))!.toISOString()).toBe("2026-10-30T13:00:00.000Z");
    expect(zonedToUtc("Asia/Tokyo", 2026, 1, 1, 0, 0).toISOString()).toBe("2025-12-31T15:00:00.000Z");
  });
  it("interval and on-demand schedules", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    expect(nextRun({ everyMinutes: 15 }, "UTC", now)!.toISOString()).toBe("2026-10-29T12:15:00.000Z");
    expect(nextRun(null, "UTC", now)).toBeNull();
  });
});

describe("deepseek pricing and stream", () => {
  it("is half price off-peak", () => {
    const peak = new Date("2026-10-29T07:00:00Z"); // Thursday
    const off = new Date("2026-10-29T14:00:00Z");
    expect(isPeak(peak)).toBe(true);
    expect(isPeak(new Date("2026-10-31T07:00:00Z"))).toBe(false); // Saturday
    expect(price("flash", off).in).toBeCloseTo(price("flash", peak).in / 2);
    expect(cost("flash", { hit: 0, miss: 1_000_000, out: 0 }, peak)).toBeCloseTo(0.3);
    expect(cost("pro", { hit: 1_000_000, miss: 0, out: 1_000_000 }, off)).toBeCloseTo((0.044 + 3.96) / 2);
  });
  it("puts tool calls back together from their pieces", async () => {
    const lines = [
      { choices: [{ delta: { content: "Let me " } }] },
      { choices: [{ delta: { content: "check." } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "search_", arguments: '{"que' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "email", arguments: 'ry":"acme"}' } }] } }] },
      { choices: [], usage: { prompt_tokens: 50, prompt_cache_hit_tokens: 30, completion_tokens: 9 } },
    ];
    const body = new Blob([lines.map((l) => `data: ${JSON.stringify(l)}\n`).join("\n") + "data: [DONE]"]).stream();
    const seen: string[] = [];
    const r = await readStream(body, "m", (d) => seen.push(d));
    expect(r.content).toBe("Let me check.");
    expect(seen).toEqual(["Let me ", "check."]);
    expect(r.toolCalls).toEqual([{ id: "c1", type: "function", function: { name: "search_email", arguments: '{"query":"acme"}' } }]);
    expect(r.usage).toEqual({ hit: 30, miss: 20, out: 9 });
  });
});

describe("crypto", () => {
  it("encrypts secrets so they round-trip and can't be altered", () => {
    const blob = encrypt({ key: "rk_live_abc" });
    expect(blob).not.toContain("rk_live");
    expect(decrypt(blob)).toEqual({ key: "rk_live_abc" });
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("OAuth state is signed and expires", () => {
    const s = signState({ ws: "w1" });
    expect(readState(s)).toMatchObject({ ws: "w1" });
    expect(() => readState(s.slice(0, -2) + "xx")).toThrow(/Bad state/);
    expect(() => readState(signState({ ws: "w1" }, -1))).toThrow(/expired/);
  });
});

describe("mail helpers", () => {
  it("builds a reply Gmail accepts", () => {
    const raw = Buffer.from(rawMessage({ to: "ana@acme.test", subject: "Re: Café order", body: "Merci!", inReplyTo: "<abc@acme.test>" }), "base64url").toString();
    expect(raw).toContain("To: ana@acme.test");
    expect(raw).toContain("In-Reply-To: <abc@acme.test>");
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from("Re: Café order").toString("base64")}?=`);
    expect(raw.endsWith("\r\n\r\nMerci!")).toBe(true);
  });
  it("reads HTML mail as text and drops quoted history", () => {
    expect(htmlToText("<p>Hi&nbsp;there</p><style>p{}</style><div>Line 2</div>")).toBe("Hi there\nLine 2");
    expect(stripQuoted("Sounds good.\n\nOn Mon, 26 Oct 2026, Ana <ana@acme.test> wrote:\n> Thursday?")).toBe("Sounds good.");
  });
});
