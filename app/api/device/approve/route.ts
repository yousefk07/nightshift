import { z } from "zod";
import { body, HttpError, requireWrite, route } from "@/lib/auth";
import { encrypt, newToken, sha256 } from "@/lib/crypto";
import { admin } from "@/lib/store-supabase";

// Step 2, in the browser (signed in): "Approve this device". Makes the token the CLI then collects.
export const POST = route(async (req, me) => {
  requireWrite(me);
  if (me.via !== "session") throw new HttpError(403, "Approve devices from the web app.");
  const { code, scope } = await body(req, (v) => z.object({ code: z.string().min(8).max(12), scope: z.enum(["full", "read"]).default("full") }).parse(v));
  const db = admin();
  const { data: row } = await db.from("device_codes").select("*").eq("user_code", code.toUpperCase()).maybeSingle();
  if (!row || new Date(row.expires_at) < new Date()) throw new HttpError(404, "That code expired. Run nightshift login again.");
  if (row.approved_at) throw new HttpError(409, "That device is already approved.");
  const token = newToken();
  await db.from("api_tokens").insert({ workspace_id: me.ws.id, user_id: me.userId, name: `CLI · ${row.device_name}`, scope, token_hash: sha256(token) });
  await db.from("device_codes").update({ approved_at: new Date().toISOString(), workspace_id: me.ws.id, user_id: me.userId, token_enc: encrypt({ token }) }).eq("device_code_hash", row.device_code_hash);
  return Response.json({ approved: row.device_name });
});
