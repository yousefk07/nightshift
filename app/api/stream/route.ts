import { caller, HttpError } from "@/lib/auth";
import { connection } from "next/server";
import { admin } from "@/lib/store-supabase";

export const maxDuration = 300;

// Live updates as server-sent events: new room and chat messages, approval cards changing, bot status (typing,
// working, needs you) and notifications. The browser can also use Supabase Realtime; the CLI uses this.
// Polls the database every 2 seconds and closes after ~4.5 minutes (EventSource reconnects on its own).
export async function GET(req: Request) {
  await connection();
  let me;
  try {
    me = await caller(req);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof HttpError ? e.status : 500 });
  }
  const ws = me.ws.id, db = admin();
  const enc = new TextEncoder();
  let since = new URL(req.url).searchParams.get("since") ?? new Date().toISOString();
  const statuses = new Map<string, string>();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const until = Date.now() + 270_000;
      send("hello", { at: since });
      while (Date.now() < until && !req.signal.aborted) {
        const now = new Date().toISOString();
        const [msgs, acts, bots, notes] = await Promise.all([
          db.from("messages").select("*").eq("workspace_id", ws).gt("created_at", since).order("created_at").limit(100),
          db.from("actions").select("id, bot_id, title, risk, status, send_after, amount_cents, currency, counterparty, created_at").eq("workspace_id", ws).gt("decided_at", since).limit(100),
          db.from("bots").select("id, kind, name, status, status_text, enabled").eq("workspace_id", ws),
          db.from("notifications").select("*").eq("user_id", me.userId).gt("created_at", since).limit(20),
        ]);
        for (const m of msgs.data ?? []) send("message", m);
        for (const a of acts.data ?? []) send("action", a);
        const fresh = await db.from("actions").select("id, bot_id, title, risk, status, amount_cents, currency, counterparty, group_key, created_at").eq("workspace_id", ws).eq("status", "pending").gt("created_at", since);
        for (const a of fresh.data ?? []) send("action", a);
        for (const b of bots.data ?? []) {
          const key = `${b.status}|${b.status_text}|${b.enabled}`;
          if (statuses.get(b.id) !== key) {
            statuses.set(b.id, key);
            send("bot", b);
          }
        }
        for (const n of notes.data ?? []) send("notification", n);
        since = now;
        send("ping", { at: now });
        await new Promise((r) => setTimeout(r, 2000));
      }
      try { controller.close(); } catch {}
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
