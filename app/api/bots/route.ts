import { z } from "zod";
import { body, HttpError, requireOwner, route } from "@/lib/auth";
import { isTemplate } from "@/lib/bots";
import { hire } from "@/lib/engine/flows";
import { limits } from "@/lib/plans";
import { supabaseStore } from "@/lib/store-supabase";

// The team. POST {kind} hires a bot from the catalog (within the plan's bot count).
export const GET = route(async (_req, me) => Response.json({ bots: await supabaseStore().bots(me.ws.id) }));

export const POST = route(async (req, me) => {
  requireOwner(me);
  const { kind } = await body(req, (v) => z.object({ kind: z.string().refine(isTemplate, "Unknown bot") }).parse(v));
  const store = supabaseStore();
  const team = await store.bots(me.ws.id);
  if (team.some((b) => b.kind === kind)) throw new HttpError(409, "That bot is already on your team.");
  const max = limits(me.ws).bots;
  if (team.length >= max) throw new HttpError(402, `Your plan includes ${max} bots. Upgrade to hire more.`);
  return Response.json({ bot: await hire(store, me.ws, kind, me.userId) });
});
