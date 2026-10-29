import { z } from "zod";
import { body, HttpError, route, requireStrongSession } from "@/lib/auth";
import { newToken, sha256 } from "@/lib/crypto";
import { limits } from "@/lib/plans";
import { admin } from "@/lib/store-supabase";

// API keys and CLI devices ("Key or device / Scope / Last used / Revoke"). Made from a signed-in browser session
// only (a token can't make more tokens) and shown once. The CLI usually gets one through nightshift login instead.
export const GET = route(async (_req, me) => {
  const { data } = await admin().from("api_tokens").select("id, name, scope, last_used_at, created_at").eq("user_id", me.userId).order("created_at", { ascending: false });
  return Response.json({ tokens: data ?? [] });
});

export const POST = route(async (req, me) => {
  await requireStrongSession(me);
  const { name, scope } = await body(req, (v) => z.object({ name: z.string().min(1).max(40).default("API key"), scope: z.enum(["full", "read"]).default("read") }).parse(v ?? {}));
  // the pricing table: full-access API keys are part of Team; read-only ones (to try things) and the CLI work on every plan
  if (scope === "full" && !limits(me.ws).api) throw new HttpError(403, "Full-access API keys come with the Team plan. Read-only keys and the CLI (nightshift login) work on every plan.");
  const token = newToken();
  const { error } = await admin().from("api_tokens").insert({ workspace_id: me.ws.id, user_id: me.userId, name, scope, token_hash: sha256(token) });
  if (error) throw new Error(error.message);
  return Response.json({ token, note: "Copy it now: it won't be shown again." });
});

export const DELETE = route(async (req, me) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "?id= is needed");
  await admin().from("api_tokens").delete().eq("id", id).eq("user_id", me.userId);
  return Response.json({ deleted: true });
});
