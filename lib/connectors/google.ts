import type { Store } from "../store";
import type { Connection } from "../types";
import { api } from "./http";
import type { CalendarClient, MailClient, MailFull, MailSummary } from "./mail";
import { htmlToText, stripQuoted } from "./mail";
import { accessToken } from "./oauth";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary";

type Header = { name: string; value: string };
type Part = { mimeType: string; body?: { data?: string }; parts?: Part[]; headers?: Header[] };
interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  labelIds?: string[];
  payload: Part & { headers: Header[] };
}

const header = (m: GmailMessage, name: string) => m.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function bodyOf(p: Part): string {
  const find = (part: Part, type: string): string | null => {
    if (part.mimeType === type && part.body?.data) return b64(part.body.data);
    for (const c of part.parts ?? []) {
      const r = find(c, type);
      if (r) return r;
    }
    return null;
  };
  const plain = find(p, "text/plain");
  if (plain) return plain;
  const html = find(p, "text/html");
  return html ? htmlToText(html) : "";
}

function summary(m: GmailMessage): MailSummary {
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m, "From"),
    to: header(m, "To"),
    subject: header(m, "Subject"),
    date: header(m, "Date"),
    snippet: m.snippet,
    unread: m.labelIds?.includes("UNREAD") ?? false,
  };
}

// An RFC 2822 message, base64url-encoded, as Gmail's send and draft endpoints want it.
export function rawMessage(m: { to: string; subject: string; body: string; inReplyTo?: string }) {
  const lines = [
    `To: ${m.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(m.subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (m.inReplyTo) lines.push(`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`);
  return b64url(lines.join("\r\n") + "\r\n\r\n" + m.body);
}

const reSubject = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s}`);

export function gmail(store: Store, conn: Connection): MailClient {
  const token = () => accessToken(store, conn);
  const get = async (id: string, format: "metadata" | "full") =>
    api<GmailMessage>(`${GMAIL}/messages/${id}?format=${format}${format === "metadata" ? "&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date" : ""}`, { token: await token() });

  return {
    account: conn.account,
    async search({ query = "", since, max = 20, sent = false }) {
      const q = [query, sent ? "in:sent" : "", since ? `after:${Math.floor(new Date(since).getTime() / 1000)}` : ""].filter(Boolean).join(" ");
      const list = await api<{ messages?: { id: string }[] }>(`${GMAIL}/messages?maxResults=${Math.min(max, 50)}&q=${encodeURIComponent(q)}`, { token: await token() });
      const msgs = await Promise.all((list.messages ?? []).map((m) => get(m.id, "metadata")));
      return msgs.map(summary);
    },
    async read(id) {
      const m = await get(id, "full");
      return { ...summary(m), body: stripQuoted(bodyOf(m.payload)).slice(0, 20_000), messageIdHeader: header(m, "Message-ID") } satisfies MailFull;
    },
    async draftReply(id, body) {
      const m = await get(id, "full");
      const raw = rawMessage({ to: header(m, "Reply-To") || header(m, "From"), subject: reSubject(header(m, "Subject")), body, inReplyTo: header(m, "Message-ID") });
      const d = await api<{ id: string }>(`${GMAIL}/drafts`, { method: "POST", token: await token(), json: { message: { raw, threadId: m.threadId } } });
      return { draftId: d.id };
    },
    async send({ to, subject, body, replyToId }) {
      let threadId: string | undefined, inReplyTo: string | undefined;
      if (replyToId) {
        const m = await get(replyToId, "metadata");
        threadId = m.threadId;
        inReplyTo = header(m, "Message-ID") || undefined;
        subject = reSubject(subject || header(m, "Subject"));
      }
      const r = await api<{ id: string }>(`${GMAIL}/messages/send`, { method: "POST", token: await token(), json: { raw: rawMessage({ to, subject, body, inReplyTo }), threadId } });
      return { id: r.id };
    },
    async label(id, label) {
      const t = await token();
      const labels = await api<{ labels: { id: string; name: string }[] }>(`${GMAIL}/labels`, { token: t });
      const name = `Nightshift/${label}`;
      let found = labels.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
      found ??= await api<{ id: string; name: string }>(`${GMAIL}/labels`, { method: "POST", token: t, json: { name, labelListVisibility: "labelShow", messageListVisibility: "show" } });
      await api(`${GMAIL}/messages/${id}/modify`, { method: "POST", token: t, json: { addLabelIds: [found.id] } });
    },
  };
}

export function googleCalendar(store: Store, conn: Connection): CalendarClient {
  const token = () => accessToken(store, conn);
  return {
    async events(from, to) {
      const q = new URLSearchParams({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "50" });
      const r = await api<{ items: any[] }>(`${CAL}/events?${q}`, { token: await token() });
      return r.items.map((e) => ({
        id: e.id,
        title: e.summary ?? "(no title)",
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        attendees: (e.attendees ?? []).map((a: { email: string }) => a.email),
        location: e.location,
      }));
    },
    async create(e) {
      const r = await api<{ id: string }>(`${CAL}/events?sendUpdates=all`, {
        method: "POST",
        token: await token(),
        json: { summary: e.title, description: e.description, start: { dateTime: e.start }, end: { dateTime: e.end }, attendees: (e.attendees ?? []).map((email) => ({ email })) },
      });
      return { id: r.id };
    },
  };
}
