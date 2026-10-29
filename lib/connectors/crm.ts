import type { Store } from "../store";
import type { Connection, Contact } from "../types";
import { api } from "./http";
import { accessToken } from "./oauth";

// Leads and customers. Nightshift keeps one contacts table every bot reads; HubSpot and a Google Sheet (or a CSV
// upload) are synced into it, and changes the bots make go back to HubSpot.

// ---- HubSpot (private app token: crm.objects.contacts.read/write) ----
const HS = "https://api.hubapi.com/crm/v3/objects/contacts";
const PROPS = ["firstname", "lastname", "email", "phone", "company", "lifecyclestage", "hs_lead_status", "notes_last_contacted", "lastmodifieddate"];

export async function hubspotPull(store: Store, conn: Connection, since?: string) {
  const token = String(conn.secret.token);
  let after: string | undefined, n = 0;
  do {
    const body: Record<string, unknown> = { limit: 100, properties: PROPS, sorts: [{ propertyName: "lastmodifieddate", direction: "DESCENDING" }], after };
    if (since) body.filterGroups = [{ filters: [{ propertyName: "lastmodifieddate", operator: "GTE", value: String(new Date(since).getTime()) }] }];
    const r = await api<{ results: { id: string; properties: Record<string, string | null> }[]; paging?: { next?: { after: string } } }>(`${HS}/search`, { method: "POST", token, json: body });
    for (const c of r.results) {
      const p = c.properties;
      if (!p.email) continue;
      await store.saveContact(conn.workspace_id, {
        email: p.email, name: [p.firstname, p.lastname].filter(Boolean).join(" "), phone: p.phone ?? null, company: p.company ?? null,
        stage: p.hs_lead_status?.toLowerCase() || p.lifecyclestage || "lead", source: "hubspot", external_id: c.id,
        ...(p.notes_last_contacted ? { last_touch_at: new Date(p.notes_last_contacted).toISOString() } : {}),
      });
      n++;
    }
    after = r.paging?.next?.after;
  } while (after && n < 2000);
  return n;
}

export async function hubspotPush(conn: Connection, c: Contact) {
  const token = String(conn.secret.token);
  const [firstname, ...rest] = c.name.split(" ");
  const properties = { email: c.email ?? "", firstname, lastname: rest.join(" "), phone: c.phone ?? "", company: c.company ?? "" };
  if (c.source === "hubspot" && c.external_id) await api(`${HS}/${c.external_id}`, { method: "PATCH", token, json: { properties } });
  else if (c.email) await api(HS, { method: "POST", token, json: { properties } }).catch(() => {}); // already there: fine
}

// ---- Google Sheet / CSV ----
// Columns are matched by header name, loosely: Name/Full name, Email, Phone, Company/Business, Stage/Status,
// Last contact/Last touched, Notes, Tags.
const pickers: [keyof Contact | "first" | "last", RegExp][] = [
  ["first", /^first/i], ["last", /^(last ?name|surname)/i], ["name", /^(full ?)?name$|^contact$/i], ["email", /e-?mail/i], ["phone", /phone|mobile|cell/i],
  ["company", /company|business|organi[sz]ation|clinic/i], ["stage", /stage|status/i], ["last_touch_at", /last.*(contact|touch|visit|seen)/i], ["notes", /notes?|comments?/i], ["tags", /tags?|labels?/i],
];

export function rowsToContacts(rows: string[][]) {
  const [header, ...data] = rows;
  if (!header) return [];
  const col = new Map<string, number>();
  header.forEach((h, i) => {
    const hit = pickers.find(([key, re]) => !col.has(key) && re.test(h.trim()));
    if (hit) col.set(hit[0], i);
  });
  const at = (r: string[], k: string) => (col.has(k) ? (r[col.get(k)!] ?? "").trim() : "");
  return data
    .map((r) => {
      const email = at(r, "email").toLowerCase();
      const when = at(r, "last_touch_at");
      const parsed = when ? new Date(when) : null;
      // only the cells that have something in them: a blank cell or a missing column keeps what's already known
      // (a new contact still starts as a lead: that's the column default)
      const name = at(r, "name") || [at(r, "first"), at(r, "last")].filter(Boolean).join(" ");
      const tags = at(r, "tags") ? at(r, "tags").split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [];
      return {
        email,
        ...(name ? { name } : {}),
        ...(at(r, "phone") ? { phone: at(r, "phone") } : {}),
        ...(at(r, "company") ? { company: at(r, "company") } : {}),
        ...(at(r, "stage") ? { stage: at(r, "stage").toLowerCase() } : {}),
        ...(at(r, "notes") ? { notes: at(r, "notes") } : {}),
        ...(tags.length ? { tags } : {}),
        ...(parsed && !isNaN(+parsed) ? { last_touch_at: parsed.toISOString() } : {}),
      };
    })
    .filter((c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email));
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function importContacts(store: Store, ws: string, rows: string[][], source: "csv" | "sheets") {
  const contacts = rowsToContacts(rows);
  for (const c of contacts) await store.saveContact(ws, { ...c, source });
  return contacts.length;
}

// The sheet's id from a link (https://docs.google.com/spreadsheets/d/<id>/...).
export const sheetId = (url: string) => url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)?.[1] ?? null;

export async function sheetsPull(store: Store, sheet: Connection, google: Connection) {
  const id = String(sheet.secret.sheet_id);
  const token = await accessToken(store, google);
  const r = await api<{ values?: string[][] }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1:Z5000`, { token });
  return importContacts(store, sheet.workspace_id, r.values ?? [], "sheets");
}
