import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Connection secrets (OAuth tokens, Stripe and Shopify keys) are stored AES-256-GCM encrypted.
// ENCRYPTION_KEY: 32 random bytes, base64 (openssl rand -base64 32).
function key() {
  const k = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt<T = Record<string, unknown>>(blob: string): T {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8"));
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// CLI tokens: "ns_" + 32 random bytes. Only the hash is stored.
export const newToken = () => "ns_" + randomBytes(32).toString("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Signed, expiring state for OAuth redirects, so a callback can only finish a connect this server started.
export function signState(payload: Record<string, unknown>, ttlMs = 10 * 60_000) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs, n: randomBytes(8).toString("hex") })).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readState<T = Record<string, unknown>>(state: string): T {
  const [body, sig] = state.split(".");
  const want = createHmac("sha256", key()).update(body ?? "").digest("base64url");
  if (!body || !sig || !safeEqual(sig, want)) throw new Error("Bad state");
  const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (p.exp < Date.now()) throw new Error("This link expired. Try connecting again.");
  return p as T;
}
