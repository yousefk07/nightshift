import { route } from "@/lib/auth";
import { TEMPLATES } from "@/lib/bots";
import { supabaseStore } from "@/lib/store-supabase";

// Connections: each with its health, last sync, and which of your bots use it ("Penny, Nudge · read, draft").
export const GET = route(async (_req, me) => {
  const store = supabaseStore();
  const [conns, bots] = await Promise.all([store.connections(me.ws.id), store.bots(me.ws.id)]);
  const needs = (kind: string) => bots.filter((b) => (TEMPLATES.find((t) => t.id === b.kind)?.needs as string[] | undefined)?.includes(kind)).map((b) => b.name);
  return Response.json({
    connections: conns.map(({ secret: _s, ...c }) => ({ ...c, health: c.status === "ok" ? "Healthy" : c.status === "needs_signin" ? "Needs sign-in" : "Error", used_by: [...new Set(c.kinds.flatMap(needs))] })),
    missing: ["email", "calendar", "accounting", "crm", "store"].filter((k) => !conns.some((c) => c.kinds.includes(k as never)) && needs(k).length).map((k) => ({ kind: k, needed_by: needs(k) })),
  });
});
