import { z } from "zod";
import { body, open } from "@/lib/auth";
import { decrypt, sha256 } from "@/lib/crypto";
import { admin } from "@/lib/store-supabase";

// Step 3: the CLI polls until the device is approved, then gets its token, once.
export const POST = open(async (req) => {
  const { device_code } = await body(req, (v) => z.object({ device_code: z.string().min(20) }).parse(v));
  const db = admin();
  const { data: row } = await db.from("device_codes").select("*").eq("device_code_hash", sha256(device_code)).maybeSingle();
  if (!row || new Date(row.expires_at) < new Date()) return Response.json({ error: "expired" }, { status: 410 });
  if (!row.approved_at || !row.token_enc) return Response.json({ pending: true }, { status: 202 });
  await db.from("device_codes").delete().eq("device_code_hash", row.device_code_hash); // handed over once
  return Response.json({ token: decrypt<{ token: string }>(row.token_enc).token });
});
