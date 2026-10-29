"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { Page, Row, Section } from "@/components/settings";
import { Button, Input } from "@/components/ui";
import { ago, api, useApi } from "@/lib/client";

// Team memory: what every bot knows about your business, people and preferences. Add or delete any of it.
interface Memory { id: string; subject: string; fact: string; bot_id: string | null; created_at: string }

export default function MemoryPage() {
  const { office, me } = useApp();
  const [q, setQ] = useState("");
  const m = useApi<{ memories: Memory[] }>(`/api/memory${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const [subject, setSubject] = useState("");
  const [fact, setFact] = useState("");
  const who = (id: string | null) => office?.desks.find((d) => d.id === id)?.name ?? "You";
  const can = me.user.role !== "viewer";
  return (
    <Page title="Team memory" sub="What every bot knows. The bots add lasting facts as they work; you can add your own or delete any." action={<Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />}>
      {can && (
        <Section title="Add a fact">
          <form onSubmit={async (e) => { e.preventDefault(); await api("/api/memory", { json: { subject, fact } }); setSubject(""); setFact(""); m.refresh(); }} style={{ padding: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Input placeholder="About (e.g. Acme Hotels)" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: 220 }} />
            <Input required placeholder="The fact (e.g. Pays every invoice on the 15th)" value={fact} onChange={(e) => setFact(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
            <Button type="submit">Add</Button>
          </form>
        </Section>
      )}
      <Section>
        {m.data?.memories.length === 0 && <Row first title="Nothing yet" sub="As the bots learn things worth keeping, they show up here." />}
        {(m.data?.memories ?? []).map((x, i) => (
          <Row key={x.id} first={i === 0} title={x.subject ? <>{x.subject}: <span style={{ fontWeight: 400 }}>{x.fact}</span></> : x.fact} sub={`${who(x.bot_id)} · ${ago(x.created_at)}`}>
            {can && <Button size="sm" kind="ghost" onClick={async () => { await api(`/api/memory?id=${x.id}`, { method: "DELETE" }); m.refresh(); }}>Delete</Button>}
          </Row>
        ))}
      </Section>
    </Page>
  );
}
