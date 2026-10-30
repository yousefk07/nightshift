import { z } from "zod";
import { sendApproval } from "@/lib/access";
import { adminRoute } from "@/lib/admin";
import { body, HttpError } from "@/lib/auth";
import { admin } from "@/lib/store-supabase";

// Trial interest: approve someone (they may start a workspace and get the "your trial is ready" email), or mark
// them contacted / not now.
export const PATCH = adminRoute(async (req) => {
  const { id, status } = await body(req, (v) => z.object({ id: z.number().int(), status: z.enum(["new", "contacted", "approved", "not_now"]) }).parse(v));
  const db = admin();
  const { data: p } = await db.from("trial_interest").select("email, business, contact_name, status").eq("id", id).maybeSingle();
  if (!p) throw new HttpError(404, "No such person on the list.");
  if (p.status === "started") throw new HttpError(409, "They've already started their trial.");
  const { error } = await db.from("trial_interest").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  if (status === "approved" && p.status !== "approved") await sendApproval(p);
  return Response.json({ ok: true, status, emailed: status === "approved" && p.status !== "approved" });
});
