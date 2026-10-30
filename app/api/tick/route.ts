import { connection } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { tick } from "@/lib/engine/flows";
import { recordError } from "@/lib/errors";
import { briefs, connectionAlerts, dueRetries, errorDigest, purge, syncCrm } from "@/lib/maintenance";
import { supabaseStore } from "@/lib/store-supabase";

export const maxDuration = 300;

// Called every 5 minutes by pg_cron in Supabase (supabase/cron.sql), since Vercel's free plan only allows daily
// timers. Sends approved cards whose undo window passed, runs hand-offs, room jobs, revisions, retries and every
// bot whose shift is due, drafts and delivers morning briefs, syncs CRMs, raises broken-connection alerts, purges.
export async function POST(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !safeEqual(got, secret)) return Response.json({ error: "Not allowed" }, { status: 401 });
  const started = Date.now(), store = supabaseStore();
  const step = async <T,>(name: string, fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      await recordError(`tick: ${name}`, e);
      return `failed: ${(e as Error).message}`;
    }
  };
  const alerts = await step("alerts", () => connectionAlerts(store));
  const ran = await step("bots", () => tick(store, { deadlineMs: 200_000, retries: dueRetries }));
  const brief = await step("briefs", () => briefs(store));
  const crm = Date.now() - started < 240_000 ? await step("crm", () => syncCrm(store)) : "skipped";
  const purged = new Date().getUTCMinutes() < 5 ? await step("purge", () => purge()) : 0; // once an hour
  const errors = await step("errors", () => errorDigest()); // once a day, only if something went wrong
  return Response.json({ ran, brief, crm, alerts, purged, errors, ms: Date.now() - started });
}
