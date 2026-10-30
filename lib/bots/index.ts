import { castOf, withCast } from "./casts";
import { CATALOG } from "./catalog";
import { CORE } from "./core";
import { INDUSTRIES, type BotTemplate, type Industry } from "./template";

// Every bot a business can hire: the core team plus the specialised catalog.
export const TEMPLATES: BotTemplate[] = [...CORE, ...CATALOG];
const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export const isTemplate = (id: string) => BY_ID.has(id);
// Pass the workspace's industry to get the bot as that business knows it (its cast's name, job and words).
export function botDef(id: string, industry?: string | null): BotTemplate {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`Unknown bot template "${id}"`);
  return industry ? withCast(t, industry, INDUSTRIES[industry as Industry] ?? "") : t;
}
const cast = (industry: Industry) => (t: BotTemplate) => withCast(t, industry, INDUSTRIES[industry] ?? "");

// Bots that fit a business: its industry's first, then the general ones, all in its cast.
export const forIndustry = (industry: Industry) => [
  ...TEMPLATES.filter((t) => t.industries.includes(industry) && !t.industries.includes("general")),
  ...TEMPLATES.filter((t) => t.industries.includes("general")),
].map(cast(industry));

// Hired automatically at onboarding: the core team plus the industry's starters.
export const starters = (industry: Industry) => TEMPLATES.filter((t) => t.starter?.includes("general") || t.starter?.includes(industry)).map(cast(industry));

// What the team is called for this business ("dental front office"), for headers.
export const teamLabel = (industry: string | null | undefined) => castOf(industry)?.team ?? null;

export type { BotTemplate, Industry } from "./template";
export { INDUSTRIES, CATEGORIES, taskFor } from "./template";
export { chipsFor, castOf, CASTS } from "./casts";

// Health practices handle patients' health information, which needs a model provider that signs health-privacy
// agreements (PHIPA in Ontario, HIPAA in the US). DeepSeek doesn't, so these are held back from sign-up until
// HEALTH_INDUSTRIES=on. Vets stay open: animal records aren't health information under those laws.
export const HEALTH_INDUSTRIES: Industry[] = ["dental_general", "dental_ortho", "dental_pediatric", "dental_cosmetic", "medical_family", "medical_specialist", "medspa", "dermatology", "physio", "chiro", "massage", "mental_health", "optometry", "pharmacy"];
export const healthHeld = () => process.env.HEALTH_INDUSTRIES !== "on";
export const industryOpen = (i: string) => i in INDUSTRIES && !(healthHeld() && HEALTH_INDUSTRIES.includes(i as Industry));
export const openIndustries = () => Object.fromEntries(Object.entries(INDUSTRIES).filter(([k]) => industryOpen(k))) as Partial<typeof INDUSTRIES>;
