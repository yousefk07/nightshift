import { route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";
import type { ActionStatus } from "@/lib/types";

// Approval cards. Default: the ones waiting for the owner.
export const GET = route(async (req, me) => {
  const status = (new URL(req.url).searchParams.get("status") ?? "pending") as ActionStatus | "all";
  const actions = await supabaseStore().actions(me.ws.id, status === "all" ? undefined : status);
  return Response.json({ actions });
});
