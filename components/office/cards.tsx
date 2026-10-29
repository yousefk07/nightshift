"use client";

import { useState } from "react";
import { api, clock, money } from "@/lib/client";
import { useApp, useApprove, type DeskInfo } from "../AppShell";
import { Head } from "../pixel";
import { Button, ErrorLine, Input, Label, TextArea } from "../ui";

// Approval cards, the way the design shows them: a row on the desk, a draft card in chat, and the review sheet.

export interface Action {
  id: string; bot_id: string; tool: string; risk: "message" | "money"; title: string; counterparty: string | null;
  amount_cents: number | null; currency: string | null; payload: Record<string, any>; group_key: string | null; status: string; created_at: string;
}

// The persona tile beside a name (36px, tinted with the bot's hue).
export function BotTile({ desk, size = 36 }: { desk: Pick<DeskInfo, "kind" | "hue" | "prop"> | undefined; size?: number }) {
  const hue = desk?.hue ?? 30;
  return (
    <div style={{ width: size, height: size, flex: "none", borderRadius: size / 4, background: `oklch(0.92 0.045 ${hue})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {desk && <Head bot={desk} size={size >= 50 ? 4 : size >= 34 ? 2.5 : 2} />}
    </div>
  );
}

export const useDesks = () => {
  const { office } = useApp();
  const byId = (id: string | null | undefined) => office?.desks.find((d) => d.id === id);
  const byKind = (kind: string) => office?.desks.find((d) => d.kind === kind);
  return { desks: office?.desks ?? [], byId, byKind };
};

// What a card says under its title: "Ledger · $1,240.00", "Penny · email".
export function cardDetail(a: Action, botName: string) {
  if (a.amount_cents != null) return `${botName} · ${money(a.amount_cents, a.currency ?? "USD")}`;
  if (a.tool === "send_email") return `${botName} · email`;
  if (a.tool === "create_event") return `${botName} · calendar`;
  if (a.tool === "send_invoice_reminder") return `${botName} · reminder`;
  return botName;
}

// Can this person approve this card? Viewers can't; "Approver: email only" can't approve money.
export function useCanApprove() {
  const { me } = useApp();
  return (a: Pick<Action, "risk">) => me.user.role === "owner" || me.user.role === "approver" || (me.user.role === "approver_email" && a.risk === "message");
}

// A row on Your desk: tile, title, detail, Review.
export function ActionRow({ a, onReview, last }: { a: Action; onReview: () => void; last?: boolean }) {
  const { byId } = useDesks();
  const d = byId(a.bot_id);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: last ? "none" : "1px solid #ece3d6" }}>
      <BotTile desk={d} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
        <span style={{ fontSize: 12.5, color: "#776a5e" }}>{cardDetail(a, d?.name ?? "A bot")}</span>
      </div>
      <Button size="sm" onClick={onReview}>Review</Button>
    </div>
  );
}

const PRETTY: Record<string, string> = { to: "To", subject: "Subject", body: "Message", customer: "Customer", amount: "Amount", reason: "Reason", invoice_id: "Invoice", title: "Title", start: "Starts", end: "Ends", attendees: "Invite", email: "Email", memo: "Note", due_in_days: "Due in (days)" };
const HIDDEN = new Set(["reply_to_id", "group", "currency", "company"]);
const LONG = new Set(["body", "reason", "description", "memo"]);

// The review sheet (M3 / "Open" / "Review"): read the draft, edit any field, then approve, discard or ask for changes.
export function Review({ a, onClose, onDone, pager }: { a: Action; onClose: () => void; onDone: () => void; pager?: { n: number; of: number; prev?: () => void; next?: () => void } }) {
  const { byId } = useDesks();
  const { me, toast } = useApp();
  const approve = useApprove();
  const can = useCanApprove()(a);
  const bot = byId(a.bot_id);
  const [fields, setFields] = useState<Record<string, any>>(a.payload);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edited = JSON.stringify(fields) !== JSON.stringify(a.payload);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const isEmail = a.tool === "send_email";
  const keys = Object.keys(fields).filter((k) => !HIDDEN.has(k));

  return (
    <div role="dialog" aria-modal="true" aria-label={a.title} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,17,26,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "92vh", overflow: "auto", background: "#f8f2e9", color: "#2b2320", borderRadius: 14, boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e4d9ca", display: "flex", alignItems: "center", gap: 12 }}>
          {pager && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#776a5e" }}>
              <button aria-label="Previous" disabled={!pager.prev} onClick={pager.prev} style={{ background: "none", border: "none", fontSize: 18, opacity: pager.prev ? 1 : 0.3 }}>‹</button>
              {pager.n} of {pager.of}
              <button aria-label="Next" disabled={!pager.next} onClick={pager.next} style={{ background: "none", border: "none", fontSize: 18, opacity: pager.next ? 1 : 0.3 }}>›</button>
            </div>
          )}
          <BotTile desk={bot} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "#776a5e" }}>{bot?.name ?? "A bot"} drafted this at {clock(a.created_at, me.workspace.timezone)}</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{a.title}</div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", fontSize: 20, color: "#5d5148" }}>×</button>
        </div>

        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {a.amount_cents != null && (
            <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid #e4d9ca", borderRadius: 8, background: "#fffaf3", fontSize: 13.5 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "#2b2320", color: "#fbf3e6", padding: "2px 5px", borderRadius: 4 }}>{a.risk === "money" ? "MONEY" : "AMOUNT"}</span>
              {a.counterparty ? `${a.counterparty} · ` : ""}{money(a.amount_cents, a.currency ?? "USD")}
            </div>
          )}
          {keys.map((k) => {
            const v = fields[k];
            const text = Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "");
            if (!editing) {
              return (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Label>{PRETTY[k] ?? k.replace(/_/g, " ")}</Label>
                  <div style={{ fontSize: k === "subject" ? 15 : 14, fontWeight: k === "subject" ? 600 : 400, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{text}</div>
                </div>
              );
            }
            const set = (val: string) => setFields((f) => ({ ...f, [k]: Array.isArray(v) ? val.split(",").map((s) => s.trim()).filter(Boolean) : typeof v === "number" ? Number(val) : val }));
            return (
              <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Label>{PRETTY[k] ?? k.replace(/_/g, " ")}</Label>
                {LONG.has(k) || text.length > 80 ? <TextArea rows={k === "body" ? 9 : 3} value={text} onChange={(e) => set(e.target.value)} /> : <Input value={text} onChange={(e) => set(e.target.value)} />}
              </label>
            );
          })}

          {asking && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Label>What should {bot?.name ?? "the bot"} change?</Label>
              <TextArea rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say 2 PM instead, and sound a little warmer." />
            </label>
          )}
          <ErrorLine error={error} />
          {!can && <div style={{ fontSize: 12.5, color: "#776a5e" }}>{me.user.role === "viewer" ? "Viewers can read drafts but not approve them." : "Your role approves email only. An owner or approver has to approve money."}</div>}
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid #e4d9ca", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {asking ? (
            <>
              <Button disabled={busy || note.trim().length < 2} onClick={() => run(async () => { await api(`/api/actions/${a.id}`, { json: { decision: "revise", note } }); toast({ text: `Sent back to ${bot?.name ?? "the bot"} with your note.` }); })}>Send to {bot?.name ?? "bot"}</Button>
              <Button kind="outline" onClick={() => setAsking(false)}>Cancel</Button>
            </>
          ) : (
            <>
              <Button disabled={!can || busy} onClick={() => run(() => approve(a.id, a.title, edited ? fields : undefined))}>{isEmail ? "Approve & send" : a.risk === "money" ? "Approve" : "Approve"}</Button>
              <Button kind="outline" disabled={me.user.role === "viewer"} onClick={() => setEditing((e) => !e)}>{editing ? "Done editing" : "Edit"}</Button>
              <Button kind="outline" disabled={me.user.role === "viewer"} onClick={() => setAsking(true)}>Ask {bot?.name ?? "the bot"}</Button>
              <span style={{ flex: 1 }} />
              <Button kind="ghost" disabled={me.user.role === "viewer" || busy} onClick={() => run(async () => { await api(`/api/actions/${a.id}`, { json: { decision: "discard" } }); toast({ text: "Discarded." }); })}>Discard</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// The inline draft card in a chat (02): a "Draft email · to …" header, subject and body, then Approve & send /
// Edit / Discard. Collapsed: one line with Open (the design's second, folded card).
export function DraftCard({ a, onChanged, collapsed }: { a: Action; onChanged: () => void; collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const approve = useApprove();
  const can = useCanApprove()(a);
  const { toast, me } = useApp();
  const done = a.status !== "pending";
  const p = a.payload;
  const email = a.tool === "send_email";
  const label = email ? "Draft email" : a.risk === "money" ? "Needs your approval" : "Draft";
  const head = { fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#8a4f14" };
  const btn = { fontSize: 13.5 };
  const status = a.status === "done" ? "Sent" : a.status === "sending" ? "Sending…" : a.status === "rejected" ? "Discarded" : a.status === "revising" ? "Being redrafted" : a.status;
  if (collapsed && !done) {
    return (
      <div style={{ background: "#fffbf4", border: "1px solid #e1d5c5", borderRadius: 14, display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={head}>{label}{a.counterparty ? ` · ${a.counterparty}` : ""}</span>
          <span style={{ fontSize: 14, color: "#4a3f38", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email ? `"${String(p.body ?? "").slice(0, 90)}…"` : a.title}</span>
        </div>
        <Button kind="outline" style={btn} onClick={() => setOpen(true)}>Open</Button>
        {open && <Review a={a} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
      </div>
    );
  }
  return (
    <div style={{ background: "#fffbf4", border: "1px solid #e1d5c5", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 0 #e1d5c5", opacity: done ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", borderBottom: "1px solid #ece3d6", background: "#fbf4e9" }}>
        <span style={head}>{label}</span>
        <span style={{ fontSize: 12.5, color: "#716459", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{done ? status : email ? `to ${p.to}` : a.amount_cents != null ? money(a.amount_cents, a.currency ?? "USD") : ""}</span>
      </div>
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{email ? p.subject : a.title}</div>
        {email && <div style={{ fontSize: 14, lineHeight: 1.6, color: "#4a3f38", whiteSpace: "pre-wrap" }}>{p.body}</div>}
        {!email && a.counterparty && <div style={{ fontSize: 14, color: "#4a3f38" }}>{a.counterparty}{a.amount_cents != null ? ` · ${money(a.amount_cents, a.currency ?? "USD")}` : ""}</div>}
      </div>
      {!done && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderTop: "1px solid #ece3d6" }}>
          <Button style={btn} disabled={!can} onClick={async () => { await approve(a.id, a.title); onChanged(); }}>{email ? "Approve & send" : "Approve"}</Button>
          <Button kind="outline" style={btn} disabled={me.user.role === "viewer"} onClick={() => setOpen(true)}>Edit</Button>
          <Button kind="ghost" style={{ ...btn, marginLeft: "auto", color: "#6a5d52" }} disabled={me.user.role === "viewer"} onClick={async () => { await api(`/api/actions/${a.id}`, { json: { decision: "discard" } }); toast({ text: "Discarded." }); onChanged(); }}>Discard</Button>
        </div>
      )}
      {open && <Review a={a} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </div>
  );
}

// The brief card on Your desk (clipboard clip on top, headline, bullets).
export function BriefCard({ brief, finalAt, compact }: { brief: { headline: string; content: string; status: string } | null; finalAt: string; compact?: boolean }) {
  const lines = (brief?.content ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*] /.test(l)).map((l) => l.replace(/^[-*] /, ""));
  const first = brief?.headline || lines.find((l) => !/^[-*#]/.test(l)) || "";
  const at = new Date(`2000-01-01T${finalAt}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <div style={{ position: "relative", background: "#fffbf3", border: "1px solid #e4d9ca", borderRadius: 10, padding: "22px 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "absolute", left: "50%", top: -8, width: 64, height: 14, marginLeft: -32, background: "#b9b0a6", border: "3px solid #2a1f2b" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="pixel" style={{ fontSize: 17 }}>Morning brief</span>
        <span style={{ fontSize: 12, color: "#716459" }}>by Dawn · {brief?.status === "final" ? "final" : `final at ${at}`}</span>
      </div>
      {!brief ? (
        <div style={{ fontSize: 14, color: "#776a5e" }}>Dawn writes it before {at}. Check back in the morning.</div>
      ) : (
        <>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{first}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, lineHeight: 1.45 }}>
            {(compact ? bullets.slice(0, 4) : bullets).map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ width: 6, height: 6, flex: "none", marginTop: 7, background: i === 0 ? "oklch(0.7 0.13 65)" : "#b8aa9c" }} />
                <span dangerouslySetInnerHTML={{ __html: b.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
