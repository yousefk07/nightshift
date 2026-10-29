"use client";

import { useEffect, useState } from "react";
import { useApp, useRename } from "@/components/AppShell";
import { Page, Row, Section } from "@/components/settings";
import { Button, Input, Select, Toggle } from "@/components/ui";
import { api, useApi } from "@/lib/client";

// S4 Notifications & morning brief. "The calmer the better. Most things can wait for the brief."
type Ch = "app" | "email" | "push";
interface Prefs { events: Record<string, { label: string }>; mine: { events: Record<string, Ch[]>; quiet_hours: { on: boolean; start: string; end: string } }; brief: { time: string; days: number[]; length: string; channels: string[] } }
const DAYSETS: [string, number[]][] = [["Every day", [0, 1, 2, 3, 4, 5, 6]], ["Weekdays", [1, 2, 3, 4, 5]], ["Weekdays + Saturday", [1, 2, 3, 4, 5, 6]]];
const CHANNEL_LABEL: Record<string, string> = { app: "App", email: "Email", push: "Phone" };

export default function NotificationsPage() {
  const rename = useRename();
  const { me, toast } = useApp();
  const p = useApi<Prefs>("/api/notifications/prefs");
  const [mine, setMine] = useState<Prefs["mine"] | null>(null);
  const [brief, setBrief] = useState<Prefs["brief"] | null>(null);
  const [push, setPush] = useState<"unknown" | "on" | "off" | "blocked">("unknown");
  useEffect(() => {
    if (p.data) queueMicrotask(() => { setMine(p.data!.mine); setBrief(p.data!.brief); });
  }, [p.data]);
  useEffect(() => {
    if (!("Notification" in window)) return queueMicrotask(() => setPush("blocked"));
    navigator.serviceWorker?.getRegistration().then(async (r) => {
      const sub = await r?.pushManager.getSubscription();
      setPush(sub ? "on" : Notification.permission === "denied" ? "blocked" : "off");
    });
  }, []);
  if (!p.data || !mine || !brief) return <Page title="Notifications & morning brief"><div /></Page>;
  const owner = me.user.role === "owner";

  const save = async () => {
    await api("/api/notifications/prefs", { method: "PUT", json: { events: mine.events, quiet_hours: mine.quiet_hours, ...(owner ? { brief } : {}) } });
    toast({ text: "Saved." });
  };
  const enablePush = async () => {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setPush("blocked");
    const { public_key } = await api<{ public_key: string }>("/api/push");
    const key = Uint8Array.from(atob(public_key.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api("/api/push", { json: { ...sub.toJSON(), device: navigator.userAgent.includes("iPhone") ? "iPhone" : navigator.userAgent.includes("Android") ? "Android phone" : "This computer" } });
    setPush("on");
    toast({ text: "Alerts will come to this device." });
  };
  const toggle = (event: string, ch: Ch) => {
    const cur = mine.events[event] ?? [];
    setMine({ ...mine, events: { ...mine.events, [event]: cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch] } });
  };

  return (
    <Page title="Notifications & morning brief" sub="The calmer the better. Most things can wait for the brief." action={<Button onClick={save}>Save</Button>}>
      <Section title="Morning brief">
        <Row first title="Deliver at" sub={rename("Dawn drafts it an hour before and keeps it up to date until then.")}>
          <Input type="time" disabled={!owner} value={brief.time} onChange={(e) => setBrief({ ...brief, time: e.target.value })} style={{ width: 140 }} />
        </Row>
        <Row title="Days">
          <Select disabled={!owner} value={JSON.stringify(brief.days)} onChange={(e) => setBrief({ ...brief, days: JSON.parse(e.target.value) })} style={{ width: 220 }}>
            {DAYSETS.map(([l, d]) => <option key={l} value={JSON.stringify(d)}>{l}</option>)}
            {!DAYSETS.some(([, d]) => JSON.stringify(d) === JSON.stringify(brief.days)) && <option value={JSON.stringify(brief.days)}>Custom</option>}
          </Select>
        </Row>
        <Row title="Length">
          <Select disabled={!owner} value={brief.length} onChange={(e) => setBrief({ ...brief, length: e.target.value })} style={{ width: 220 }}>
            <option value="short">Short (about 1 minute)</option><option value="standard">Standard (2–3 minutes)</option><option value="detailed">Detailed</option>
          </Select>
        </Row>
        <Row title="Send to">
          <div style={{ display: "flex", gap: 6 }}>
            {["app", "email", "push", "terminal"].map((c) => {
              const on = brief.channels.includes(c);
              return <button key={c} disabled={!owner} type="button" aria-pressed={on} onClick={() => setBrief({ ...brief, channels: on ? brief.channels.filter((x) => x !== c) : [...brief.channels, c] })} style={{ padding: "7px 12px", borderRadius: 20, fontSize: 13, border: "1px solid #cdbfac", background: on ? "#2b2320" : "transparent", color: on ? "#fbf3e6" : "#2b2320" }}>{c === "push" ? "Phone" : c === "terminal" ? "Terminal" : CHANNEL_LABEL[c]}</button>;
            })}
          </div>
        </Row>
      </Section>

      <Section title="Tell me right away when…">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", padding: "10px 18px 4px", fontSize: 12, fontWeight: 600, color: "#716459" }}>
          <span /><span style={{ textAlign: "center" }}>App</span><span style={{ textAlign: "center" }}>Email</span><span style={{ textAlign: "center" }}>Phone</span>
        </div>
        {Object.entries(p.data.events).map(([e, { label }]) => (
          <div key={e} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", alignItems: "center", padding: "12px 18px", borderTop: "1px solid #ece3d6", fontSize: 14.5 }}>
            <span>{label}</span>
            {(["app", "email", "push"] as Ch[]).map((ch) => (
              <span key={ch} style={{ textAlign: "center" }}><input type="checkbox" aria-label={`${label}: ${CHANNEL_LABEL[ch]}`} checked={(mine.events[e] ?? []).includes(ch)} onChange={() => toggle(e, ch)} style={{ width: 18, height: 18, accentColor: "#2b2320" }} /></span>
            ))}
          </div>
        ))}
        <Row title="Phone alerts on this device" sub={push === "on" ? "On. Disputes and complaints reach this device even at night." : push === "blocked" ? "Blocked in this browser's settings. Allow notifications for this site to turn them on." : "Install the app on your phone (Share → Add to Home Screen), then turn this on there."}>
          {push === "off" && <Button kind="outline" size="sm" onClick={enablePush}>Turn on</Button>}
        </Row>
      </Section>

      <Section>
        <Row first title={`Quiet hours · ${mine.quiet_hours.start} to ${mine.quiet_hours.end}`} sub="Only disputes and complaints come through. Everything else waits for the brief.">
          <Input type="time" value={mine.quiet_hours.start} onChange={(e) => setMine({ ...mine, quiet_hours: { ...mine.quiet_hours, start: e.target.value } })} style={{ width: 120 }} />
          <Input type="time" value={mine.quiet_hours.end} onChange={(e) => setMine({ ...mine, quiet_hours: { ...mine.quiet_hours, end: e.target.value } })} style={{ width: 120 }} />
          <Toggle label="Quiet hours" on={mine.quiet_hours.on} onChange={(v) => setMine({ ...mine, quiet_hours: { ...mine.quiet_hours, on: v } })} />
        </Row>
      </Section>
    </Page>
  );
}
