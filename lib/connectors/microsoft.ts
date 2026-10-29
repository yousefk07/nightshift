import type { Store } from "../store";
import type { Connection } from "../types";
import { api } from "./http";
import type { CalendarClient, MailClient, MailSummary } from "./mail";
import { htmlToText, stripQuoted } from "./mail";
import { accessToken } from "./oauth";

// Outlook / Microsoft 365 through Microsoft Graph.
const GRAPH = "https://graph.microsoft.com/v1.0/me";
const FIELDS = "id,conversationId,from,toRecipients,subject,receivedDateTime,bodyPreview,isRead,internetMessageId";

type Addr = { emailAddress: { name?: string; address: string } };
const addr = (a?: Addr) => (a ? (a.emailAddress.name ? `${a.emailAddress.name} <${a.emailAddress.address}>` : a.emailAddress.address) : "");

function summary(m: any): MailSummary {
  return {
    id: m.id,
    threadId: m.conversationId,
    from: addr(m.from),
    to: (m.toRecipients ?? []).map(addr).join(", "),
    subject: m.subject ?? "",
    date: m.receivedDateTime,
    snippet: m.bodyPreview ?? "",
    unread: !m.isRead,
  };
}

const recipients = (to: string) => to.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((address) => ({ emailAddress: { address: address.replace(/^.*<(.+)>$/, "$1") } }));

export function outlook(store: Store, conn: Connection): MailClient {
  const token = () => accessToken(store, conn);
  return {
    account: conn.account,
    async search({ query, since, max = 20, sent = false }) {
      const folder = sent ? "/mailFolders/sentitems/messages" : "/messages";
      const q = new URLSearchParams({ $top: String(Math.min(max, 50)), $select: FIELDS });
      const headers: Record<string, string> = {};
      if (query) {
        q.set("$search", `"${query.replace(/"/g, "")}"`); // Graph can't combine $search with $orderby or $filter
        headers.ConsistencyLevel = "eventual";
      } else {
        q.set("$orderby", "receivedDateTime desc");
        if (since) q.set("$filter", `receivedDateTime ge ${new Date(since).toISOString()}`);
      }
      const r = await api<{ value: any[] }>(`${GRAPH}${folder}?${q}`, { token: await token(), headers });
      let items = r.value.map(summary);
      if (query && since) items = items.filter((m) => new Date(m.date) >= new Date(since));
      return items;
    },
    async read(id) {
      const m = await api<any>(`${GRAPH}/messages/${id}?$select=${FIELDS},body`, { token: await token() });
      const body = m.body?.contentType === "html" ? htmlToText(m.body.content) : m.body?.content ?? "";
      return { ...summary(m), body: stripQuoted(body).slice(0, 20_000), messageIdHeader: m.internetMessageId };
    },
    async draftReply(id, body) {
      const d = await api<{ id: string }>(`${GRAPH}/messages/${id}/createReply`, { method: "POST", token: await token(), json: { comment: body } });
      return { draftId: d.id };
    },
    async send({ to, subject, body, replyToId }) {
      if (replyToId) {
        await api(`${GRAPH}/messages/${replyToId}/reply`, { method: "POST", token: await token(), json: { comment: body } });
        return { id: replyToId };
      }
      await api(`${GRAPH}/sendMail`, { method: "POST", token: await token(), json: { message: { subject, body: { contentType: "Text", content: body }, toRecipients: recipients(to) } } });
      return { id: "sent" };
    },
    async label(id, label) {
      const t = await token();
      const m = await api<{ categories: string[] }>(`${GRAPH}/messages/${id}?$select=categories`, { token: t });
      const name = `Nightshift: ${label}`;
      if (!m.categories.includes(name)) await api(`${GRAPH}/messages/${id}`, { method: "PATCH", token: t, json: { categories: [...m.categories, name] } });
    },
  };
}

export function outlookCalendar(store: Store, conn: Connection): CalendarClient {
  const token = () => accessToken(store, conn);
  return {
    async events(from, to) {
      const q = new URLSearchParams({ startDateTime: new Date(from).toISOString(), endDateTime: new Date(to).toISOString(), $top: "50", $orderby: "start/dateTime" });
      const r = await api<{ value: any[] }>(`${GRAPH}/calendarView?${q}`, { token: await token(), headers: { Prefer: 'outlook.timezone="UTC"' } });
      return r.value.map((e) => ({
        id: e.id,
        title: e.subject ?? "(no title)",
        start: e.start.dateTime + "Z",
        end: e.end.dateTime + "Z",
        attendees: (e.attendees ?? []).map((a: Addr) => a.emailAddress.address),
        location: e.location?.displayName || undefined,
      }));
    },
    async create(e) {
      const r = await api<{ id: string }>(`${GRAPH}/events`, {
        method: "POST",
        token: await token(),
        json: {
          subject: e.title,
          body: { contentType: "Text", content: e.description ?? "" },
          start: { dateTime: new Date(e.start).toISOString().slice(0, 19), timeZone: "UTC" },
          end: { dateTime: new Date(e.end).toISOString().slice(0, 19), timeZone: "UTC" },
          attendees: (e.attendees ?? []).map((address) => ({ emailAddress: { address }, type: "required" })),
        },
      });
      return { id: r.id };
    },
  };
}
