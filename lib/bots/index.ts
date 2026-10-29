import { CATALOG } from "./catalog";
import { CORE } from "./core";
import type { BotTemplate, Industry } from "./template";

// Every bot a business can hire: the core team plus the specialised catalog.
export const TEMPLATES: BotTemplate[] = [...CORE, ...CATALOG];
const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export const isTemplate = (id: string) => BY_ID.has(id);
export function botDef(id: string): BotTemplate {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`Unknown bot template "${id}"`);
  return t;
}

// Bots that fit a business: everything for its industry, plus the general ones.
export const forIndustry = (industry: Industry) => TEMPLATES.filter((t) => t.industries.includes(industry) || t.industries.includes("general"));

// Hired automatically at onboarding: the core team plus the industry's starters.
export const starters = (industry: Industry) => TEMPLATES.filter((t) => t.starter?.includes("general") || t.starter?.includes(industry));

export type { BotTemplate, Industry } from "./template";
export { INDUSTRIES, CATEGORIES, taskFor } from "./template";
