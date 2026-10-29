import { route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

export const GET = route(async (req, me) => {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Response.json({ flags: await supabaseStore().flags(me.ws.id, { open: !all }) });
});
