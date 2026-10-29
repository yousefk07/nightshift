import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { body, open } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { admin } from "@/lib/store-supabase";

// `nightshift login`, step 1: the CLI asks for a code, shows it, and opens the browser to approve this device.
export const POST = open(async (req) => {
  const { device } = await body(req, (v) => z.object({ device: z.string().max(60).default("CLI") }).parse(v ?? {}));
  const deviceCode = randomBytes(32).toString("base64url");
  const letters = "BCDFGHJKLMNPQRSTVWXZ";
  const userCode = Array.from({ length: 8 }, () => letters[randomInt(letters.length)]).join("").replace(/^(.{4})/, "$1-");
  const { error } = await admin().from("device_codes").insert({ device_code_hash: sha256(deviceCode), user_code: userCode, device_name: device });
  if (error) throw new Error(error.message);
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  return Response.json({ device_code: deviceCode, user_code: userCode, verification_url: `${base}/device?code=${userCode}`, interval: 3, expires_in: 600 });
});
