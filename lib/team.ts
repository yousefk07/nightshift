import { HttpError, type Caller } from "./auth";
import { newToken, sha256 } from "./crypto";
import { layout, sendMail } from "./email";
import { limits } from "./plans";
import type { Store } from "./store";
import { admin } from "./store-supabase";
import { exactly } from "./like";
import type { Role } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  approver: "Approver",
  approver_email: "Approver: email only",
  viewer: "Viewer",
};

// "Invite person": a 7-day invite by email. Seats count members and open invites, except viewers.
export async function inviteMember(store: Store, me: Caller, email: string, role: Exclude<Role, "owner">) {
  const db = admin();
  const [members, open] = await Promise.all([
    db.from("members").select("role").eq("workspace_id", me.ws.id),
    db.from("invites").select("role").eq("workspace_id", me.ws.id).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  const used = [...(members.data ?? []), ...(open.data ?? [])].filter((r) => r.role !== "viewer").length;
  if (role !== "viewer" && used >= limits(me.ws).seats) throw new HttpError(402, `All ${limits(me.ws).seats} seats are used. Add a seat to invite another approver.`);

  const token = newToken();
  await db.from("invites").delete().eq("workspace_id", me.ws.id).ilike("email", exactly(email)).is("accepted_at", null);
  const { error } = await db.from("invites").insert({ workspace_id: me.ws.id, email: email.toLowerCase(), role, token_hash: sha256(token), invited_by: me.userId });
  if (error) throw new Error(error.message);

  const { data: p } = await db.from("profiles").select("full_name").eq("user_id", me.userId).maybeSingle();
  const who = p?.full_name?.split(" ")[0] || me.email;
  const url = `${process.env.APP_URL ?? ""}/invite?token=${encodeURIComponent(token)}`;
  const can = role === "viewer" ? "see what the bots are working on" : role === "approver_email" ? "see what the bots are working on and approve email drafts" : "see what the bots are working on and approve their drafts, money included";
  const mail = layout({
    heading: `${who} invited you to ${me.ws.name}'s night shift`,
    paragraphs: [`You'll be able to ${can}. Nothing is sent without one of you saying yes.`],
    button: { label: "Accept invite", url },
    footer: "This invite expires in 7 days.",
  });
  await sendMail({ to: email, subject: `${who} invited you to ${me.ws.name}'s night shift`, ...mail });
  await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "invited", target: email, data: { role } });
  return { invited: email, role };
}

// Accepting from the email link while signed in (sign-in with the invited address also accepts it automatically).
export async function acceptInvite(token: string, userId: string, email: string) {
  const db = admin();
  const { data: inv } = await db.from("invites").select("*").eq("token_hash", sha256(token)).maybeSingle();
  if (!inv || inv.accepted_at) throw new HttpError(404, "This invite was already used or doesn't exist.");
  if (new Date(inv.expires_at) < new Date()) throw new HttpError(410, "This invite has expired. Ask for a new one.");
  if (inv.email.toLowerCase() !== email.toLowerCase()) throw new HttpError(403, `This invite is for ${inv.email}. Sign in with that address.`);
  await db.from("members").upsert({ workspace_id: inv.workspace_id, user_id: userId, role: inv.role });
  await db.from("invites").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
  return { workspace_id: inv.workspace_id as string, role: inv.role as Role };
}
