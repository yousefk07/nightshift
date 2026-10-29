"use client";

import { useEffect, useState } from "react";
import { useApp, useRename } from "@/components/AppShell";
import { ConnectSheet, KINDS, PROVIDER_LABEL, Tile, type Kind } from "@/components/Connect";
import { Page } from "@/components/settings";
import { Button, Pill } from "@/components/ui";
import { ago, api, useApi } from "@/lib/client";

// S3 Connections: "Bots only see what's connected here." One card per kind of tool: what's connected, which bots
// use it, and a way to add one.
interface Conn { id: string; provider: string; kinds: string[]; account: string; status: string; health: string; used_by: string[]; last_synced_at: string | null; error: string | null }
const OAUTH = new Set(["google", "microsoft", "quickbooks", "xero", "freshbooks"]);

export default function ConnectionsPage() {
  const rename = useRename();
  const { me, toast, refreshMe } = useApp();
  const c = useApi<{ connections: Conn[]; missing: { kind: string; needed_by: string[] }[] }>("/api/connections");
  const owner = me.user.role === "owner";
  const [sheet, setSheet] = useState<Kind | null>(null);
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

  return (
    <Page title="Connections" sub="Bots only see what's connected here. Anything that sends or moves money waits for your approval.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: 14 }}>
        {(Object.keys(KINDS) as Kind[]).map((kind) => {
          const k = KINDS[kind];
          const mine = (c.data?.connections ?? []).filter((x) => x.kinds.includes(kind));
          const needed = c.data?.missing.find((m) => m.kind === kind)?.needed_by ?? [];
          const healthy = mine.every((x) => x.status === "ok");
          return (
            <section key={kind} style={{ background: "#fffbf4", border: `1px solid ${!mine.length && needed.length ? "#ecc98f" : "#e4d9ca"}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{k.label}</span>
                  {mine.length > 0 && <Pill tone={healthy ? "green" : "red"}>{healthy ? "Connected" : "Needs attention"}</Pill>}
                  {!mine.length && needed.length > 0 && <Pill tone="amber">{needed.join(" and ")} {needed.length > 1 ? "need" : "needs"} this</Pill>}
                </div>
                <div style={{ fontSize: 13, color: "#776a5e", marginTop: 3 }}>{rename(k.why)}</div>
              </div>

              {mine.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {mine.map((x) => (
                    <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #ece3d6", borderRadius: 12, padding: "10px 12px" }}>
                      <Tile p={x.provider} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.account}</div>
                        <div style={{ fontSize: 12.5, color: x.status === "ok" ? "#776a5e" : "var(--bad)" }}>
                          {x.status === "ok" ? <>Used by {x.used_by.join(", ") || "no bot yet"}{x.last_synced_at ? ` · synced ${ago(x.last_synced_at)}` : ""}</> : x.error?.slice(0, 120) ?? x.health}
                        </div>
                      </div>
                      {owner && x.status !== "ok" && OAUTH.has(x.provider) && <a href={`/api/connect/${x.provider}?return=/settings/connections`}><Button size="sm">Reconnect</Button></a>}
                      {owner && <Button size="sm" kind="ghost" onClick={() => disconnect(x)}>Disconnect</Button>}
                    </div>
                  ))}
                  {owner && <button onClick={() => setSheet(kind)} style={{ alignSelf: "flex-start", border: 0, background: "none", padding: 0, font: "inherit", fontSize: 13.5, fontWeight: 600, color: "#b46a22", cursor: "pointer" }}>+ Add another</button>}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto" }}>
                  <div style={{ display: "flex" }}>
                    {k.providers.slice(0, 4).map((p, i) => <span key={p} style={{ marginLeft: i ? -8 : 0, borderRadius: 10, boxShadow: "0 0 0 2px #fffbf4" }}><Tile p={p} size={30} /></span>)}
                  </div>
                  <span style={{ flex: 1, fontSize: 12.5, color: "#8a7d73" }}>{k.providers.map((p) => PROVIDER_LABEL[p].replace(/ \(.*\)$/, "")).join(", ")}</span>
                  {owner ? <Button size="sm" onClick={() => setSheet(kind)}>Connect</Button> : <span style={{ fontSize: 12.5, color: "#8a7d73" }}>The owner connects tools</span>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {sheet && <ConnectSheet kind={sheet} onClose={() => setSheet(null)} onDone={() => { setSheet(null); reload(); }} />}
    </Page>
  );
}
