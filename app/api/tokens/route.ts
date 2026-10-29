import { z } from "zod";
import { body, HttpError, route } from "@/lib/auth";
import { newToken, sha256 } from "@/lib/crypto";
import { admin } from "@/lib/store-supabase";

// CLI tokens. Made from a signed-in browser session only (a token can't make more tokens); shown once.
export const GET = route(async (_req, me) => {
  const { data } = await admin().from("api_tokens").select("id, name, last_used_at, created_at").eq("user_id", me.userId).order("created_at", { ascending: false });
  return Response.json({ tokens: data ?? [] });
});

export const POST = route(async (req, me) => {
  if (me.via !== "session") throw new HttpError(403, "Make CLI tokens from the web app.");
  const { name } = await body(req, (v) => z.object({ name: z.string().min(1).max(40).default("CLI") }).parse(v ?? {}));
  const token = newToken();
  const { error } = await admin().from("api_tokens").insert({ workspace_id: me.ws.id, user_id: me.userId, name, token_hash: sha256(token) });
  if (error) throw new Error(error.message);
  return Response.json({ token, note: "Copy it now: it won't be shown again." });
});

export const DELETE = route(async (req, me) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "?id= is needed");
  await admin().from("api_tokens").delete().eq("id", id).eq("user_id", me.userId);
  return Response.json({ deleted: true });
});
