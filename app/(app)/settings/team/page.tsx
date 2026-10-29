"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { Page, Row, Section } from "@/components/settings";
import { Button, ErrorLine, Input, Pill, Select } from "@/components/ui";
import { api, useApi } from "@/lib/client";

// S6 Team: "People who can see the office and approve drafts."
interface Team { members: { user_id: string; email: string; name: string; role: string; role_label: string; you: boolean }[]; invites: { id: string; email: string; role: string; role_label: string; created_at: string; expired: boolean }[]; seats: { used: number; of: number }; roles: Record<string, string> }

export default function TeamPage() {
  const { me, toast } = useApp();
  const t = useApi<Team>("/api/team");
  const owner = me.user.role === "owner";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("approver_email");
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) toast({ text: done });
      t.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const roles = Object.entries(t.data?.roles ?? {}).filter(([k]) => k !== "owner");
  return (
    <Page title="Team" sub={`People who can see the office and approve drafts.${t.data ? ` ${t.data.seats.used} of ${t.data.seats.of} approver seats used.` : ""}`}>
      <ErrorLine error={error} />
      <Section>
        {(t.data?.members ?? []).map((m, i) => (
          <Row key={m.user_id} first={i === 0} title={<>{m.name || m.email}{m.you ? " (you)" : ""}</>} sub={m.name ? m.email : undefined}>
            {m.role === "owner" || !owner || m.you ? <Pill tone="grey">{m.role_label}</Pill> : (
              <>
                <Select value={m.role} onChange={(e) => run(() => api(`/api/team/${m.user_id}`, { method: "PATCH", json: { role: e.target.value } }), "Role changed.")} style={{ width: 200 }}>
                  {roles.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
                <Button size="sm" kind="ghost" onClick={() => run(() => api(`/api/team/${m.user_id}`, { method: "DELETE" }), "Removed.")}>Remove</Button>
              </>
            )}
          </Row>
        ))}
        {(t.data?.invites ?? []).map((inv) => (
          <Row key={inv.id} title={inv.email} sub={`${inv.expired ? "Invite expired" : `Invited ${new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`} · ${inv.role_label}`}>
            {owner && <Button size="sm" kind="outline" onClick={() => run(() => api("/api/team", { json: { email: inv.email, role: inv.role } }), "Invite sent again.")}>Resend</Button>}
            {owner && <Button size="sm" kind="ghost" onClick={() => run(() => api(`/api/team?invite=${inv.id}`, { method: "DELETE" }))}>Cancel</Button>}
          </Row>
        ))}
      </Section>
      {owner && (
        <Section title="Invite person">
          <form onSubmit={(e) => { e.preventDefault(); run(() => api("/api/team", { json: { email, role } }), `Invite sent to ${email}.`).then(() => setEmail("")); }} style={{ padding: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Input type="email" required placeholder="name@yourbusiness.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 220 }}>{roles.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            <Button type="submit">Send invite</Button>
          </form>
          <div style={{ padding: "0 18px 18px", fontSize: 13, color: "#776a5e" }}>Approvers can approve everything, money included. &quot;Email only&quot; approvers can send drafted emails but not money. Viewers can look but not approve. Invites expire in 7 days.</div>
        </Section>
      )}
    </Page>
  );
}
