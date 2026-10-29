import { route } from "@/lib/auth";
import { localDate } from "@/lib/engine/schedule";
import { supabaseStore } from "@/lib/store-supabase";

// The morning brief for a day (default today): a draft that Dawn keeps rewriting until it's delivered
// ("by Dawn · final at 6:30"), then final.
export const GET = route(async (req, me) => {
  const date = new URL(req.url).searchParams.get("date") ?? localDate(me.ws.timezone, new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "date is YYYY-MM-DD" }, { status: 400 });
  return Response.json({ date, final_at: me.ws.brief_prefs.time, brief: await supabaseStore().brief(me.ws.id, date) });
});
