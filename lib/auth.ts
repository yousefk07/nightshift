import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { sha256 } from "./crypto";
import { defaultBots } from "./engine/flows";
import { admin, supabaseStore } from "./store-supabase";
import type { Role, Workspace } from "./types";

// Who is calling: the web app's Supabase session cookie, or a CLI/API token (Authorization: Bearer ns_...).
// Anyone can sign up (14-day trial); people invited to a workspace join it instead of getting their own.

export interface Caller {
  userId: string;
  email: string;
  ws: Workspace;
  role: Role;
  via: "session" | "token";
  scope: "full" | "read";
  aal: "aal1" | "aal2"; // aal2 = signed in with the second step (authenticator app)
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function sessionClient() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {} // read-only in some contexts; the session is refreshed on the next request
      },
    },
  });
}

async function membership(userId: string, wsId?: string | null) {
  const db = admin();
  let q = db.from("members").select("workspace_id, role").eq("user_id", userId).order("created_at").limit(1);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data } = await q.maybeSingle();
  return data as { workspace_id: string; role: Role } | null;
}

export async function caller(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") ?? "";
  const db = admin(), store = supabaseStore(db);

  if (/^Bearer\s+ns_/i.test(auth)) {
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const { data: row } = await db.from("api_tokens").select("id, user_id, workspace_id, scope").eq("token_hash", sha256(token)).maybeSingle();
    if (!row) throw new HttpError(401, "That token isn't valid. Run nightshift login again.");
    const m = await membership(row.user_id, row.workspace_id);
    if (!m) throw new HttpError(403, "You're no longer a member of this workspace.");
    const { data: u } = await db.auth.admin.getUserById(row.user_id);
    void db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id).then(() => {});
    return { userId: row.user_id, email: u.user?.email ?? "", ws: await store.workspace(row.workspace_id), role: m.role, via: "token", scope: row.scope, aal: "aal1" };
  }

  const supa = await sessionClient();
  const { data } = await supa.auth.getUser();
  if (!data.user?.email) throw new HttpError(401, "Sign in first.");
  const { data: aal } = await supa.auth.mfa.getAuthenticatorAssuranceLevel();
  const wanted = req.headers.get("x-workspace"); // members of several workspaces pick one
  const { ws, role } = await ensureWorkspace(data.user.id, data.user.email, wanted);
  return { userId: data.user.id, email: data.user.email, ws, role, via: "session", scope: "full", aal: aal?.currentLevel === "aal2" ? "aal2" : "aal1" };
}

// The caller's workspace. First sign-in: accept a waiting invite, or make a new workspace (onboarding fills it in).
export async function ensureWorkspace(userId: string, email: string, wanted?: string | null): Promise<{ ws: Workspace; role: Role }> {
  const db = admin(), store = supabaseStore(db);
  const m = await membership(userId, wanted);
  if (m) return { ws: await store.workspace(m.workspace_id), role: m.role };

  const { data: invite } = await db.from("invites").select("id, workspace_id, role").ilike("email", email).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (invite) {
    await db.from("members").upsert({ workspace_id: invite.workspace_id, user_id: userId, role: invite.role });
    await db.from("invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    await db.from("profiles").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    await store.log(invite.workspace_id, { actor_type: "user", actor_id: userId, action: "joined", target: email, data: { role: invite.role } });
    return { ws: await store.workspace(invite.workspace_id), role: invite.role };
  }

  const { data: ws, error } = await db.from("workspaces").insert({ billing_email: email }).select().single();
  if (error) throw new Error(error.message);
  await db.from("members").insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  await db.from("profiles").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  for (const b of defaultBots(ws)) await store.hireBot(ws.id, b);
  await store.room(ws.id);
  return { ws: await store.workspace(ws.id), role: "owner" };
}

// Guards for a route.
export const requireWrite = (me: Caller) => {
  if (me.scope === "read") throw new HttpError(403, "This token is read-only.");
  if (me.role === "viewer") throw new HttpError(403, "Viewers can look but not change anything.");
};
export const requireOwner = (me: Caller) => {
  requireWrite(me);
  if (me.role !== "owner") throw new HttpError(403, "Only the workspace owner can do this.");
};

// Wraps a route: works out the caller, turns thrown errors into JSON replies.
export function route<C = unknown>(fn: (req: Request, me: Caller, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    await connection(); // every API answer is per request: never prerendered at build time
    try {
      return await fn(req, await caller(req), ctx);
    } catch (e) {
      unstable_rethrow(e); // Next.js uses throws internally; those aren't ours to answer
      const status = e instanceof HttpError ? e.status : (e as { status?: number }).status ?? 500;
      if (status >= 500) console.error(e);
      return Response.json({ error: (e as Error).message }, { status });
    }
  };
}

// Same, for routes anyone may call (the CLI device flow, webhooks).
export function open<C = unknown>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    await connection();
    try {
      return await fn(req, ctx);
    } catch (e) {
      unstable_rethrow(e);
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      return Response.json({ error: (e as Error).message }, { status });
    }
  };
}

export async function body<T>(req: Request, parse: (v: unknown) => T): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  try {
    return parse(raw);
  } catch (e) {
    const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
    throw new HttpError(400, issues ? issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") : (e as Error).message);
  }
}
