import { requireWrite, route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// Release a hold: the team may contact them again.
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, me, { params }) => {
  requireWrite(me);
  const { id } = await params;
  const store = supabaseStore();
  await store.releaseHold(me.ws.id, id);
  await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "released_hold", target: id });
  return Response.json({ released: true });
});
