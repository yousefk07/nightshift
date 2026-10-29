"use client";

import { useEffect } from "react";
import { useApp } from "@/components/AppShell";
import { ConnectButton, KINDS, PROVIDER_LABEL, type Kind } from "@/components/Connect";
import { Page, Row, Section } from "@/components/settings";
import { Button, Pill } from "@/components/ui";
import { ago, api, useApi } from "@/lib/client";

// S3 Connections: "Bots only see what's connected here."
interface Conn { id: string; provider: string; kinds: string[]; account: string; status: string; health: string; used_by: string[]; last_synced_at: string | null; error: string | null }
const OAUTH = new Set(["google", "microsoft", "quickbooks", "xero", "freshbooks"]);

export default function ConnectionsPage() {
  const { me, toast, refreshMe } = useApp();
  const c = useApi<{ connections: Conn[]; missing: { kind: string; needed_by: string[] }[] }>("/api/connections");
  const owner = me.user.role === "owner";
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("connected")) queueMicrotask(() => toast({ text: `${PROVIDER_LABEL[q.get("connected")!] ?? "Connected"} is connected.` }));
    if (q.get("connect_error")) queueMicrotask(() => toast({ text: `Couldn't connect: ${q.get("connect_error")}`, seconds: 8 }));
  }, [toast]);
  const reload = () => { c.refresh(); refreshMe(); };
  const disconnect = async (x: Conn) => {
    await api(`/api/connections/${x.id}`, { method: "DELETE" });
    toast({ text: `Disconnected ${PROVIDER_LABEL[x.provider] ?? x.provider}.` });
    reload();
  };
  const kindLabel = (k: string) => (KINDS as Record<string, { label: string }>)[k]?.label ?? k;

  return (
    <Page title="Connections" sub="Bots only see what's connected here. Anything that sends or moves money waits for your approval."
      action={owner && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{(Object.keys(KINDS) as Kind[]).map((k) => <ConnectButton key={k} kind={k} label={`+ ${KINDS[k].label}`} onDone={reload} />)}</div>}>
      {c.data?.missing.length ? (
        <div style={{ background: "#fbefd9", borderRadius: 10, padding: "12px 16px", fontSize: 14 }}>
          {c.data.missing.map((m) => `${m.needed_by.join(" and ")} ${m.needed_by.length > 1 ? "need" : "needs"} ${kindLabel(m.kind).toLowerCase()}`).join(". ")}.
        </div>
      ) : null}
      <Section>
        {!c.data ? <Row first title="Loading…" /> : c.data.connections.length === 0 ? <Row first title="Nothing connected yet" sub="Start with your email: it's what Penny works in." /> : c.data.connections.map((x, i) => (
          <Row key={x.id} first={i === 0}
            title={<>{x.kinds.map(kindLabel).join(" + ")} · {x.account}</>}
            sub={<>{PROVIDER_LABEL[x.provider] ?? x.provider} · used by {x.used_by.join(", ") || "no bot yet"}{x.last_synced_at ? ` · synced ${ago(x.last_synced_at)}` : ""}{x.error && x.status !== "ok" ? ` · ${x.error.slice(0, 120)}` : ""}</>}>
            <Pill tone={x.status === "ok" ? "green" : "red"}>{x.health}</Pill>
            {owner && x.status !== "ok" && OAUTH.has(x.provider) && <a href={`/api/connect/${x.provider}?return=/settings/connections`}><Button size="sm">Reconnect</Button></a>}
            {owner && <Button size="sm" kind="ghost" onClick={() => disconnect(x)}>Disconnect</Button>}
          </Row>
        ))}
      </Section>
    </Page>
  );
}
