import { route } from "@/lib/auth";
import { limits } from "@/lib/plans";
import { supabaseStore } from "@/lib/store-supabase";

// The activity log: every bot action and approval, who did it and why. Kept for as long as the plan says.
export const GET = route(async (req, me) => {
  const p = new URL(req.url).searchParams;
  const store = supabaseStore();
  const [rows, bots, members] = await Promise.all([store.activity(me.ws.id, { limit: Math.min(Number(p.get("limit")) || 100, 500), before: p.get("before") ?? undefined }), store.bots(me.ws.id), store.members(me.ws.id)]);
  const who = (type: string, id: string | null) => (type === "bot" ? bots.find((b) => b.id === id)?.name : type === "user" ? members.find((m) => m.user_id === id)?.full_name || members.find((m) => m.user_id === id)?.email : "Nightshift") ?? "Someone";
  return Response.json({ kept_days: limits(me.ws).logDays, activity: rows.map((r) => ({ ...r, who: who(r.actor_type, r.actor_id) })) });
});
