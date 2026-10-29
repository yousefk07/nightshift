import { after } from "next/server";
import { z } from "zod";
import { body, HttpError, requireWrite, route } from "@/lib/auth";
import { approveAction, executeDue, rejectAction, UNDO_SECONDS } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

export const maxDuration = 60;

// "Approve both", "Approve & send both", `nightshift approve 1 2`: several cards at once, by id or by queue number.
const Batch = z.object({
  decision: z.enum(["approve", "discard"]),
  ids: z.array(z.string().uuid()).optional(),
  numbers: z.array(z.number().int().positive()).optional(),
  group: z.string().optional(), // every waiting card in a group
}).refine((b) => b.ids?.length || b.numbers?.length || b.group, "Say which cards: ids, numbers or group");

export const POST = route(async (req, me) => {
  requireWrite(me);
  const b = await body(req, (v) => Batch.parse(v));
  const store = supabaseStore();
  const pending = await store.actions(me.ws.id, "pending");
  const picked = new Set<string>(b.ids ?? []);
  for (const n of b.numbers ?? []) {
    const a = pending[n - 1];
    if (!a) throw new HttpError(404, `There's no item ${n} in the queue.`);
    picked.add(a.id);
  }
  if (b.group) pending.filter((a) => a.group_key === b.group).forEach((a) => picked.add(a.id));
  const results = [];
  for (const id of picked) {
    try {
      const r = b.decision === "approve" ? await approveAction(store, me.ws, id, me) : await rejectAction(store, me.ws, id, me);
      results.push({ id, title: pending.find((a) => a.id === id)?.title, ...r });
    } catch (e) {
      results.push({ id, title: pending.find((a) => a.id === id)?.title, error: (e as Error).message });
    }
  }
  if (b.decision === "approve") after(async () => {
    await new Promise((ok) => setTimeout(ok, UNDO_SECONDS * 1000 + 300));
    await executeDue(store);
  });
  return Response.json({ results });
});
