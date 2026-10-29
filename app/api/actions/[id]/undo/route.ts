import { requireWrite, route } from "@/lib/auth";
import { undoAction } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

// "Undo · 8s": takes an approved card back before it goes out.
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, me, { params }) => {
  requireWrite(me);
  return Response.json(await undoAction(supabaseStore(), me.ws, (await params).id, me.userId));
});
