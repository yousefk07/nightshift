"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, clock, money } from "@/lib/client";
import { useApp, type DeskInfo } from "../AppShell";
import { TypingDots } from "../pixel";
import { Button } from "../ui";
import { BotTile, Review, useCanApprove, type Action } from "./cards";

// 03 Bot room: where the team hands work to each other, and where the owner can jump in.

interface Msg { id: string; role: "owner" | "bot" | "system"; kind: "text" | "handoff" | "hold" | "approval" | "event"; bot_id: string | null; content: string; data: Record<string, any>; created_at: string }
interface Room { thread_id: string; messages: Msg[]; in_the_room: { id: string; name: string; status: string; status_text: string }[]; holds: { id: string; label: string; scope: string; reason: string; by: string }[] }

const nameColor = (hue: number) => `oklch(0.5 0.11 ${hue})`;

// "@Ledger" in a message, in the bot's colour.
function Mentions({ text, desks }: { text: string; desks: DeskInfo[] }) {
  const parts = text.split(/(@[\p{L}][\p{L}\d_.-]*)/u);
  return (
    <>
      {parts.map((p, i) => {
        const d = p.startsWith("@") ? desks.find((x) => x.name.toLowerCase() === p.slice(1).toLowerCase() || x.kind === p.slice(1).toLowerCase()) : undefined;
        return d ? <span key={i} style={{ fontWeight: 600, color: `oklch(0.48 0.1 ${d.hue})` }}>{p}</span> : <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "5px 10px", borderRadius: 8, background: "#efe6d8", color: "#5d5148" }}>{children}</div>;
}

// "Needs your approval · 2 items" with Approve both / Review.
function ApprovalGroup({ items, onChanged }: { items: Action[]; onChanged: () => void }) {
  const { toast, refreshOffice, me } = useApp();
  const can = useCanApprove();
  const [review, setReview] = useState<number | null>(null);
  const all = items.every((a) => can(a));
  const approveAll = async () => {
    const { results } = await api<{ results: { id: string; error?: string }[] }>("/api/actions/batch", { json: { decision: "approve", ids: items.map((a) => a.id) } });
    const ok = results.filter((r) => !r.error).map((r) => r.id);
    toast({ text: `Approved ${ok.length} item${ok.length === 1 ? "" : "s"}.`, undo: async () => { for (const id of ok) await api(`/api/actions/${id}/undo`, { method: "POST" }); onChanged(); } });
    refreshOffice();
    onChanged();
  };
  return (
    <div style={{ background: "#fffbf4", border: "1px solid #e1d5c5", borderRadius: 14, maxWidth: 560, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a4f14" }}>Needs your approval · {items.length} {items.length === 1 ? "item" : "items"}</span>
        {items.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
            <span>{a.title}</span>
            {a.amount_cents != null ? <span className="mono" style={{ fontSize: 13 }}>{money(a.amount_cents, a.currency ?? "USD")}</span> : <span style={{ color: "#716459", fontSize: 13 }}>{a.tool === "send_email" ? "email" : a.tool.replace(/_/g, " ")}</span>}
          </div>
        ))}
      </div>
      {me.user.role !== "viewer" && (
        <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderTop: "1px solid #ece3d6" }}>
          <Button disabled={!all} onClick={approveAll}>{items.length === 2 ? "Approve both" : items.length > 2 ? "Approve all" : "Approve"}</Button>
          <Button kind="outline" onClick={() => setReview(0)}>Review</Button>
        </div>
      )}
      {review != null && items[review] && (
        <Review a={items[review]} pager={items.length > 1 ? { n: review + 1, of: items.length, prev: review > 0 ? () => setReview(review - 1) : undefined, next: review < items.length - 1 ? () => setReview(review + 1) : undefined } : undefined}
          onClose={() => setReview(null)} onDone={() => { setReview(null); onChanged(); }} />
      )}
    </div>
  );
}

export function RoomView() {
  const { office, me, onLive, refreshOffice } = useApp();
  const [room, setRoom] = useState<Room | null>(null);
  const [pending, setPending] = useState<Action[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const desks = useMemo(() => office?.desks ?? [], [office]);
  const tz = me.workspace.timezone;

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([api<Room>("/api/room"), api<{ actions: Action[] }>("/api/actions")]);
      setRoom(r);
      setPending(a.actions);
    } catch (e) {
      setError(e as ApiError);
    }
  }, []);
  useEffect(() => { queueMicrotask(load); }, [load]);
  useEffect(() => onLive((e) => { if (e.type === "message" || e.type === "action") load(); }), [onLive, load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [room?.messages.length]);

  if (error?.status === 402) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", background: "#f8f2e9", color: "#2b2320", padding: 24, textAlign: "center" }}>
        <div style={{ maxWidth: 420 }}>
          <div className="pixel" style={{ fontSize: 22, marginBottom: 8 }}>The bot room is on Studio and Team</div>
          <p style={{ color: "#776a5e" }}>On Solo your bots still hand work to each other; the room is where you can watch and jump in.</p>
          {me.user.role === "owner" && <Link href="/settings/billing"><Button>See plans</Button></Link>}
        </div>
      </div>
    );
  }

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api("/api/room", { json: { message: text } });
      setText("");
      await load();
      refreshOffice();
    } finally {
      setSending(false);
    }
  };

  const byId = (id: string | null) => desks.find((d) => d.id === id);
  const pendingById = Object.fromEntries(pending.map((a) => [a.id, a]));
  const shown = new Set<string>();
  const working = desks.filter((d) => d.status === "working" && d.enabled);
  const msgs = room?.messages ?? [];

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0, height: "calc(100vh - 59px)", background: "#f8f2e9", color: "#2b2320" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ height: 68, flex: "none", display: "flex", alignItems: "center", gap: 14, padding: "0 32px", borderBottom: "1px solid #e4d9ca" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Bot room</span>
            <span style={{ fontSize: 13, color: "#776a5e" }}>Where the team hands work to each other. Jump in anytime.</span>
          </div>
          <div className="ns-room-heads" style={{ display: "flex", gap: 4 }}>{desks.slice(0, 8).map((d) => <BotTile key={d.id} desk={d} size={30} />)}</div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", justifyContent: "center", padding: "22px 32px" }}>
          <div style={{ width: "100%", maxWidth: 820, display: "flex", flexDirection: "column", gap: 16, justifyContent: "flex-end", minHeight: "100%" }}>
            {room && msgs.filter((m) => m.role !== "system").length === 0 && (
              // X3 Bot room, first day
              <div style={{ margin: "auto 0", textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                <span className="pixel" style={{ fontSize: 20 }}>No handoffs yet</span>
                <span style={{ fontSize: 14.5, color: "#776a5e", maxWidth: 440 }}>When one bot passes work to another, like Penny spotting an invoice question for Ledger, it shows up here.</span>
              </div>
            )}
            {msgs.map((m, i) => {
              const prev = msgs[i - 1];
              const divider = !prev || new Date(m.created_at).toDateString() !== new Date(prev.created_at).toDateString();
              const dayLabel = new Date(m.created_at).toDateString() === new Date().toDateString() ? (new Date(m.created_at).getHours() < 6 ? "Tonight" : "Today") : new Date(m.created_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
              const line = divider ? (
                <div key={`d-${m.id}`} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#716459" }}><span style={{ flex: 1, height: 1, background: "#e1d5c5" }} />{dayLabel}<span style={{ flex: 1, height: 1, background: "#e1d5c5" }} /></div>
              ) : null;
              if (m.role === "owner") {
                return [line, (
                  <div key={m.id} style={{ alignSelf: "flex-end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, maxWidth: 520 }}>
                    <span className="mono" style={{ fontSize: 11.5, color: "#776a5e" }}>You · {clock(m.created_at, tz)}</span>
                    <div style={{ background: "#2b2320", color: "#fbf3e6", padding: "11px 15px", borderRadius: "16px 16px 4px 16px", fontSize: 15, lineHeight: 1.5 }}>{m.content}</div>
                  </div>
                )];
              }
              if (m.role === "system") return [line, <div key={m.id} style={{ alignSelf: "center", fontSize: 12.5, color: "#716459" }}>{m.content}</div>];
              const d = byId(m.bot_id);
              // approval cards: a "waiting" note for one card, or the run's report listing its cards
              const ids: string[] = [...((m.data.action_ids as string[] | undefined) ?? []), ...(m.data.action_id ? [m.data.action_id as string] : [])];
              const cards = ids.map((id) => pendingById[id]).filter((a): a is Action => !!a && !shown.has(a.id));
              cards.forEach((a) => shown.add(a.id));
              if (m.content.startsWith("Waiting for your OK") && !cards.length) return line;
              const to = m.kind === "handoff" ? byId(m.data.to_bot) : undefined;
              return [line, (
                <div key={m.id} style={{ display: "flex", gap: 14 }}>
                  <BotTile desk={d} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: nameColor(d?.hue ?? 30) }}>{d?.name ?? "A bot"}</span>
                      <span className="mono" style={{ fontSize: 11.5, color: "#776a5e" }}>{clock(m.created_at, tz)}</span>
                    </div>
                    {!m.content.startsWith("Waiting for your OK") && <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}><Mentions text={m.content} desks={desks} /></div>}
                    {m.kind === "handoff" && <Chip>Handed off · {d?.name} → {to?.name ?? "a teammate"} · &quot;{m.data.title}&quot;</Chip>}
                    {m.kind === "hold" && <Chip>Paused · {m.data.label} {m.data.scope === "reminders" ? "payment reminders" : m.data.scope === "followups" ? "follow-ups" : "outreach"}</Chip>}
                    {cards.length > 0 && <ApprovalGroup items={cards} onChanged={load} />}
                  </div>
                </div>
              )];
            })}
            {working.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#716459", paddingLeft: 50 }}><TypingDots />{d.name} is {d.status_text ? d.status_text.charAt(0).toLowerCase() + d.status_text.slice(1) : "working"}</div>
            ))}
            <div ref={end} />
          </div>
        </div>

        {me.user.role !== "viewer" && (
          <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "0 32px 24px" }}>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ width: "100%", maxWidth: 820, background: "#fffbf4", border: "1px solid #dccfbe", borderRadius: 16, padding: "14px 14px 14px 18px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 24px -16px rgba(60,40,30,.3)" }}>
              <input aria-label="Message the bot room" value={text} onChange={(e) => setText(e.target.value)} placeholder={msgs.length ? "Message the bot room. @mention a bot to give it the job." : "Say hi, or @mention a bot with a job"}
                style={{ flex: 1, fontSize: 15, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", color: "#2b2320", padding: 0 }} />
              <button type="submit" aria-label="Send" disabled={sending || !text.trim()} style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: "#2b2320", color: "#fbf3e6", fontSize: 17, border: "none", opacity: sending || !text.trim() ? 0.5 : 1 }}>↑</button>
            </form>
          </div>
        )}
      </div>

      <aside className="ns-room-side" style={{ width: 300, flex: "none", background: "#efe7db", borderLeft: "1px solid #e1d5c5", padding: "22px 20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#716459" }}>In the room</div>
        {desks.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BotTile desk={d} />
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</span>
              <span style={{ fontSize: 12.5, color: d.status === "needs_you" ? "#8a4f14" : "#776a5e" }}>{!d.enabled ? "Paused" : d.status === "needs_you" ? "Waiting on you" : d.status === "idle" && d.next_run_at ? `Idle until ${clock(d.next_run_at, tz)}` : d.status_text || "Idle"}</span>
            </div>
          </div>
        ))}
        <div style={{ height: 1, background: "#e1d5c5", margin: "6px 0" }} />
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#716459" }}>Holds in place</div>
        {room?.holds.length ? (
          room.holds.map((h) => (
            <div key={h.id} style={{ fontSize: 13.5, lineHeight: 1.5, color: "#4a3f38", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ flex: 1 }}>{h.label}: {h.scope === "reminders" ? "reminders paused" : h.scope === "followups" ? "follow-ups held" : "all outreach paused"} ({h.by})</span>
              {me.user.role !== "viewer" && <button aria-label={`Release hold on ${h.label}`} onClick={async () => { await api(`/api/holds/${h.id}`, { method: "DELETE" }); load(); }} style={{ background: "none", border: "none", color: "#8a4f14", fontSize: 12.5 }}>Release</button>}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 13.5, color: "#776a5e" }}>None. The team can contact anyone not on your never-contact list.</div>
        )}
      </aside>
      <style>{`@media (max-width: 960px) { .ns-room-side { display: none !important; } } @media (max-width: 720px) { .ns-room-heads { display: none !important; } }`}</style>
    </div>
  );
}
