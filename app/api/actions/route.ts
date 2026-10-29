import { route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";
import type { ActionStatus } from "@/lib/types";

const STATUSES: ActionStatus[] = ["pending", "sending", "executing", "done", "rejected", "undone", "failed", "revising"];

// Approval cards, oldest first. Default: the ones waiting (?status=done, ?status=all ...).
export const GET = route(async (req, me) => {
  const s = new URL(req.url).searchParams.get("status") ?? "pending";
  const status = s === "all" ? undefined : (s.split(",").filter((x) => STATUSES.includes(x as ActionStatus)) as ActionStatus[]);
  const actions = await supabaseStore().actions(me.ws.id, status);
  return Response.json({ actions: actions.map((a, i) => ({ n: i + 1, ...a })) });
});
