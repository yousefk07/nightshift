import { z } from "zod";
import { body, requireOwner, route } from "@/lib/auth";
import { limits } from "@/lib/plans";
import { admin, supabaseStore } from "@/lib/store-supabase";
import { inviteMember, ROLE_LABELS } from "@/lib/team";

// Team & security: members with their roles, open invites, seats used.
export const GET = route(async (_req, me) => {
  const store = supabaseStore();
  const [members, invites] = await Promise.all([
    store.members(me.ws.id),
    admin().from("invites").select("id, email, role, created_at, expires_at").eq("workspace_id", me.ws.id).is("accepted_at", null).order("created_at"),
  ]);
  const seats = members.filter((m) => m.role !== "viewer").length + (invites.data ?? []).filter((i) => i.role !== "viewer").length;
  return Response.json({
    members: members.map((m) => ({ user_id: m.user_id, email: m.email, name: m.full_name, role: m.role, role_label: ROLE_LABELS[m.role], you: m.user_id === me.userId })),
    invites: (invites.data ?? []).map((i) => ({ ...i, role_label: ROLE_LABELS[i.role as keyof typeof ROLE_LABELS], expired: new Date(i.expires_at) < new Date() })),
    seats: { used: seats, of: limits(me.ws).seats },
    roles: ROLE_LABELS,
  });
});

// "Invite person" (and "Resend": inviting the same address again replaces the old invite).
export const POST = route(async (req, me) => {
  requireOwner(me);
  const { email, role } = await body(req, (v) => z.object({ email: z.string().email(), role: z.enum(["approver", "approver_email", "viewer"]) }).parse(v));
  return Response.json(await inviteMember(supabaseStore(), me, email, role));
});

export const DELETE = route(async (req, me) => {
  requireOwner(me);
  const id = new URL(req.url).searchParams.get("invite");
  if (id) await admin().from("invites").delete().eq("workspace_id", me.ws.id).eq("id", id);
  return Response.json({ deleted: !!id });
});
