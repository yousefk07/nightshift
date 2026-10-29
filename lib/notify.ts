import { layout, sendMail } from "./email";
import { zoneOffset } from "./engine/schedule";
import type { Store } from "./store";
import type { Member, Workspace } from "./types";

// "Tell me right away when…": each event goes to each member on the channels they chose. Channels are app
// (always recorded), email (Resend) and push (web push to their phone or laptop: the free stand-in for texts).
// Quiet hours hold everything except disputes and complaints for the brief.

export const EVENTS = {
  dispute_or_complaint: { label: "A client disputes an invoice or complains", channels: ["app", "email", "push"], breaksQuiet: true },
  time_sensitive: { label: "A draft is time-sensitive (needs a reply today)", channels: ["app"], breaksQuiet: false },
  connection_broken: { label: "A connection breaks and a bot is blocked", channels: ["app", "email"], breaksQuiet: false },
  lead_reply: { label: "A lead replies", channels: ["app"], breaksQuiet: false },
  approval_waiting: { label: "Something new is waiting for approval", channels: ["app"], breaksQuiet: false },
} as const;
export type NotifyEvent = keyof typeof EVENTS;
export type Channel = "app" | "email" | "push";

export interface NotifyPrefs {
  events?: Partial<Record<NotifyEvent, Channel[]>>;
  quiet_hours?: { on: boolean; start: string; end: string }; // "21:00" - "07:00", the member's workspace time
}

export const prefsOf = (m: Member): Required<NotifyPrefs> => {
  const p = (m.notify ?? {}) as NotifyPrefs;
  return {
    events: Object.fromEntries((Object.keys(EVENTS) as NotifyEvent[]).map((e) => [e, p.events?.[e] ?? [...EVENTS[e].channels]])) as Record<NotifyEvent, Channel[]>,
    quiet_hours: p.quiet_hours ?? { on: true, start: "21:00", end: "07:00" },
  };
};

export function inQuietHours(q: { on: boolean; start: string; end: string }, timeZone: string, at = new Date()) {
  if (!q.on) return false;
  const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const local = (((at.getUTCHours() * 60 + at.getUTCMinutes() + zoneOffset(timeZone, at)) % 1440) + 1440) % 1440;
  const a = minutes(q.start), b = minutes(q.end);
  return a <= b ? local >= a && local < b : local >= a || local < b;
}

// How alerts leave the building. Swapped out in tests.
export interface Delivery {
  email(to: string, subject: string, html: string, text: string): Promise<void>;
  push(ws: string, userId: string, payload: { title: string; body: string; url?: string }): Promise<number>;
}
let delivery: Delivery = {
  async email(to, subject, html, text) {
    await sendMail({ to, subject, html, text });
  },
  async push(ws, userId, payload) {
    const { pushToUser } = await import("./push");
    return pushToUser(ws, userId, payload);
  },
};
export const setDelivery = (d: Delivery) => (delivery = d);

export async function notifyEvent(store: Store, ws: Workspace, event: NotifyEvent, n: { title: string; body?: string; url?: string }, at = new Date()) {
  const members = (await store.members(ws.id)).filter((m) => m.role !== "viewer" || event === "connection_broken");
  const app = process.env.APP_URL ?? "";
  const url = n.url ?? `${app}/`;
  const sent: { user: string; channels: Channel[] }[] = [];
  for (const m of members) {
    const prefs = prefsOf(m);
    let channels = prefs.events[event] ?? [];
    if (!EVENTS[event].breaksQuiet && inQuietHours(prefs.quiet_hours, ws.timezone, at)) channels = channels.filter((c) => c === "app"); // waits for the brief
    const went: Channel[] = [];
    if (channels.includes("email") && m.email) {
      const mail = layout({ heading: n.title, paragraphs: [n.body ?? ""].filter(Boolean), button: { label: "Open Nightshift", url } });
      await delivery.email(m.email, n.title, mail.html, mail.text).then(() => went.push("email"), (e) => console.error("notify email", e));
    }
    if (channels.includes("push")) {
      const count = await delivery.push(ws.id, m.user_id, { title: n.title, body: n.body ?? "", url }).catch((e) => (console.error("notify push", e), 0));
      if (count) went.push("push");
    }
    if (channels.length) went.unshift("app");
    if (went.length) {
      await store.notify(ws.id, m.user_id, { event, title: n.title, body: n.body, url: n.url, channels: went });
      sent.push({ user: m.user_id, channels: went });
    }
  }
  return sent;
}
