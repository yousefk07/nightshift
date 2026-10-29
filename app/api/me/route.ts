import { route } from "@/lib/auth";
import { localDate } from "@/lib/engine/schedule";
import { isActive, limits, planOf, trialPaused } from "@/lib/plans";
import { admin, supabaseStore } from "@/lib/store-supabase";

// Everything the app needs on load: who you are, the workspace, the plan, what's connected, today's spend.
export const GET = route(async (_req, me) => {
  const store = supabaseStore();
  const count = (table: string, f: (q: any) => any) => f(admin().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", me.ws.id)).then((r: { count: number | null }) => r.count ?? 0);
  const [conns, pending, flags, profile, unread] = await Promise.all([
    store.connectionList(me.ws.id),
    count("actions", (q) => q.eq("status", "pending")),
    count("flags", (q) => q.is("resolved_at", null)),
    admin().from("profiles").select("full_name, avatar_url, phone, working_hours, signature").eq("user_id", me.userId).maybeSingle(),
    admin().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", me.userId).is("read_at", null),
  ]);
  const { stripe_customer_id: _c, stripe_subscription_id: _s, counters: _n, ...ws } = me.ws as typeof me.ws & { counters?: unknown };
  return Response.json({
    user: { id: me.userId, email: me.email, role: me.role, two_step: me.aal === "aal2", ...profile.data },
    workspace: ws,
    plan: { name: planOf(me.ws.plan), active: isActive(me.ws), trial_paused: trialPaused(me.ws), limits: limits(me.ws), trial_ends_at: me.ws.plan === "trial" ? me.ws.trial_ends_at : null },
    connections: conns,
    search: !!process.env.TAVILY_API_KEY,
    waiting: pending,
    open_flags: flags,
    unread_notifications: unread.count ?? 0,
    spent_today_usd: await store.usageToday(me.ws.id, localDate(me.ws.timezone, new Date())),
  });
});
