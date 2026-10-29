import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { body, HttpError, open, route } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { admin } from "@/lib/store-supabase";

// `nightshift login`, step 1: the CLI asks for a code, shows it, and opens the browser to approve this device.
// Each request remembers where it came from (shown on the approval page) and a network can ask for only a few
// codes at a time, so nobody can spray approval links at people.
const PER_IP = 8, WINDOW_MIN = 15;
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
const clean = (s: string) => s.replace(/[^\p{L}\p{N} ._()'-]/gu, "").trim().slice(0, 40) || "CLI";

export const POST = open(async (req) => {
  const { device } = await body(req, (v) => z.object({ device: z.string().max(60).default("CLI") }).parse(v ?? {}));
  const db = admin(), ip = ipOf(req);
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const recent = await db.from("device_codes").select("device_code_hash", { count: "exact", head: true }).eq("requester_ip", ip).gte("created_at", since);
  if (!recent.error && (recent.count ?? 0) >= PER_IP) throw new HttpError(429, `Too many sign-in codes from this network. Try again in ${WINDOW_MIN} minutes.`);

  const deviceCode = randomBytes(32).toString("base64url");
  const letters = "BCDFGHJKLMNPQRSTVWXZ";
  const userCode = Array.from({ length: 8 }, () => letters[randomInt(letters.length)]).join("").replace(/^(.{4})/, "$1-");
  const row = { device_code_hash: sha256(deviceCode), user_code: userCode, device_name: clean(device) };
  let { error } = await db.from("device_codes").insert({ ...row, requester_ip: ip, requester_agent: (req.headers.get("user-agent") ?? "").slice(0, 120) });
  if (error && /requester_|column/.test(error.message)) ({ error } = await db.from("device_codes").insert(row)); // before migration 0003
  if (error) throw new Error(error.message);
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  return Response.json({ device_code: deviceCode, user_code: userCode, verification_url: `${base}/device?code=${userCode}`, interval: 3, expires_in: 600 });
});

// The approval page asks what it's approving: the device's name, when and from where it asked.
export const GET = route(async (req) => {
  const code = (new URL(req.url).searchParams.get("code") ?? "").toUpperCase();
  if (!/^[A-Z]{4}-[A-Z]{4}$/.test(code)) throw new HttpError(400, "That isn't a sign-in code.");
  const { data: row } = await admin().from("device_codes").select("*").eq("user_code", code).maybeSingle();
  if (!row || new Date(row.expires_at) < new Date()) throw new HttpError(404, "That code expired. Run nightshift login again.");
  return Response.json({ device: row.device_name, requested_at: row.created_at ?? null, from: row.requester_ip ?? null, agent: row.requester_agent ?? null, expires_at: row.expires_at, approved: !!row.approved_at });
});
