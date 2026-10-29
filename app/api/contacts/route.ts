import { z } from "zod";
import { body, requireWrite, route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// Contacts and leads (Nightshift's list; HubSpot and the lead sheet sync into it).
export const GET = route(async (req, me) => {
  const p = new URL(req.url).searchParams;
  const contacts = await supabaseStore().contacts(me.ws.id, { query: p.get("q") ?? undefined, stage: p.get("stage") ?? undefined, staleDays: Number(p.get("stale")) || undefined, limit: Math.min(Number(p.get("limit")) || 100, 500) });
  return Response.json({ contacts });
});

const Contact = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  stage: z.string().max(30).optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
  notes: z.string().max(5000).optional(),
});

export const POST = route(async (req, me) => {
  requireWrite(me);
  const c = await body(req, (v) => Contact.parse(v));
  return Response.json({ contact: await supabaseStore().saveContact(me.ws.id, { ...c, email: c.email.toLowerCase() }) });
});
