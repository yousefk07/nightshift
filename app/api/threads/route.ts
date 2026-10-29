import { route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";
import type { BotKind } from "@/lib/types";

// The owner's past 1:1 conversations with a bot (?bot=inbox).
export const GET = route(async (req, me) => {
  const kind = new URL(req.url).searchParams.get("bot") as BotKind | null;
  const store = supabaseStore();
  const bot = kind ? await store.bot(me.ws.id, kind) : null;
  if (!bot) return Response.json({ error: "Say which bot: ?bot=inbox" }, { status: 400 });
  return Response.json({ threads: await store.threads(me.ws.id, bot.id) });
});
