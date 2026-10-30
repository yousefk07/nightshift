import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";

// Trial interest from outreach emails. Each business gets its own link, /trial?t=<token>: the token carries who it
// was sent to (business, email, niche, city), signed so nobody can sign someone else up by editing it.

export interface Prospect { business: string; email: string; niche?: string | null; city?: string | null; contact_name?: string | null }

// INTEREST_KEY is its own secret so outreach links can be made on a laptop without the production ENCRYPTION_KEY
const secret = () => {
  const k = process.env.INTEREST_KEY || process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("INTEREST_KEY is not set");
  return createHmac("sha256", k).update("trial-interest").digest();
};
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 22);

export function interestToken(p: Prospect) {
  const body = Buffer.from(JSON.stringify({ b: p.business, e: p.email.toLowerCase(), n: p.niche ?? null, c: p.city ?? null, k: p.contact_name ?? null })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readInterestToken(t: string): Prospect | null {
  const [body, sig] = t.split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const j = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return { business: String(j.b ?? ""), email: String(j.e ?? ""), niche: j.n ?? null, city: j.c ?? null, contact_name: j.k ?? null };
  } catch {
    return null;
  }
}

export const interestLink = (p: Prospect, base = process.env.APP_URL || "https://www.nightshiftai.ca") => `${base}/trial?t=${interestToken(p)}`;
