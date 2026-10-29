import { safeEqual } from "@/lib/crypto";
import { tick } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

export const maxDuration = 300;

// Called every 5 minutes by pg_cron in Supabase (supabase/cron.sql), since Vercel's free plan only allows daily timers.
// Runs hand-offs and room mentions, then every bot whose schedule is due.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !safeEqual(got, secret)) return Response.json({ error: "Not allowed" }, { status: 401 });
  const started = Date.now();
  const done = await tick(supabaseStore(), { deadlineMs: 250_000 });
  return Response.json({ ran: done, ms: Date.now() - started });
}
