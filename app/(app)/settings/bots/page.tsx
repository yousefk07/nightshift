"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppShell";
import { BotTile } from "@/components/office/cards";
import { Head } from "@/components/pixel";
import { Locked, Page, Row, Section } from "@/components/settings";
import { Button, ErrorLine, Input, Select, TextArea, Toggle } from "@/components/ui";
import { api, clock, useApi } from "@/lib/client";

// S2 Bots & approvals: who's on shift, when they work, what they can touch; guardrails; the never-contact list;
// and hiring from the catalog.
interface CatalogBot { id: string; name: string; role: string; title: string; hue: number; prop: string; category: string; schedule: { everyMinutes?: number; dailyAt?: string } | null; needs: string[]; missing: string[]; hired: boolean; suggested: boolean }
interface Catalog { industries: Record<string, string>; categories: Record<string, string>; industry: string; bots: CatalogBot[] }

// "Always on", "When asked", "Nightly, 1 AM", "Daily, 9 AM"
const shift = (s: CatalogBot["schedule"]) => {
  if (!s) return "When asked";
  if (s.everyMinutes) return s.everyMinutes <= 30 ? "Always on" : `Every ${Math.round(s.everyMinutes / 60)} h`;
  const h = Number(s.dailyAt!.slice(0, 2));
  const time = new Date(`2000-01-01T${s.dailyAt}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: s.dailyAt!.endsWith(":00") ? undefined : "2-digit" });
  return `${h >= 5 && h < 20 ? "Daily" : "Nightly"}, ${time}`;
};
const ACCESS: Record<string, string> = { email: "email (read + draft)", calendar: "calendar", accounting: "invoices, payments (read)", crm: "contacts", store: "orders, stock", web: "public web" };

export default function BotsPage() {
  const { me, office, refreshOffice, toast } = useApp();
  const owner = me.user.role === "owner";
  const cat = useApi<Catalog>("/api/catalog");
  const dnc = useApi<{ entries: { kind: string; value: string }[]; guardrails: Record<string, boolean> }>("/api/do-not-contact");
  const [hiring, setHiring] = useState(false);
  const [editDnc, setEditDnc] = useState(false);
  const [dncText, setDncText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tz = me.workspace.timezone;
  const tpl = (kind: string) => cat.data?.bots.find((b) => b.id === kind);
  const [shiftStart, setShiftStart] = useState(me.workspace.shift_start.slice(0, 5));

  const patch = async (kind: string, body: Record<string, unknown>) => {
    setError(null);
    try {
      await api(`/api/bots/${encodeURIComponent(kind)}`, { method: "PATCH", json: body });
      refreshOffice();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const guard = async (k: string, v: boolean) => {
    await api("/api/do-not-contact", { method: "PUT", json: { guardrails: { [k]: v } } });
    dnc.refresh();
  };

  return (
    <Page title="Bots & approvals" sub="Choose who's on shift, when they work and what they can touch." action={owner && <Button onClick={() => setHiring(true)}>Hire a bot</Button>}>
      <Locked>Money always waits for you: every credit note and invoice needs your approval. This can&apos;t be turned off.</Locked>
      <ErrorLine error={error} />
      <Section>
        <div className="ns-bot-head" style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.3fr) 130px minmax(150px,1fr) 150px 56px", gap: 12, padding: "12px 18px", fontSize: 12, fontWeight: 600, color: "#716459", textTransform: "uppercase", letterSpacing: ".06em" }}>
          <span>Bot</span><span>Shift</span><span>Can access</span><span>Emails</span><span>On</span>
        </div>
        {(office?.desks ?? []).map((d) => {
          const t = tpl(d.kind);
          return (
            <div key={d.id} className="ns-bot-row" style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.3fr) 130px minmax(150px,1fr) 150px 56px", gap: 12, alignItems: "center", padding: "12px 18px", borderTop: "1px solid #ece3d6", fontSize: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                <BotTile desk={d} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{d.name} <span style={{ fontWeight: 400, color: "#776a5e" }}>· {d.role}</span></div>
                  <div style={{ fontSize: 12.5, color: "#776a5e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                </div>
              </div>
              <span>{t ? shift(t.schedule) : "—"}{d.next_run_at && d.enabled ? <span style={{ display: "block", fontSize: 12, color: "#776a5e" }}>next {clock(d.next_run_at, tz)}</span> : null}</span>
              <span style={{ color: "#5d5148" }}>{t ? t.needs.map((n) => ACCESS[n] ?? n).join(", ") || "Other bots' activity" : ""}</span>
              <Select disabled={!owner} aria-label={`${d.name} emails`} value={d.approval} onChange={(e) => patch(d.kind, { approval: e.target.value })} style={{ padding: "7px 8px", fontSize: 13 }}>
                <option value="ask">Ask me first</option><option value="auto">Send on its own</option>
              </Select>
              <Toggle label={`${d.name} on`} disabled={!owner} on={d.enabled} onChange={(v) => patch(d.kind, { enabled: v })} />
            </div>
          );
        })}
      </Section>

      {owner && (
        <Section title="Shift hours">
          <Row first title="The team clocks in at" sub="When the night shift starts. Bots with their own schedule keep it.">
            <Input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} style={{ width: 140 }} />
            <Button size="sm" kind="outline" onClick={async () => { await api("/api/workspace", { method: "PATCH", json: { shift_start: shiftStart } }); toast({ text: "Saved." }); }}>Save</Button>
          </Row>
        </Section>
      )}

      <Section title="Guardrails">
        <Row first title="Pause reminders automatically when a client disputes an invoice" sub="Ledger stops and hands the dispute to you.">
          <Toggle label="Pause on dispute" disabled={!owner} on={dnc.data?.guardrails.pause_on_dispute !== false} onChange={(v) => guard("pause_on_dispute", v)} />
        </Row>
        <Row title="At most one follow-up per contact per week" sub="Applies to every bot that follows up or reminds, together.">
          <Toggle label="Weekly cap" disabled={!owner} on={dnc.data?.guardrails.weekly_cap !== false} onChange={(v) => guard("weekly_cap", v)} />
        </Row>
        <Row title="Never contact these people" sub={dnc.data ? `${dnc.data.entries.filter((e) => e.kind === "email").length} contacts, ${dnc.data.entries.filter((e) => e.kind === "domain").length} domains` : "…"}>
          {owner && <Button size="sm" kind="outline" onClick={() => { setDncText((dnc.data?.entries ?? []).map((e) => e.value).join("\n")); setEditDnc(true); }}>Edit list</Button>}
        </Row>
        {editDnc && (
          <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <TextArea rows={6} value={dncText} onChange={(e) => setDncText(e.target.value)} placeholder={"one per line:\nana@example.com\ncompetitor.com"} />
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" onClick={async () => { await api("/api/do-not-contact", { method: "PUT", json: { entries: dncText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) } }); setEditDnc(false); dnc.refresh(); toast({ text: "Saved." }); }}>Save list</Button>
              <Button size="sm" kind="ghost" onClick={() => setEditDnc(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </Section>

      {hiring && cat.data && <Hire catalog={cat.data} onClose={() => setHiring(false)} onHired={() => { cat.refresh(); refreshOffice(); }} max={me.plan.limits.bots} count={office?.desks.length ?? 0} />}
      <style>{`@media (max-width: 760px) { .ns-bot-head { display: none !important; } .ns-bot-row { grid-template-columns: 1fr auto !important; } .ns-bot-row > span { grid-column: 1 / -1; } }`}</style>
    </Page>
  );
}

// The hiring catalog: every bot for this industry (or any), by category, with a search.
function Hire({ catalog, onClose, onHired, max, count }: { catalog: Catalog; onClose: () => void; onHired: () => void; max: number; count: number }) {
  const { toast } = useApp();
  const [industry, setIndustry] = useState(catalog.industry);
  const [list, setList] = useState(catalog.bots);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (industry === catalog.industry) return queueMicrotask(() => setList(catalog.bots));
    api<Catalog>(`/api/catalog?industry=${industry}`).then((c) => setList(c.bots));
  }, [industry, catalog]);
  const shown = useMemo(() => list.filter((b) => !q || `${b.name} ${b.role} ${b.title}`.toLowerCase().includes(q.toLowerCase())), [list, q]);
  const groups = Object.entries(catalog.categories).map(([k, label]) => ({ k, label, bots: shown.filter((b) => b.category === k) })).filter((g) => g.bots.length);
  const hire = async (b: CatalogBot) => {
    setError(null);
    try {
      await api("/api/bots", { json: { kind: b.id } });
      setList((l) => l.map((x) => (x.id === b.id ? { ...x, hired: true } : x)));
      toast({ text: `${b.name} joined the team.` });
      onHired();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Hire a bot" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,17,26,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(860px,100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#f8f2e9", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e4d9ca", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>Hire a bot</div>
            <div style={{ fontSize: 13, color: "#776a5e" }}>{count} of {max} on your plan.</div>
          </div>
          <Select value={industry} onChange={(e) => setIndustry(e.target.value)} style={{ width: 240 }}>
            {Object.entries(catalog.industries).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
          <Button kind="ghost" onClick={onClose}>Close</Button>
        </div>
        <ErrorLine error={error} />
        <div style={{ overflowY: "auto", padding: "8px 22px 22px" }}>
          {groups.map((g) => (
            <div key={g.k} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#716459", marginBottom: 8 }}>{g.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 10 }}>
                {g.bots.map((b) => (
                  <div key={b.id} style={{ display: "flex", gap: 10, padding: 12, borderRadius: 12, background: "#fffbf4", border: "1px solid #e4d9ca" }}>
                    <div style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: `oklch(0.92 0.045 ${b.hue})`, display: "grid", placeItems: "center" }}><Head bot={{ kind: b.id, hue: b.hue }} size={2.4} /></div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700 }}>{b.name} <span style={{ fontWeight: 400, color: "#776a5e" }}>· {b.role}</span>{b.suggested && !b.hired && <span style={{ marginLeft: 6, fontSize: 11, color: "#8a4f14" }}>suggested</span>}</div>
                      <div style={{ fontSize: 13, color: "#5d5148", lineHeight: 1.4 }}>{b.title}</div>
                      {b.missing.length > 0 && <div style={{ fontSize: 12, color: "#8a4f14" }}>Needs {b.missing.join(", ")}</div>}
                      <div>{b.hired ? <span style={{ fontSize: 12.5, color: "#2f6b3a", fontWeight: 600 }}>On your team</span> : <Button size="sm" disabled={count >= max} onClick={() => hire(b)}>Hire {b.name}</Button>}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
