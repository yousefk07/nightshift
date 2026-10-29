import type { Store } from "../store";
import type { Connection } from "../types";
import { gmail, googleCalendar } from "./google";
import { outlook, outlookCalendar } from "./microsoft";

// One mailbox and calendar shape over Gmail and Outlook, so the bots don't care which one the business uses.

export interface MailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export interface MailFull extends MailSummary {
  body: string;
  messageIdHeader?: string;
}

export interface MailClient {
  account: string;
  // query uses the provider's own search syntax; since narrows to mail received after that time.
  search(opts: { query?: string; since?: string; max?: number; sent?: boolean }): Promise<MailSummary[]>;
  read(id: string): Promise<MailFull>;
  draftReply(id: string, body: string): Promise<{ draftId: string }>;
  send(m: { to: string; subject: string; body: string; replyToId?: string }): Promise<{ id: string }>;
  label(id: string, label: string): Promise<void>;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
}

export interface CalendarClient {
  events(from: string, to: string): Promise<CalendarEvent[]>;
  create(e: { title: string; start: string; end: string; attendees?: string[]; description?: string }): Promise<{ id: string }>;
}

const pick = (conns: Connection[]) =>
  conns.find((c) => c.provider === "google" && c.status === "ok") ?? conns.find((c) => c.provider === "microsoft" && c.status === "ok");

export function mailFor(store: Store, conns: Connection[]): MailClient {
  const c = pick(conns);
  if (!c) throw new Error("No mailbox is connected. Connect Gmail or Outlook in settings.");
  return c.provider === "google" ? gmail(store, c) : outlook(store, c);
}

export function calendarFor(store: Store, conns: Connection[]): CalendarClient {
  const c = pick(conns);
  if (!c) throw new Error("No calendar is connected. Connect Google or Outlook in settings.");
  return c.provider === "google" ? googleCalendar(store, c) : outlookCalendar(store, c);
}

// Open meeting times inside working hours, on 30-minute marks, avoiding every event.
export function freeSlots(
  events: CalendarEvent[],
  o: { from: Date; to: Date; minutes: number; count: number; timeZone: string; hours: { start: string; end: string; days: number[] } },
) {
  const busy = events.map((e) => [new Date(e.start).getTime(), new Date(e.end).getTime()] as const);
  const out: { start: string; end: string }[] = [];
  const step = 30 * 60_000, len = o.minutes * 60_000;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: o.timeZone, hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit" });
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let t = Math.ceil(Math.max(o.from.getTime(), Date.now() + 60 * 60_000) / step) * step; // at least an hour from now
  while (t + len <= o.to.getTime() && out.length < o.count) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const hm = `${p.hour}:${p.minute}`;
    const endHm = Object.fromEntries(fmt.formatToParts(new Date(t + len)).map((x) => [x.type, x.value]));
    const inHours = o.hours.days.includes(days[p.weekday]) && hm >= o.hours.start && `${endHm.hour}:${endHm.minute}` <= o.hours.end && endHm.weekday === p.weekday;
    if (inHours && !busy.some(([a, b]) => t < b && t + len > a)) {
      out.push({ start: new Date(t).toISOString(), end: new Date(t + len).toISOString() });
      t += 2 * 60 * 60_000; // spread the options out
      continue;
    }
    t += step;
  }
  return out;
}

// Plain text from an HTML email body: good enough for a model to read.
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Drops the quoted history under a reply ("On Mon, X wrote:" and "> " lines) so the model reads only the new part.
export function stripQuoted(text: string) {
  const cut = text.search(/^(On .{5,200} wrote:|-{2,} ?Original Message ?-{2,}|From: .+\nSent: )/m);
  return (cut > 0 ? text.slice(0, cut) : text).split("\n").filter((l) => !l.startsWith(">")).join("\n").trim();
}
