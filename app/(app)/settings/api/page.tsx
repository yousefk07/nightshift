"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { Page, Row, Section } from "@/components/settings";
import { Button, Input, Select } from "@/components/ui";
import { ago, api, useApi } from "@/lib/client";

// S3 API & CLI: install, sign in, and the keys and devices that can reach your workspace.
interface Token { id: string; name: string; scope: "full" | "read"; last_used_at: string | null; created_at: string }

export default function ApiPage() {
  const { me, toast } = useApp();
  const t = useApi<{ tokens: Token[] }>("/api/tokens");
  const [name, setName] = useState("API key");
  const [scope, setScope] = useState<"read" | "full">("read");
  const [fresh, setFresh] = useState<string | null>(null);
  const code = (s: string) => <pre style={{ margin: 0, padding: "10px 14px", borderRadius: 8, background: "#221a24", color: "#f1e6d6", fontSize: 13, overflowX: "auto" }}>{s}</pre>;
  const make = async () => {
    const r = await api<{ token: string }>("/api/tokens", { json: { name, scope } });
    setFresh(r.token);
    t.refresh();
  };
  return (
    <Page title="API & CLI" sub="Run the night shift from your terminal, or connect your own tools.">
      <Section title="The CLI">
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
          <span>Install it (Node 20 or newer), then sign in. <code>nightshift login</code> opens your browser to approve this device.</span>
          {code(`npm install -g github:yousefk07/nightshift\nnightshift login\nnightshift status\nnightshift queue\nnightshift approve 1 2`)}
          <span style={{ color: "#776a5e" }}>Tip: add <code>nightshift brief</code> to your shell profile. <a href="/docs">CLI docs →</a></span>
        </div>
      </Section>

      <Section title="Keys and devices">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 170px 120px 90px", padding: "10px 18px", fontSize: 12, fontWeight: 600, color: "#716459", textTransform: "uppercase", letterSpacing: ".06em" }}>
          <span>Key or device</span><span>Scope</span><span>Last used</span><span />
        </div>
        {(t.data?.tokens ?? []).map((x) => (
          <div key={x.id} style={{ display: "grid", gridTemplateColumns: "1fr 170px 120px 90px", alignItems: "center", padding: "12px 18px", borderTop: "1px solid #ece3d6", fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>{x.name}</span>
            <span>{x.scope === "full" ? "Full, approvals allowed" : "Read only"}</span>
            <span style={{ color: "#776a5e" }}>{x.last_used_at ? ago(x.last_used_at) : "Never"}</span>
            <Button size="sm" kind="ghost" onClick={async () => { await api(`/api/tokens?id=${x.id}`, { method: "DELETE" }); toast({ text: "Revoked." }); t.refresh(); }}>Revoke</Button>
          </div>
        ))}
        {t.data && t.data.tokens.length === 0 && <Row title="No keys or devices yet" sub="Run nightshift login on your computer, or make a key below." />}
        {me.user.role !== "viewer" && (
          <Row title="New API key" sub={me.plan.limits.api ? "Shown once. Keep it somewhere safe." : "The CLI works on every plan. API keys for your own tools are part of Team; you can still make read-only ones to try."}>
            <Input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
            <Select value={scope} onChange={(e) => setScope(e.target.value as "read" | "full")} style={{ width: 170 }}><option value="read">Read only</option><option value="full">Full, approvals allowed</option></Select>
            <Button size="sm" onClick={make}>Create</Button>
          </Row>
        )}
        {fresh && <div style={{ padding: "0 18px 18px" }}>{code(fresh)}<div style={{ fontSize: 12.5, color: "#776a5e", marginTop: 6 }}>Copy it now: it won&apos;t be shown again.</div></div>}
      </Section>
    </Page>
  );
}
