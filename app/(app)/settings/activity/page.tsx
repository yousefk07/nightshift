"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { Page, Section } from "@/components/settings";
import { Button } from "@/components/ui";
import { api, useApi } from "@/lib/client";

// The activity log: who did what, and why.
interface Entry { id: number; who: string; actor_type: string; action: string; target: string; why: string; at: string }
const VERB: Record<string, string> = {
  approved: "approved", discarded: "discarded", undid: "took back", asked_for_changes: "asked for changes to", drafted: "drafted", sent_email: "sent an email to", sent_reminder: "sent a reminder to",
  issued_credit_note: "issued a credit note to", created_invoice: "invoiced", placed_hold: "paused outreach to", released_hold: "released a hold on", handed_off: "handed work to", hired: "hired",
  let_go: "let go", paused: "paused", resumed: "resumed", invited: "invited", joined: "joined", connected: "connected", changed_role: "changed a role for", removed_member: "removed", started_night_shift: "started the night shift", deleted_workspace: "deleted the workspace", billing: "billing:",
};

export default function ActivityPage() {
  const { me } = useApp();
  const first = useApi<{ kept_days: number | null; activity: Entry[] }>("/api/activity?limit=100");
  const [more, setMore] = useState<Entry[]>([]);
  const all = [...(first.data?.activity ?? []), ...more];
  const tz = me.workspace.timezone;
  const loadMore = async () => {
    const last = all.at(-1);
    if (!last) return;
    const r = await api<{ activity: Entry[] }>(`/api/activity?limit=100&before=${encodeURIComponent(last.at)}`);
    setMore((m) => [...m, ...r.activity]);
  };
  return (
    <Page title="Activity log" sub={`Every bot action and approval, who did it and why. Kept ${first.data?.kept_days ? `for ${first.data.kept_days >= 365 ? "1 year" : `${first.data.kept_days} days`}` : "for as long as you're with us"}.`}>
      <Section>
        {all.length === 0 && <div style={{ padding: 18, color: "#776a5e" }}>{first.data ? "Nothing yet." : "Loading…"}</div>}
        {all.map((e, i) => (
          <div key={e.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, padding: "11px 18px", borderTop: i ? "1px solid #ece3d6" : "none", fontSize: 14 }}>
            <span className="mono" style={{ fontSize: 12, color: "#716459", paddingTop: 2 }}>{new Date(e.at).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            <span><b>{e.who}</b> {VERB[e.action] ?? e.action.replace(/_/g, " ")} {e.target}{e.why ? <span style={{ color: "#776a5e" }}> · {e.why}</span> : null}</span>
          </div>
        ))}
      </Section>
      {all.length >= 100 && <div><Button kind="outline" onClick={loadMore}>Load older</Button></div>}
    </Page>
  );
}
