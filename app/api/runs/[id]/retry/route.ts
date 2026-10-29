import { z } from "zod";
import { body, requireWrite, route } from "@/lib/auth";
import { scheduleRetry } from "@/lib/engine/flows";
import { zonedToUtc, localDate } from "@/lib/engine/schedule";
import { supabaseStore } from "@/lib/store-supabase";

// "Retry at 4 AM": try a failed or partial run again later (a local time today or tomorrow), or ?now.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, me, { params }) => {
  requireWrite(me);
  const { at } = await body(req, (v) => z.object({ at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }).parse(v ?? {}));
  let when = new Date();
  if (at) {
    const [y, m, d] = localDate(me.ws.timezone, new Date()).split("-").map(Number);
    const [h, mi] = at.split(":").map(Number);
    when = zonedToUtc(me.ws.timezone, y, m, d, h, mi);
    if (when <= new Date()) when = new Date(when.getTime() + 86_400_000);
  }
  return Response.json(await scheduleRetry(supabaseStore(), me.ws, (await params).id, when));
});
