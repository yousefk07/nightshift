import { beforeAll, describe, expect, it } from "vitest";
import { interestLink, interestToken, readInterestToken } from "../lib/interest";

// The outreach link signs who it was sent to, so editing it can't sign someone else up.
describe("trial interest links", () => {
  beforeAll(() => { process.env.ENCRYPTION_KEY ||= "test-key-for-interest-links"; });
  const p = { business: "Maple Street Bakery", email: "Hello@Maple.example", niche: "bakery", city: "Markham" };

  it("reads back what it signed, email lower-cased", () => {
    expect(readInterestToken(interestToken(p))).toEqual({ ...p, email: "hello@maple.example", contact_name: null });
  });

  it("rejects an edited token", () => {
    const [body, sig] = interestToken(p).split(".");
    const other = Buffer.from(JSON.stringify({ b: "Someone Else", e: "x@y.example" })).toString("base64url");
    expect(readInterestToken(`${other}.${sig}`)).toBeNull();
    expect(readInterestToken(`${body}.${sig.slice(0, -1)}A`)).toBeNull();
    expect(readInterestToken("nonsense")).toBeNull();
  });

  it("builds a /trial link", () => {
    expect(interestLink(p, "https://www.nightshiftai.ca")).toMatch(/^https:\/\/www\.nightshiftai\.ca\/trial\?t=[\w-]+\.[\w-]{22}$/);
  });
});
