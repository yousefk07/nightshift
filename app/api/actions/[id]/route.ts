import { after } from "next/server";
import { z } from "zod";
import { body, HttpError, requireWrite, route } from "@/lib/auth";
import { approveAction, executeDue, rejectAction, reviseAction, UNDO_SECONDS } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

export const maxDuration = 60;

const Decide = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), payload: z.record(z.string(), z.unknown()).optional() }), // edited fields
  z.object({ decision: z.literal("discard") }),
  z.object({ decision: z.literal("revise"), note: z.string().min(2).max(2000) }), // "Ask Ledger"
]);

// One card: GET it, or decide. Approving starts the undo window ("Sent to Lena Ortiz · Undo 8s"); the card goes
// out when it ends, unless POST /undo comes first.
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, me, { params }) => {
  const a = await supabaseStore().action(me.ws.id, (await params).id);
  if (!a) throw new HttpError(404, "No such approval.");
  return Response.json(a);
});

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, me, { params }) => {
  requireWrite(me);
  const { id } = await params;
  const d = await body(req, (v) => Decide.parse(v));
  const store = supabaseStore();
  if (d.decision === "discard") return Response.json(await rejectAction(store, me.ws, id, me));
  if (d.decision === "revise") return Response.json(await reviseAction(store, me.ws, id, d.note, me.userId));

  const a = await store.action(me.ws.id, id);
  if (a?.risk === "money" && process.env.REQUIRE_2FA_FOR_MONEY !== "0" && me.via === "session" && me.aal !== "aal2" && (await hasMfa(me.userId))) {
    throw new HttpError(403, "Approving money needs your second sign-in step. Confirm with your authenticator app.");
  }
  const r = await approveAction(store, me.ws, id, me, d.payload);
  after(async () => {
    await new Promise((ok) => setTimeout(ok, UNDO_SECONDS * 1000 + 300));
    await executeDue(store); // the tick sends it otherwise
  });
  return Response.json(r);
});

// Members who set up an authenticator must use it for money; others are asked to set one up from Security.
async function hasMfa(userId: string) {
  const { admin } = await import("@/lib/store-supabase");
  const { data } = await admin().auth.admin.mfa.listFactors({ userId });
  return (data?.factors ?? []).some((f) => f.status === "verified");
}
