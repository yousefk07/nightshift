import { z } from "zod";
import { body, HttpError, requireOwner, route } from "@/lib/auth";
import { admin, supabaseStore } from "@/lib/store-supabase";

type Ctx = { params: Promise<{ userId: string }> };

// Change someone's role ("Approver: email only" → "Approver"), or remove them.
export const PATCH = route<Ctx>(async (req, me, { params }) => {
  requireOwner(me);
  const { userId } = await params;
  if (userId === me.userId) throw new HttpError(400, "You can't change your own role.");
  const { role } = await body(req, (v) => z.object({ role: z.enum(["approver", "approver_email", "viewer"]) }).parse(v));
  const { error } = await admin().from("members").update({ role }).eq("workspace_id", me.ws.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  await supabaseStore().log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "changed_role", target: userId, data: { role } });
  return Response.json({ role });
});

export const DELETE = route<Ctx>(async (_req, me, { params }) => {
  requireOwner(me);
  const { userId } = await params;
  if (userId === me.userId) throw new HttpError(400, "The owner can't leave their own workspace.");
  await admin().from("members").delete().eq("workspace_id", me.ws.id).eq("user_id", userId);
  await admin().from("api_tokens").delete().eq("workspace_id", me.ws.id).eq("user_id", userId);
  await supabaseStore().log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "removed_member", target: userId });
  return Response.json({ removed: true });
});
