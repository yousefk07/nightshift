import webpush from "web-push";
import { admin } from "./store-supabase";

// Web push to a member's subscribed devices. Dead subscriptions (410/404) are removed.
let configured = false;
function setup() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@nightshift.app", pub, priv);
  configured = true;
  return true;
}

export async function pushToUser(ws: string, userId: string, payload: { title: string; body: string; url?: string }) {
  if (!setup()) return 0;
  const db = admin();
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, keys").eq("workspace_id", ws).eq("user_id", userId);
  let ok = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3600 });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return ok;
}
