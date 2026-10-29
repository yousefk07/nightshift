import type { Plan, Workspace } from "./types";

// What each plan includes (the design's pricing table). The trial is Studio for 14 days.
export const PLANS = {
  solo: { label: "Solo", month: 39, bots: 3, seats: 1, inboxes: 1, researchHours: 0, room: false, logDays: 30, api: false },
  studio: { label: "Studio", month: 89, bots: 10, seats: 2, inboxes: 3, researchHours: 100, room: true, logDays: 365, api: false },
  team: { label: "Team", month: 189, bots: 40, seats: 10, inboxes: 10, researchHours: 300, room: true, logDays: null, api: true },
} as const;
export type PaidPlan = keyof typeof PLANS;
export const SEAT_PRICE = 15;

export function limits(ws: Pick<Workspace, "plan" | "extra_seats">) {
  const base = ws.plan === "solo" || ws.plan === "team" ? PLANS[ws.plan] : PLANS.studio; // trial and canceled read as Studio
  return { ...base, seats: base.seats + (ws.extra_seats ?? 0) };
}

export function isActive(ws: Pick<Workspace, "plan" | "trial_ends_at" | "deleted_at">, now = new Date()) {
  if (ws.deleted_at || ws.plan === "canceled") return false;
  return ws.plan !== "trial" || new Date(ws.trial_ends_at) > now;
}

export const planOf = (p: Plan) => (p === "trial" ? "Studio trial" : p === "canceled" ? "Canceled" : PLANS[p].label);
