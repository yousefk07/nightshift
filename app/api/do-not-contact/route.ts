import { z } from "zod";
import { body, requireOwner, route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// "Never contact these people": emails and whole domains. PUT replaces the list; the guardrail switches
// (pause on dispute, one follow-up a week) are saved with it.
export const GET = route(async (_req, me) => Response.json({ entries: await supabaseStore().doNotContact(me.ws.id), guardrails: me.ws.guardrails }));

const Put = z.object({
  entries: z.array(z.string().trim().min(3).max(200)).max(1000).optional(), // "ana@acme.com" or "acme.com" / "@acme.com"
  guardrails: z.object({ pause_on_dispute: z.boolean().optional(), weekly_cap: z.boolean().optional() }).optional(),
});

export const PUT = route(async (req, me) => {
  requireOwner(me);
  const p = await body(req, (v) => Put.parse(v));
  const store = supabaseStore();
  if (p.entries) {
    const entries = [...new Set(p.entries.map((e) => e.toLowerCase().replace(/^@/, "")))].map((value) => ({ kind: value.includes("@") ? ("email" as const) : ("domain" as const), value }));
    await store.setDoNotContact(me.ws.id, entries);
  }
  if (p.guardrails) await store.updateWorkspace(me.ws.id, { guardrails: { ...me.ws.guardrails, ...p.guardrails } });
  return Response.json({ entries: await store.doNotContact(me.ws.id), guardrails: { ...me.ws.guardrails, ...p.guardrails } });
});
