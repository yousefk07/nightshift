import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { HttpError, sessionClient } from "./auth";
import { PLANS, SEAT_PRICE } from "./plans";
import { admin } from "./store-supabase";

// The Nightshift admin: the people in ADMIN_EMAILS see every workspace, read-only. Signed in with a browser
// session only (never an API token), a confirmed email, and the authenticator step done.

export const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function requireAdmin() {
  const supa = await sessionClient();
  const { data } = await supa.auth.getUser();
  const u = data.user;
  if (!u?.email) throw new HttpError(401, "Sign in first.");
  if (!adminEmails().includes(u.email.toLowerCase()) || !u.email_confirmed_at) throw new HttpError(403, "This account isn't a Nightshift admin.");
  if (process.env.ADMIN_REQUIRE_2FA !== "0") {
    const { data: aal } = await supa.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") throw Object.assign(new HttpError(403, "Admins need the authenticator step. Turn it on in Settings → Security, then sign in again."), { code: "two_step" });
  }
  return { userId: u.id, email: u.email };
}

export function adminRoute<C = unknown>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    await connection();
    try {
      await requireAdmin();
      return await fn(req, ctx);
    } catch (e) {
      unstable_rethrow(e);
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      return Response.json({ error: (e as Error).message, code: (e as { code?: string }).code }, { status });
    }
  };
}

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const monthly = (plan: string, interval: string | null, seats: number) =>
  plan in PLANS ? (interval === "year" ? (PLANS[plan as keyof typeof PLANS].month * 10) / 12 : PLANS[plan as keyof typeof PLANS].month) + seats * SEAT_PRICE : 0;

async function users() {
  const { data, error } = await admin().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  return data.users.map((u) => ({ id: u.id, email: u.email ?? "", provider: u.app_metadata?.provider ?? "email", created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null }));
}

// Everything across all workspaces, for the admin overview and lists.
export async function adminOverview() {
  const db = admin();
  const [ws, members, people, bots, runs, usage, conns, pending] = await Promise.all([
    db.from("workspaces").select("id, name, industry, plan, plan_interval, trial_ends_at, extra_seats, billing_email, onboarded_at, deleted_at, created_at").order("created_at", { ascending: false }).limit(2000),
    db.from("members").select("workspace_id, user_id, role").limit(10000),
    users(),
    db.from("bots").select("workspace_id, enabled, status").limit(20000),
    db.from("runs").select("id, workspace_id, bot_id, status, trigger, model, cost_usd, error, created_at, finished_at").gte("created_at", days(30)).order("created_at", { ascending: false }).limit(5000),
    db.from("usage_days").select("workspace_id, day, cost_usd, searches").gte("day", days(30).slice(0, 10)).limit(20000),
    db.from("connections").select("workspace_id, provider, account, status, error, broken_at, last_synced_at, created_at").limit(10000),
    db.from("actions").select("workspace_id").eq("status", "pending").limit(10000),
  ]);
  for (const r of [ws, members, bots, runs, usage, conns, pending]) if (r.error) throw new Error(r.error.message);
  const emailOf = new Map(people.map((p) => [p.id, p.email]));
  const by = <T extends { workspace_id: string }>(rows: T[]) => rows.reduce((m, r) => m.set(r.workspace_id, [...(m.get(r.workspace_id) ?? []), r]), new Map<string, T[]>());
  const [mBy, bBy, rBy, uBy, cBy, pBy] = [by(members.data!), by(bots.data!), by(runs.data!), by(usage.data!), by(conns.data!), by(pending.data!)];
  const since7 = days(7), since1 = days(1), today = new Date().toISOString().slice(0, 10);

  const workspaces = ws.data!.map((w) => {
    const r = rBy.get(w.id) ?? [];
    const owner = (mBy.get(w.id) ?? []).find((m) => m.role === "owner");
    return {
      ...w,
      owner: owner ? emailOf.get(owner.user_id) ?? null : null,
      members: (mBy.get(w.id) ?? []).length,
      bots: (bBy.get(w.id) ?? []).length,
      bots_on: (bBy.get(w.id) ?? []).filter((b) => b.enabled).length,
      runs_7d: r.filter((x) => x.created_at >= since7).length,
      failed_7d: r.filter((x) => x.created_at >= since7 && x.status === "failed").length,
      spend_30d: sum((uBy.get(w.id) ?? []).map((u) => Number(u.cost_usd))),
      connections: (cBy.get(w.id) ?? []).map((c) => `${c.provider}${c.status === "ok" ? "" : " (broken)"}`),
      waiting: (pBy.get(w.id) ?? []).length,
      mrr: w.deleted_at ? 0 : monthly(w.plan, w.plan_interval, w.extra_seats),
      last_run_at: r[0]?.created_at ?? null,
    };
  });
  const live = workspaces.filter((w) => !w.deleted_at);
  const allRuns = runs.data!;
  return {
    totals: {
      users: people.length,
      workspaces: live.length,
      deleted: workspaces.length - live.length,
      trials: live.filter((w) => w.plan === "trial" && w.trial_ends_at > new Date().toISOString()).length,
      expired_trials: live.filter((w) => w.plan === "trial" && w.trial_ends_at <= new Date().toISOString()).length,
      paid: live.filter((w) => w.plan in PLANS).length,
      mrr: sum(live.map((w) => w.mrr)),
      signups_7d: people.filter((p) => p.created_at >= since7).length,
      runs_24h: allRuns.filter((r) => r.created_at >= since1).length,
      failed_24h: allRuns.filter((r) => r.created_at >= since1 && r.status === "failed").length,
      spend_today: sum(usage.data!.filter((u) => u.day === today).map((u) => Number(u.cost_usd))),
      spend_30d: sum(usage.data!.map((u) => Number(u.cost_usd))),
      broken_connections: conns.data!.filter((c) => c.status !== "ok").length,
      waiting: pending.data!.length,
    },
    by_plan: Object.fromEntries(["trial", "solo", "studio", "team", "canceled"].map((p) => [p, live.filter((w) => w.plan === p).length])),
    by_provider: conns.data!.reduce<Record<string, number>>((m, c) => ({ ...m, [c.provider]: (m[c.provider] ?? 0) + 1 }), {}),
    workspaces,
    users: people.map((p) => ({ ...p, workspaces: members.data!.filter((m) => m.user_id === p.id).map((m) => ({ id: m.workspace_id, role: m.role, name: ws.data!.find((w) => w.id === m.workspace_id)?.name ?? "?" })) })),
    failed_runs: allRuns.filter((r) => r.status === "failed").slice(0, 50).map((r) => ({ ...r, workspace: ws.data!.find((w) => w.id === r.workspace_id)?.name ?? "?" })),
  };
}

// One workspace in full: people, bots, connections (never their secrets), runs, the room, cards, activity, spend.
export async function adminWorkspace(id: string) {
  const db = admin();
  const { data: ws } = await db.from("workspaces").select("*").eq("id", id).maybeSingle();
  if (!ws) throw new HttpError(404, "No such workspace.");
  const { data: room } = await db.from("threads").select("id").eq("workspace_id", id).eq("kind", "room").maybeSingle();
  const [members, people, bots, conns, runs, messages, actions, activity, usage] = await Promise.all([
    db.from("members").select("user_id, role, created_at").eq("workspace_id", id),
    users(),
    db.from("bots").select("id, kind, name, enabled, approval, status, status_text, blocked_reason, next_run_at, last_run_at").eq("workspace_id", id).order("created_at"),
    db.from("connections").select("id, provider, kinds, account, scopes, status, error, broken_at, last_synced_at, created_at").eq("workspace_id", id),
    db.from("runs").select("id, bot_id, trigger, status, model, steps, cost_usd, input, summary, error, created_at, finished_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(60),
    room ? db.from("messages").select("id, role, kind, bot_id, content, created_at").eq("thread_id", room.id).order("created_at", { ascending: false }).limit(60) : Promise.resolve({ data: [] }),
    db.from("actions").select("id, bot_id, tool, risk, title, counterparty, amount_cents, currency, status, error, created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(60),
    db.from("activity").select("actor_type, action, target, why, at").eq("workspace_id", id).order("at", { ascending: false }).limit(100),
    db.from("usage_days").select("day, cost_usd, searches, research_seconds").eq("workspace_id", id).order("day", { ascending: false }).limit(30),
  ]);
  const { stripe_customer_id, stripe_subscription_id, counters: _c, ...rest } = ws;
  const emailOf = new Map(people.map((p) => [p.id, p.email]));
  return {
    workspace: { ...rest, stripe: { customer: stripe_customer_id, subscription: stripe_subscription_id } },
    members: (members.data ?? []).map((m) => ({ ...m, email: emailOf.get(m.user_id) ?? "?" })),
    bots: bots.data ?? [],
    connections: conns.data ?? [],
    runs: runs.data ?? [],
    room: ((messages.data ?? []) as { created_at: string }[]).reverse(),
    actions: actions.data ?? [],
    activity: activity.data ?? [],
    usage: usage.data ?? [],
  };
}
