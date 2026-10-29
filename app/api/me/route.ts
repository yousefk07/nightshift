import { route } from "@/lib/auth";
import { localDate } from "@/lib/engine/schedule";
import { isActive, limits, planOf } from "@/lib/plans";
import { admin, supabaseStore } from "@/lib/store-supabase";

// Everything the app needs on load: who you are, the workspace, the plan, what's connected, today's spend.
export const GET = route(async (_req, me) => {
  const store = supabaseStore();
  const [conns, pending, flags, profile, unread] = await Promise.all([
    store.connections(me.ws.id),
    store.actions(me.ws.id, "pending"),
    store.flags(me.ws.id, { open: true }),
    admin().from("profiles").select("full_name, avatar_url, phone, working_hours, signature").eq("user_id", me.userId).maybeSingle(),
    admin().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", me.userId).is("read_at", null),
  ]);
  const { stripe_customer_id: _c, stripe_subscription_id: _s, counters: _n, ...ws } = me.ws as typeof me.ws & { counters?: unknown };
  return Response.json({
    user: { id: me.userId, email: me.email, role: me.role, two_step: me.aal === "aal2", ...profile.data },
    workspace: ws,
    plan: { name: planOf(me.ws.plan), active: isActive(me.ws), limits: limits(me.ws), trial_ends_at: me.ws.plan === "trial" ? me.ws.trial_ends_at : null },
    connections: conns.map(({ secret: _secret, ...c }) => c),
    search: !!process.env.TAVILY_API_KEY,
    waiting: pending.length,
    open_flags: flags.length,
    unread_notifications: unread.count ?? 0,
    spent_today_usd: await store.usageToday(me.ws.id, localDate(me.ws.timezone, new Date())),
  });
});
