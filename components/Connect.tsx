"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, ErrorLine, Input } from "./ui";

// Connecting a tool: which providers each kind offers, and the small form for the ones that take a key or a link.

export const KINDS = {
  email: { label: "Email", why: "So Penny can read, flag and draft replies", providers: ["google", "microsoft"] },
  accounting: { label: "Accounting", why: "So Ledger can see invoices and payments", providers: ["quickbooks", "xero", "freshbooks", "stripe"] },
  crm: { label: "CRM or lead list", why: "So Nudge knows who's gone quiet. A spreadsheet works too.", providers: ["hubspot", "sheets", "csv"] },
  calendar: { label: "Calendar", why: "Optional. Helps Penny offer real times.", providers: ["google", "microsoft"] },
  store: { label: "Online store", why: "So the bots can see orders and stock", providers: ["shopify"] },
} as const;
export type Kind = keyof typeof KINDS;

export const PROVIDER_LABEL: Record<string, string> = {
  google: "Google (Gmail + Calendar)", microsoft: "Microsoft 365 / Outlook", quickbooks: "QuickBooks Online", xero: "Xero", freshbooks: "FreshBooks",
  stripe: "Stripe", hubspot: "HubSpot", sheets: "Google Sheet", csv: "Upload a CSV", shopify: "Shopify",
};
const OAUTH = new Set(["google", "microsoft", "quickbooks", "xero", "freshbooks"]);

// A connect button that opens the provider list for one kind.
export function ConnectButton({ kind, onDone, label = "Connect", size = "sm" }: { kind: Kind; onDone: () => void; label?: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button kind="outline" size={size} onClick={() => setOpen(true)}>{label}</Button>
      {open && <ConnectSheet kind={kind} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone(); }} />}
    </>
  );
}

export function ConnectSheet({ kind, onClose, onDone }: { kind: Kind; onClose: () => void; onDone: () => void }) {
  const [provider, setProvider] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const k = KINDS[kind];
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((x) => ({ ...x, [f]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (provider === "csv") {
        const input = document.getElementById("ns-csv") as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) throw new Error("Pick a CSV file.");
        const form = new FormData();
        form.append("file", file);
        const r = await api<{ imported: number }>("/api/contacts/import", { method: "POST", body: form });
        setDone(`Imported ${r.imported} contacts.`);
      } else {
        const body = provider === "stripe" ? { key: fields.key } : provider === "shopify" ? { shop: fields.shop, token: fields.token } : provider === "hubspot" ? { token: fields.token } : { url: fields.url };
        const r = await api<{ contacts?: number }>(`/api/connect/${provider}`, { json: body });
        setDone(r.contacts != null ? `Connected. ${r.contacts} contacts synced.` : "Connected.");
      }
      setTimeout(onDone, 900);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Connect ${k.label}`} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,17,26,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(460px,100%)", background: "#f8f2e9", color: "#2b2320", borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", gap: 14, boxShadow: "var(--shadow)" }}>
        <div style={{ fontSize: 19, fontWeight: 700 }}>Connect {k.label.toLowerCase()}</div>
        <div style={{ fontSize: 13.5, color: "#776a5e" }}>Bots get read and draft access. Anything that sends or moves money waits for your approval.</div>
        {!provider ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {k.providers.map((p) =>
              OAUTH.has(p) ? (
                <a key={p} href={`/api/connect/${p}?return=${encodeURIComponent(typeof location !== "undefined" ? location.pathname : "/settings/connections")}`} style={{ textDecoration: "none" }}><Button kind="outline" style={{ width: "100%", background: "#fff", justifyContent: "flex-start", textAlign: "left" }}>{PROVIDER_LABEL[p]}</Button></a>
              ) : (
                <Button key={p} kind="outline" style={{ width: "100%", background: "#fff", textAlign: "left" }} onClick={() => setProvider(p)}>{PROVIDER_LABEL[p]}</Button>
              ),
            )}
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {provider === "stripe" && <label style={{ fontSize: 13.5, fontWeight: 600 }}>Restricted key<Input value={fields.key ?? ""} onChange={set("key")} placeholder="rk_live_…" style={{ marginTop: 6 }} /><span style={{ fontWeight: 400, fontSize: 12.5, color: "#776a5e" }}>Stripe → Developers → API keys → Create restricted key, with Invoices and Charges read and Invoices write.</span></label>}
            {provider === "shopify" && (
              <>
                <label style={{ fontSize: 13.5, fontWeight: 600 }}>Store address<Input value={fields.shop ?? ""} onChange={set("shop")} placeholder="your-store.myshopify.com" style={{ marginTop: 6 }} /></label>
                <label style={{ fontSize: 13.5, fontWeight: 600 }}>Admin API access token<Input value={fields.token ?? ""} onChange={set("token")} placeholder="shpat_…" style={{ marginTop: 6 }} /><span style={{ fontWeight: 400, fontSize: 12.5, color: "#776a5e" }}>Shopify admin → Settings → Apps → Develop apps → create one with read_orders and read_products.</span></label>
              </>
            )}
            {provider === "hubspot" && <label style={{ fontSize: 13.5, fontWeight: 600 }}>Private app token<Input value={fields.token ?? ""} onChange={set("token")} placeholder="pat-…" style={{ marginTop: 6 }} /><span style={{ fontWeight: 400, fontSize: 12.5, color: "#776a5e" }}>HubSpot → Settings → Integrations → Private apps, with contacts read and write.</span></label>}
            {provider === "sheets" && <label style={{ fontSize: 13.5, fontWeight: 600 }}>Link to the sheet<Input value={fields.url ?? ""} onChange={set("url")} placeholder="https://docs.google.com/spreadsheets/d/…" style={{ marginTop: 6 }} /><span style={{ fontWeight: 400, fontSize: 12.5, color: "#776a5e" }}>Columns like Name, Email, Company, Stage and Last contacted. Needs Google connected.</span></label>}
            {provider === "csv" && <label style={{ fontSize: 13.5, fontWeight: 600 }}>Your contacts as a CSV<input id="ns-csv" type="file" accept=".csv,text/csv" style={{ marginTop: 8, display: "block" }} /><span style={{ fontWeight: 400, fontSize: 12.5, color: "#776a5e" }}>A header row with Name, Email, Company, Stage, Last contacted. Any extra columns are ignored.</span></label>}
            <ErrorLine error={error} />
            {done && <div style={{ fontSize: 13.5, color: "#2f6b3a" }}>{done}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="submit" disabled={busy}>{busy ? "Checking…" : provider === "csv" ? "Import" : "Connect"}</Button>
              <Button kind="ghost" onClick={() => setProvider(null)}>Back</Button>
            </div>
          </form>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}><Button kind="ghost" onClick={onClose}>Close</Button></div>
      </div>
    </div>
  );
}
