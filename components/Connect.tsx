"use client";

import { useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import { useRename } from "./AppShell";
import { Button, ErrorLine, Input, useDialog } from "./ui";

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

// How each provider looks in the list: a brand-coloured tile, a short name and what the bots get from it.
const LOOK: Record<string, { name: string; sees: string; tile: string; ink: string; mark: string }> = {
  google: { name: "Google", sees: "Gmail and Google Calendar", tile: "#fff", ink: "#4285f4", mark: "G" },
  microsoft: { name: "Microsoft 365", sees: "Outlook mail and calendar", tile: "#fff", ink: "#2f2f2f", mark: "ms" },
  quickbooks: { name: "QuickBooks Online", sees: "Invoices, customers and payments", tile: "#2ca01c", ink: "#fff", mark: "qb" },
  xero: { name: "Xero", sees: "Invoices, contacts and payments", tile: "#13b5ea", ink: "#fff", mark: "x" },
  freshbooks: { name: "FreshBooks", sees: "Invoices, clients and payments", tile: "#0075dd", ink: "#fff", mark: "F" },
  stripe: { name: "Stripe", sees: "Invoices and charges, with a restricted key", tile: "#635bff", ink: "#fff", mark: "S" },
  hubspot: { name: "HubSpot", sees: "Contacts and their last touch", tile: "#ff7a59", ink: "#fff", mark: "H" },
  sheets: { name: "Google Sheet", sees: "A lead list kept in a spreadsheet", tile: "#0f9d58", ink: "#fff", mark: "▦" },
  csv: { name: "Upload a CSV", sees: "Bring contacts in once, from a file", tile: "#efe6d8", ink: "#5d5148", mark: "csv" },
  shopify: { name: "Shopify", sees: "Orders, products and stock", tile: "#95bf47", ink: "#fff", mark: "S" },
};

// The steps to get a key, for the providers that take one.
const STEPS: Record<string, ReactNode[]> = {
  stripe: ["In Stripe, open Developers → API keys.", <>Click <b>Create restricted key</b>.</>, <>Give it <b>Invoices</b> read and write, and <b>Charges</b> read. Leave the rest off.</>, "Copy the key that starts with rk_live_ and paste it here."],
  shopify: ["In Shopify admin, open Settings → Apps and sales channels → Develop apps.", <>Create an app, then under Admin API scopes tick <b>read_orders</b> and <b>read_products</b>.</>, <>Install it and reveal the <b>Admin API access token</b> (starts with shpat_).</>],
  hubspot: ["In HubSpot, open Settings → Integrations → Private apps.", <>Create a private app with <b>crm.objects.contacts</b> read and write.</>, "Copy its access token (starts with pat-)."],
  sheets: [<>Columns like <b>Name, Email, Company, Stage, Last contacted</b>. Extra columns are fine.</>, "Share the sheet with your connected Google account, or keep it in that account.", "Paste the link from the address bar."],
  csv: [<>A header row with <b>Name, Email, Company, Stage, Last contacted</b>.</>, "Anything else in the file is ignored. You can import again later."],
};

export function Tile({ p, size = 40 }: { p: string; size?: number }) {
  const l = LOOK[p];
  if (p === "microsoft") {
    const q = Math.round(size * 0.22);
    return (
      <span style={{ width: size, height: size, borderRadius: 10, background: "#fff", border: "1px solid #e4d9cb", display: "grid", placeItems: "center", flex: "none" }}>
        <span style={{ display: "grid", gridTemplateColumns: `${q}px ${q}px`, gap: 2 }}>
          {["#f25022", "#7fba00", "#00a4ef", "#ffb900"].map((c) => <span key={c} style={{ width: q, height: q, background: c }} />)}
        </span>
      </span>
    );
  }
  return (
    <span style={{ width: size, height: size, borderRadius: 10, background: l.tile, color: l.ink, border: l.tile === "#fff" ? "1px solid #e4d9cb" : "none", display: "grid", placeItems: "center", flex: "none", fontWeight: 800, fontSize: l.mark.length > 1 ? size * 0.34 : size * 0.46, letterSpacing: "-0.02em", fontFamily: "var(--font-sans)" }}>
      {l.mark}
    </span>
  );
}

const Chevron = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden style={{ flex: "none", color: "#a3968a" }}><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Lock = () => <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden style={{ flex: "none", marginTop: 2 }}><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;

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
  const rename = useRename();
  const k = KINDS[kind];
  const only = k.providers.length === 1 && !OAUTH.has(k.providers[0]) ? k.providers[0] : null; // one choice: skip the list
  const [provider, setProvider] = useState<string | null>(only);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((x) => ({ ...x, [f]: e.target.value }));
  const back = typeof location !== "undefined" ? location.pathname : "/settings/connections";

  const panel = useDialog(onClose);

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

  const ready = provider === "csv" || (provider === "stripe" ? !!fields.key : provider === "shopify" ? !!fields.shop && !!fields.token : provider === "hubspot" ? !!fields.token : !!fields.url);
  const label: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, display: "flex", flexDirection: "column", gap: 6 };
  const secret: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 13.5 };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Connect ${k.label}`} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,17,26,.55)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div ref={panel} onClick={(e) => e.stopPropagation()} style={{ width: "min(480px,100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "#fbf7f1", color: "#2b2320", borderRadius: 16, boxShadow: "0 30px 70px -20px rgba(20,12,18,.55)", border: "1px solid #e4d9cb" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "20px 20px 0" }}>
          {provider && <Tile p={provider} size={44} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#b46a22" }}>Connect {k.label.toLowerCase()}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{provider ? LOOK[provider].name : `Where does your ${k.label.toLowerCase()} live?`}</div>
            <div style={{ fontSize: 13.5, color: "#776a5e", marginTop: 4 }}>{provider ? LOOK[provider].sees : rename(k.why)}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: "transparent", color: "#776a5e", cursor: "pointer", fontSize: 20, lineHeight: 1, flex: "none" }}>×</button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {!provider ? (
            <div style={{ display: "flex", flexDirection: "column", background: "#fff", border: "1px solid #e4d9cb", borderRadius: 12, overflow: "hidden" }}>
              {k.providers.map((p, i) => {
                const row = (
                  <>
                    <Tile p={p} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "#2b2320" }}>{LOOK[p].name}</span>
                      <span style={{ display: "block", fontSize: 13, color: "#776a5e" }}>{LOOK[p].sees}</span>
                    </span>
                    <span style={{ fontSize: 12, color: "#8a7d73", whiteSpace: "nowrap" }}>{OAUTH.has(p) ? `Sign in` : p === "csv" ? "Upload" : p === "sheets" ? "Paste a link" : "Paste a key"}</span>
                    <Chevron />
                  </>
                );
                const style: React.CSSProperties = { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", boxShadow: i ? "inset 0 1px 0 #efe6d8" : "none", textDecoration: "none", background: "transparent", border: 0, width: "100%", textAlign: "left", cursor: "pointer", font: "inherit" };
                return OAUTH.has(p)
                  ? <a key={p} href={`/api/connect/${p}?return=${encodeURIComponent(back)}`} className="ns-connect-row" style={style}>{row}</a>
                  : <button key={p} onClick={() => setProvider(p)} className="ns-connect-row" style={style}>{row}</button>;
              })}
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {STEPS[provider] && (
                <ol style={{ margin: 0, padding: "12px 14px 12px 34px", background: "#f4ede2", borderRadius: 10, fontSize: 13.5, lineHeight: 1.55, color: "#4a3f38", display: "flex", flexDirection: "column", gap: 4 }}>
                  {STEPS[provider].map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
              {provider === "stripe" && <label style={label}>Restricted key<Input value={fields.key ?? ""} onChange={set("key")} placeholder="rk_live_…" autoComplete="off" spellCheck={false} style={secret} /></label>}
              {provider === "shopify" && (
                <>
                  <label style={label}>Store address<Input value={fields.shop ?? ""} onChange={set("shop")} placeholder="your-store.myshopify.com" autoComplete="off" spellCheck={false} /></label>
                  <label style={label}>Admin API access token<Input value={fields.token ?? ""} onChange={set("token")} placeholder="shpat_…" autoComplete="off" spellCheck={false} style={secret} /></label>
                </>
              )}
              {provider === "hubspot" && <label style={label}>Private app token<Input value={fields.token ?? ""} onChange={set("token")} placeholder="pat-…" autoComplete="off" spellCheck={false} style={secret} /></label>}
              {provider === "sheets" && <label style={label}>Link to the sheet<Input value={fields.url ?? ""} onChange={set("url")} placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" /></label>}
              {provider === "csv" && (
                <label style={{ ...label, alignItems: "flex-start", padding: 16, border: "1.5px dashed #d5c7b6", borderRadius: 12, background: "#fff", cursor: "pointer" }}>
                  Choose your contacts file
                  <input id="ns-csv" type="file" accept=".csv,text/csv" style={{ fontWeight: 400, fontSize: 13.5 }} />
                </label>
              )}
              <ErrorLine error={error} />
              {done && <div style={{ fontSize: 14, color: "#2f6b3a", fontWeight: 600 }}>✓ {done}</div>}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button type="submit" disabled={busy || !ready}>{busy ? "Checking…" : provider === "csv" ? "Import contacts" : `Connect ${LOOK[provider].name}`}</Button>
                {!only && <Button kind="ghost" onClick={() => { setProvider(null); setError(null); }}>Back</Button>}
              </div>
            </form>
          )}

          <div style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#8a7d73", lineHeight: 1.5, borderTop: "1px solid #efe6d8", paddingTop: 12 }}>
            <Lock />
            <span>Stored encrypted. Bots read and draft; anything that sends or moves money waits for your OK. Disconnect any time.</span>
          </div>
        </div>
      </div>
      <style>{`.ns-connect-row:hover { background: #faf5ee !important; } .ns-connect-row:focus-visible { outline: 2px solid #b46a22; outline-offset: -2px; }`}</style>
    </div>
  );
}
