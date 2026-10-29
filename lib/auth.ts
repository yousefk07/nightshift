import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { sha256 } from "./crypto";
import { defaultBots } from "./engine/flows";
import { admin, supabaseStore } from "./store-supabase";
import type { Workspace } from "./types";

// Who is calling: the web app's Supabase session cookie, or a CLI token (Authorization: Bearer ns_...).
// v1 is invite-only: ALLOWED_EMAILS lists who may use it.

export interface Caller {
  userId: string;
  email: string;
  ws: Workspace;
  via: "session" | "token";
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const allowed = (email: string) =>
  (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

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

export async function caller(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") ?? "";
  const db = admin();

  if (/^Bearer\s+ns_/i.test(auth)) {
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const { data: row } = await db.from("api_tokens").select("id, user_id, workspace_id").eq("token_hash", sha256(token)).maybeSingle();
    if (!row) throw new HttpError(401, "That token isn't valid. Make a new one in Settings → CLI.");
    const { data: u } = await db.auth.admin.getUserById(row.user_id);
    const email = u.user?.email ?? "";
    if (!allowed(email)) throw new HttpError(403, "This account isn't on the invite list.");
    void db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id).then(() => {});
    return { userId: row.user_id, email, ws: await supabaseStore().workspace(row.workspace_id), via: "token" };
  }

  const { data } = await (await sessionClient()).auth.getUser();
  if (!data.user?.email) throw new HttpError(401, "Sign in first.");
  if (!allowed(data.user.email)) throw new HttpError(403, "This account isn't on the invite list.");
  return { userId: data.user.id, email: data.user.email, ws: await ensureWorkspace(data.user.id), via: "session" };
}

// The caller's workspace, made (with its four bots) the first time they sign in.
export async function ensureWorkspace(userId: string): Promise<Workspace> {
  const db = admin(), store = supabaseStore(db);
  const { data: m } = await db.from("members").select("workspace_id").eq("user_id", userId).order("created_at").limit(1).maybeSingle();
  if (m) return store.workspace(m.workspace_id);
  const { data: ws, error } = await db.from("workspaces").insert({}).select().single();
  if (error) throw new Error(error.message);
  await db.from("members").insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  await db.from("bots").insert(defaultBots(ws).map((b) => ({ ...b, workspace_id: ws.id })));
  await store.room(ws.id);
  return store.workspace(ws.id);
}

// Wraps a route: works out the caller, turns thrown errors into JSON replies.
export function route<C = unknown>(fn: (req: Request, me: Caller, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    await connection(); // every API answer is per request: never prerendered at build time
    try {
      return await fn(req, await caller(req), ctx);
    } catch (e) {
      unstable_rethrow(e); // Next.js uses throws internally; those aren't ours to answer
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return Response.json({ error: (e as Error).message }, { status });
    }
  };
}

export async function body<T>(req: Request, parse: (v: unknown) => T): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Send JSON.");
  }
  try {
    return parse(raw);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}
