"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Page, Row, Section } from "@/components/settings";
import { Button, ErrorLine, Field, Input, Select, TextArea } from "@/components/ui";
import { api, useApi } from "@/lib/client";

// S5 Profile: the bots use it to write in your voice and keep to your hours.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
interface Profile { email: string; full_name?: string; phone?: string | null; signature?: string; working_hours?: { start: string; end: string; days: number[] } }

export default function ProfilePage() {
  const { me, toast, refreshMe } = useApp();
  const router = useRouter();
  const p = useApi<Profile>("/api/profile");
  const [f, setF] = useState({ full_name: "", phone: "", signature: "", start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5, 6] });
  const [tz, setTz] = useState(me.workspace.timezone);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  useEffect(() => {
    if (!p.data) return;
    const d = p.data;
    queueMicrotask(() => setF({ full_name: d.full_name ?? "", phone: d.phone ?? "", signature: d.signature ?? "", start: d.working_hours?.start ?? "09:00", end: d.working_hours?.end ?? "18:00", days: d.working_hours?.days ?? [1, 2, 3, 4, 5, 6] }));
  }, [p.data]);

  const save = async () => {
    setError(null);
    try {
      await api("/api/profile", { method: "PATCH", json: { full_name: f.full_name, phone: f.phone || null, signature: f.signature, working_hours: { start: f.start, end: f.end, days: f.days } } });
      if (me.user.role === "owner" && tz !== me.workspace.timezone) await api("/api/workspace", { method: "PATCH", json: { timezone: tz } });
      toast({ text: "Saved." });
      refreshMe();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Page title="Profile" sub="The bots use this to write in your voice and keep to your hours.">
      <Section>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
            <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Email"><Input value={p.data?.email ?? me.user.email} disabled /></Field>
            <Field label="Time zone" hint={me.user.role === "owner" ? "The whole workspace runs on this clock." : undefined}>
              <Select value={tz} disabled={me.user.role !== "owner"} onChange={(e) => setTz(e.target.value)}>
                {Intl.supportedValuesOf("timeZone").map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>
            <Field label="Phone" hint="Optional. Not used for texts yet; alerts go to the app and email."><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+1 647 555 0100" /></Field>
          </div>
          <Field label="Your working hours">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} style={{ width: 130 }} />
              <span>to</span>
              <Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} style={{ width: 130 }} />
              <div style={{ display: "flex", gap: 4 }}>
                {DAYS.map((d, i) => {
                  const on = f.days.includes(i);
                  return <button key={d} type="button" aria-pressed={on} onClick={() => setF({ ...f, days: on ? f.days.filter((x) => x !== i) : [...f.days, i].sort() })} style={{ padding: "6px 8px", borderRadius: 6, fontSize: 12.5, border: "1px solid #cdbfac", background: on ? "#2b2320" : "transparent", color: on ? "#fbf3e6" : "#2b2320" }}>{d}</button>;
                })}
              </div>
            </div>
          </Field>
          <Field label="Email signature and tone" hint="Penny learns from your sent mail too. This keeps her on track.">
            <TextArea rows={5} value={f.signature} onChange={(e) => setF({ ...f, signature: e.target.value })} placeholder={"Warm and short. First names. No exclamation marks.\n\nWarmly,\nSam"} />
          </Field>
          <ErrorLine error={error} />
          <div><Button onClick={save}>Save changes</Button></div>
        </div>
      </Section>

      {me.user.role === "owner" && (
        <Section title="Delete workspace">
          <Row first title="Delete this workspace" sub="Disconnects every tool and permanently deletes bot history after 30 days.">
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={`Type "${me.workspace.name}"`} style={{ width: 220 }} />
            <Button kind="danger" disabled={confirm !== me.workspace.name} onClick={async () => { await api("/api/workspace", { method: "DELETE" }); router.push("/"); }}>Delete…</Button>
          </Row>
        </Section>
      )}
    </Page>
  );
}
