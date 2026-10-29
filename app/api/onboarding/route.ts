import { z } from "zod";
import { body, HttpError, requireOwner, route } from "@/lib/auth";
import { INDUSTRIES, isTemplate } from "@/lib/bots";
import { hireRow, PAIN_POINTS } from "@/lib/engine/flows";
import { inviteMember } from "@/lib/team";
import { limits } from "@/lib/plans";
import { supabaseStore } from "@/lib/store-supabase";

const tz = z.string().refine((t) => {
  try { new Intl.DateTimeFormat("en", { timeZone: t }); return true; } catch { return false; }
}, "Unknown time zone");

// Step 1 "Your business" (and "Save and exit" at any step): saved as it's filled in.
const Step = z.object({
  step: z.number().int().min(1).max(5).optional(),
  name: z.string().min(1).max(80).optional(),
  about: z.string().max(500).optional(),
  industry: z.string().refine((i) => i in INDUSTRIES, "Unknown industry").optional(),
  team_size: z.string().max(30).optional(),
  pain_points: z.array(z.string().refine((p) => p in PAIN_POINTS)).optional(),
  timezone: tz.optional(),
}).strict();

export const PATCH = route(async (req, me) => {
  requireOwner(me);
  const s = await body(req, (v) => Step.parse(v));
  const { step, ...fields } = s;
  await supabaseStore().updateWorkspace(me.ws.id, { ...fields, ...(step ? { onboarding_step: step } : {}) });
  return Response.json({ saved: true });
});

// Step 4 "Start the night shift": hire the picked team, set the brief and guardrails, invite a second approver.
const Done = z.object({
  bots: z.array(z.string().refine(isTemplate, "Unknown bot")).min(1),
  brief_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("06:30"),
  pause_on_dispute: z.boolean().default(true),
  invite: z.object({ email: z.string().email(), role: z.enum(["approver", "approver_email", "viewer"]).default("approver_email") }).optional(),
  shift_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("19:00"),
});

export const POST = route(async (req, me) => {
  requireOwner(me);
  const d = await body(req, (v) => Done.parse(v));
  const store = supabaseStore();
  // During the trial a business can have every bot it picks, up to the Studio count.
  if (d.bots.length > limits(me.ws).bots) throw new HttpError(402, `Pick up to ${limits(me.ws).bots} bots.`);
  const team = await store.bots(me.ws.id);
  for (const b of team) if (!d.bots.includes(b.kind)) await store.fireBot(me.ws.id, b.kind);
  for (const kind of d.bots) if (!team.some((b) => b.kind === kind)) await store.hireBot(me.ws.id, hireRow(me.ws, kind));
  await store.updateWorkspace(me.ws.id, {
    onboarding_step: 5, onboarded_at: new Date().toISOString(), shift_start: d.shift_start,
    brief_prefs: { ...me.ws.brief_prefs, time: d.brief_time },
    guardrails: { ...me.ws.guardrails, pause_on_dispute: d.pause_on_dispute },
  });
  const brief = await store.bot(me.ws.id, "brief");
  if (brief) await store.updateBot(brief.id, { next_run_at: null }); // Dawn now follows the brief time (tick)
  if (d.invite) await inviteMember(store, me, d.invite.email, d.invite.role);
  await store.log(me.ws.id, { actor_type: "user", actor_id: me.userId, action: "started_night_shift", data: { bots: d.bots } });
  return Response.json({ started: true, bots: d.bots.length, first_brief: d.brief_time, clocks_in: d.shift_start });
});
