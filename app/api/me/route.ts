import { route } from "@/lib/auth";
import { localDate } from "@/lib/engine/schedule";
import { supabaseStore } from "@/lib/store-supabase";

// Everything the app needs on load: the workspace, the team, what's connected, today's spend.
export const GET = route(async (_req, me) => {
  const store = supabaseStore();
  const [bots, conns, pending, flags] = await Promise.all([store.bots(me.ws.id), store.connections(me.ws.id), store.actions(me.ws.id, "pending"), store.flags(me.ws.id, { open: true })]);
  const today = localDate(me.ws.timezone, new Date());
  return Response.json({
    email: me.email,
    workspace: me.ws,
    bots,
    connections: conns.map(({ secret: _secret, ...c }) => c),
    search: !!process.env.TAVILY_API_KEY,
    pending: pending.length,
    open_flags: flags.length,
    spent_today_usd: await store.usageToday(me.ws.id, today),
  });
});
