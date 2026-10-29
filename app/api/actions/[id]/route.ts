import { z } from "zod";
import { body, route } from "@/lib/auth";
import { decideAction } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

const Decide = z.object({
  decision: z.enum(["approve", "reject"]),
  payload: z.record(z.string(), z.unknown()).optional(), // the card's fields after the owner edited them
});

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, me, { params }) => {
  const { id } = await params;
  const { decision, payload } = await body(req, (v) => Decide.parse(v));
  return Response.json(await decideAction(supabaseStore(), me.ws, id, decision, me.userId, payload));
});
