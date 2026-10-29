import { route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// What the bots wrote for you: research reports, quotes, proposals, posts, SOPs.
export const GET = route(async (req, me) => {
  const bot = new URL(req.url).searchParams.get("bot") ?? undefined;
  const docs = await supabaseStore().documents(me.ws.id, { botId: bot, limit: 100 });
  return Response.json({ documents: docs.map(({ body, ...d }) => ({ ...d, preview: body.slice(0, 240) })) });
});
