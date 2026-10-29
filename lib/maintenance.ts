import { botDef } from "./bots";
import { hubspotPull, sheetsPull } from "./connectors/crm";
import { briefHtml, layout, sendMail } from "./email";
import { briefDue, runNow } from "./engine/flows";
import { localDate, zonedToUtc } from "./engine/schedule";
import { notifyEvent } from "./notify";
import { isActive, limits } from "./plans";
import type { Store } from "./store";
import { admin } from "./store-supabase";
import type { Run, Workspace } from "./types";

// The housekeeping the tick does across every workspace, besides running bots (lib/engine/flows.ts tick).

const all = async (): Promise<Workspace[]> => ((await admin().from("workspaces").select("*").is("deleted_at", null)).data ?? []) as Workspace[];

// Runs whose "Retry at" time has come.
export async function dueRetries(): Promise<Run[]> {
  const { data } = await admin().from("runs").select("*").not("retry_at", "is", null).lte("retry_at", new Date().toISOString()).limit(5);
  return (data ?? []) as Run[];
}

// Dawn drafts the brief an hour before it's due and rewrites it (a draft until delivery), then it's delivered on
// the owner's channels at their time.
export async function briefs(store: Store, now = new Date()) {
  const out: string[] = [];
  for (const ws of await all()) {
    if (!ws.onboarded_at || !isActive(ws, now)) continue;
    const day = localDate(ws.timezone, now);
    const brief = await store.brief(ws.id, day);
    const dawn = await store.bot(ws.id, "brief");
    const [h, m] = ws.brief_prefs.time.split(":").map(Number);
    const [y, mo, d] = day.split("-").map(Number);
    const dueAt = zonedToUtc(ws.timezone, y, mo, d, h, m);
    const draftFrom = new Date(dueAt.getTime() - 60 * 60_000);
    const today = new Intl.DateTimeFormat("en-US", { timeZone: ws.timezone, weekday: "short" }).format(now);
    if (!ws.brief_prefs.days.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(today))) continue;

    if (dawn?.enabled && now >= draftFrom && !brief) {
      await runNow(store, ws, "brief", undefined, undefined, "schedule");
      out.push(`${ws.id}: drafted`);
    }
    const ready = await store.brief(ws.id, day);
    if (ready && !ready.delivered_at && briefDue(ws, now)) {
      await deliverBrief(store, ws, day, ready.headline, ready.content);
      out.push(`${ws.id}: delivered`);
    }
  }
  return out;
}

async function deliverBrief(store: Store, ws: Workspace, day: string, headline: string, content: string) {
  const channels = ws.brief_prefs.channels;
  const pending = await store.actions(ws.id, "pending");
  const url = `${process.env.APP_URL ?? ""}/`;
  if (channels.includes("email")) {
    const members = (await store.members(ws.id)).filter((m) => m.role === "owner" || m.role.startsWith("approver"));
    const date = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const base = layout({ heading: `Morning brief · ${date}`, paragraphs: [headline], button: pending.length ? { label: `Review ${pending.length} approval${pending.length === 1 ? "" : "s"}`, url } : { label: "Open the office", url }, footer: "Written by Dawn. Change brief settings in Notifications & brief." });
    const html = base.html.replace("</h1>", `</h1><div style="font-size:15px;color:#3a302b">${briefHtml(content)}</div>`);
    for (const m of members) if (m.email) await sendMail({ to: m.email, subject: `Morning brief · ${headline.slice(0, 80)}`, html, text: `${headline}\n\n${content}\n\n${url}` }).catch((e) => console.error("brief mail", e));
  }
  if (channels.includes("push") || channels.includes("app")) {
    for (const m of await store.members(ws.id)) if (m.role !== "viewer") await store.notify(ws.id, m.user_id, { event: "brief", title: "Your morning brief is ready", body: headline, channels: ["app"] });
  }
  await store.markBriefDelivered(ws.id, day);
}

// HubSpot and lead sheets are pulled into contacts about once an hour.
export async function syncCrm(store: Store) {
  let n = 0;
  for (const ws of await all()) {
    if (!isActive(ws)) continue;
    const conns = await store.connections(ws.id);
    for (const c of conns.filter((x) => x.kinds.includes("crm") && x.status === "ok")) {
      if (c.last_synced_at && Date.now() - new Date(c.last_synced_at).getTime() < 55 * 60_000) continue;
      try {
        if (c.provider === "hubspot") n += await hubspotPull(store, c, c.last_synced_at ?? undefined);
        if (c.provider === "sheets") {
          const google = conns.find((x) => x.provider === "google" && x.status === "ok");
          if (google) n += await sheetsPull(store, c, google);
        }
        await store.markConnection(c.id, { status: "ok", synced: true });
      } catch (e) {
        await store.markConnection(c.id, { status: "error", error: (e as Error).message });
      }
    }
  }
  return n;
}

// A connection that broke since the last tick: the banner shows, the bots that need it are blocked, and the
// owner hears about it once ("Accounting got disconnected at 1:04 AM").
export async function connectionAlerts(store: Store) {
  const { data } = await admin().from("connections").select("id, workspace_id, provider, kinds, broken_at").neq("status", "ok").not("broken_at", "is", null).gt("broken_at", new Date(Date.now() - 10 * 60_000).toISOString());
  for (const c of data ?? []) {
    const ws = await store.workspace(c.workspace_id);
    const bots = (await store.bots(ws.id)).filter((b) => (botDef(b.kind).needs as string[]).some((k) => c.kinds.includes(k)));
    for (const b of bots) await store.updateBot(b.id, { status: "blocked", status_text: `Blocked: ${c.provider} connection lost`, blocked_reason: `${c.provider} connection lost` });
    const when = new Date(c.broken_at).toLocaleTimeString("en-US", { timeZone: ws.timezone, hour: "numeric", minute: "2-digit" });
    const kind = c.kinds.includes("accounting") ? "Accounting" : c.kinds.includes("email") ? "Email" : c.provider;
    const who = bots.map((b) => b.name).join(" and ") || "The team";
    await notifyEvent(store, ws, "connection_broken", { title: `${kind} got disconnected at ${when}`, body: `${who} can't work until you reconnect it.`, url: `${process.env.APP_URL ?? ""}/settings/connections` });
    await admin().from("connections").update({ broken_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("id", c.id); // alert once
  }
  return data?.length ?? 0;
}

// Deleted workspaces are purged after 30 days; the activity log keeps what the plan allows.
export async function purge() {
  const db = admin();
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: gone } = await db.from("workspaces").delete().lt("deleted_at", cutoff).select("id");
  for (const ws of (await db.from("workspaces").select("id, plan, extra_seats")).data ?? []) {
    const days = limits(ws as Workspace).logDays;
    if (days) await db.from("activity").delete().eq("workspace_id", ws.id).lt("at", new Date(Date.now() - days * 86_400_000).toISOString());
  }
  await db.from("device_codes").delete().lt("expires_at", new Date().toISOString());
  return gone?.length ?? 0;
}
