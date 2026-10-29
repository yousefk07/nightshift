import { route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// Recent runs, newest first (?bot=<bot id> for one bot): what each bot did, its tokens and cost.
export const GET = route(async (req, me) => {
  const p = new URL(req.url).searchParams;
  const runs = await supabaseStore().runs(me.ws.id, { botId: p.get("bot") ?? undefined, limit: Math.min(Number(p.get("limit")) || 50, 200) });
  return Response.json({ runs });
});
