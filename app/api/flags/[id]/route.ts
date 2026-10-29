import { requireWrite, route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// Mark a flag as dealt with.
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, me, { params }) => {
  requireWrite(me);
  const { id } = await params;
  await supabaseStore().resolveFlag(me.ws.id, id);
  return Response.json({ resolved: true });
});
