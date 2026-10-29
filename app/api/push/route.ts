import { z } from "zod";
import { body, route } from "@/lib/auth";
import { admin } from "@/lib/store-supabase";

// Phone and laptop alerts (web push). GET gives the public key the browser subscribes with.
export const GET = route(async () => Response.json({ public_key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null }));

const Sub = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  device: z.string().max(80).optional(),
});

export const POST = route(async (req, me) => {
  const s = await body(req, (v) => Sub.parse(v));
  const { error } = await admin().from("push_subscriptions").upsert({ workspace_id: me.ws.id, user_id: me.userId, endpoint: s.endpoint, keys: s.keys, device: s.device ?? "" }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
  return Response.json({ subscribed: true });
});

export const DELETE = route(async (req, me) => {
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (endpoint) await admin().from("push_subscriptions").delete().eq("user_id", me.userId).eq("endpoint", endpoint);
  return Response.json({ unsubscribed: !!endpoint });
});
