import { z } from "zod";
import { body, HttpError, open } from "@/lib/auth";
import { ownerAlert } from "@/lib/alerts";
import { readInterestToken, type Prospect } from "@/lib/interest";
import { exactly } from "@/lib/like";
import { admin } from "@/lib/store-supabase";

// "Yes, I'd like a free trial": from the link in an outreach email (a signed token says which business) or the
// form on /trial. Saved once per email (a second click just counts); the people running Nightshift get an alert
// for each new one. The page calls this from the browser, so link scanners that open emails don't sign anyone up.
const Form = z.object({
  t: z.string().max(2000).optional(),
  business: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().max(0).optional(), // a field people never see: bots fill it in
});

export const POST = open(async (req) => {
  const f = await body(req, (v) => Form.parse(v ?? {}));
  if (f.website) return Response.json({ ok: true }); // a bot: say thanks, save nothing
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const db = admin();

  let p: Prospect, source: "outreach" | "form";
  if (f.t) {
    const fromLink = readInterestToken(f.t);
    if (!fromLink) throw new HttpError(400, "That link isn't valid. Use the form instead.");
    p = { ...fromLink, contact_name: f.name || fromLink.contact_name };
    source = "outreach";
  } else {
    if (!f.email || !f.business) throw new HttpError(400, "Add your business name and email.");
    // the form is open to anyone: a few sign-ups per network per hour
    if (ip) {
      const recent = await db.from("trial_interest").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
      if (!recent.error && (recent.count ?? 0) >= 5) throw new HttpError(429, "Thanks, we've got it. We'll be in touch.");
    }
    p = { business: f.business, email: f.email.toLowerCase(), contact_name: f.name ?? null };
    source = "form";
  }

  const existing = await db.from("trial_interest").select("id, clicks").ilike("email", exactly(p.email)).maybeSingle();
  if (existing.data) {
    await db.from("trial_interest").update({ clicks: existing.data.clicks + 1, last_click_at: new Date().toISOString(), ...(f.phone ? { phone: f.phone } : {}) }).eq("id", existing.data.id);
    return Response.json({ ok: true, business: p.business, again: true });
  }
  const saved = await db.from("trial_interest").insert({ email: p.email, business: p.business, contact_name: p.contact_name ?? null, phone: f.phone ?? null, niche: p.niche ?? null, city: p.city ?? null, source, ip });
  // even if the table isn't there yet (migration 0005), the alert still goes out, so nobody is lost
  await ownerAlert({
    kind: "interest", heading: `${p.business || p.email} wants a free trial`,
    lead: source === "outreach" ? "They clicked the link in your outreach email." : "They filled in the form on nightshiftai.ca/trial.",
    rows: [["Business", p.business || "—"], ["Email", p.email], ...(p.contact_name ? [["Name", p.contact_name] as [string, string]] : []), ...(f.phone ? [["Phone", f.phone] as [string, string]] : []), ...(p.niche ? [["Kind of business", p.niche] as [string, string]] : []), ...(p.city ? [["City", p.city] as [string, string]] : []), ...(saved.error ? [["Note", "Not saved: run migration 0005"] as [string, string]] : [])],
    button: { label: "See everyone who's interested", url: `${process.env.APP_URL || "https://www.nightshiftai.ca"}/admin` },
  });
  return Response.json({ ok: true, business: p.business });
});
