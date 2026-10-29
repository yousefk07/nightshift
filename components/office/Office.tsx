"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { api, clock, streamPost, useApi } from "@/lib/client";
import { Hop, useApp, useApprove, type DeskInfo, useRename } from "../AppShell";
import { Desk, deskState, OwnerDesk, TypingDots } from "../pixel";
import { Button, Card, Label, Pill } from "../ui";
import { ActionRow, BotTile, BriefCard, Review, useCanApprove, type Action, Crew } from "./cards";

// 01 Office: the pixel floor with a desk per bot, and the side panel for whichever desk is open.

const OL = "#2a1f2b";
const CELL_W = 250, CELL_H = 216, WALL = 214, BASE_W = 1020;

// Balanced rows, at most 5 desks each: 6 bots = 3 + 3, 7 = 4 + 3, 11 = 4 + 4 + 3.
function rowsOf(n: number) {
  const rows = Math.max(1, Math.ceil(n / 5));
  const per = Math.ceil(n / rows);
  return Array.from({ length: rows }, (_, r) => Math.min(per, n - r * per)).filter((c) => c > 0);
}

// The room, laid out for its real size: every row centred, your desk centred below them, the decor centred on the
// wall, and the whole floor scaled to fit the window so nothing scrolls.
function layout(n: number, box: { w: number; h: number }) {
  const rows = rowsOf(n);
  const widest = Math.max(...rows, 1);
  const needW = Math.max(BASE_W, widest * CELL_W + 80);
  const needH = WALL + 46 + rows.length * CELL_H + 210;
  const scale = box.w && box.h ? Math.min(1, box.w / needW, box.h / needH) : 1;
  const W = box.w ? box.w / scale : needW, H = box.h ? box.h / scale : needH;
  const spare = Math.max(0, H - needH);
  const top = WALL + 46 + spare * 0.35;
  const pos: { left: number; top: number }[] = [];
  rows.forEach((count, r) => {
    const start = (W - count * CELL_W) / 2 + (CELL_W - 200) / 2;
    for (let k = 0; k < count; k++) pos.push({ left: start + k * CELL_W, top: top + r * CELL_H });
  });
  const ownerTop = top + rows.length * CELL_H + 6 + spare * 0.25;
  return { W, H, scale, pos, ownerTop, ownerLeft: (W - 280) / 2, rugTop: top + CELL_H * 0.85, decorX: (W - BASE_W) / 2 };
}

function useBox(el: HTMLElement | null) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return box;
}

const dot = (s: DeskInfo["status"], hue: number) => (s === "needs_you" ? `oklch(0.82 0.13 ${hue})` : s === "working" ? "oklch(0.78 0.1 150)" : s === "blocked" || s === "failed" ? "#e0675a" : "#8a7c80");
const statusColor = (s: DeskInfo["status"]) => (s === "needs_you" ? "#f0c27a" : s === "blocked" || s === "failed" ? "#f19a8e" : s === "idle" || s === "paused" ? "#d4c4b6" : "#d9c9b4");
const statusLine = (d: DeskInfo) => (d.status === "needs_you" ? "Needs you" : d.status_text || (d.status === "idle" ? "Idle" : d.status));

function Decor({ W, H, dx, rugTop, ownerTop }: { W: number; H: number; dx: number; rugTop: number; ownerTop: number }) {
  const b = (st: CSSProperties) => <div style={{ position: "absolute", ...st }} />;
  const x = (v: number) => v + dx;
  const rugW = Math.min(W - 160, 760);
  return (
    <>
      {b({ left: 0, top: 0, width: W, height: 206, background: "#3b2f47", backgroundImage: "repeating-linear-gradient(90deg,transparent 0 56px,#372b42 56px 60px)" })}
      {b({ left: 0, width: W, top: 200, height: 14, background: "#2c2236" })}
      {/* window with the moon and stars, centred on the wall */}
      {b({ left: x(400), top: 34, width: 220, height: 136, background: "#1c2142", border: "8px solid #6b4a3a", boxShadow: `0 0 0 4px ${OL}` })}
      {b({ left: x(506), top: 42, width: 8, height: 136, background: "#6b4a3a" })}
      {b({ left: x(556), top: 56, width: 30, height: 30, background: "#f3e3b8", boxShadow: "inset -10px -6px 0 0 #1c2142" })}
      {[[436, 64, 5], [470, 120, 4], [540, 130, 5], [592, 108, 4]].map(([l, t, sz], i) => <div key={i} style={{ position: "absolute", left: x(l), top: t, width: sz, height: sz, background: i % 2 ? "#c9bda6" : "#e9dcc0" }} />)}
      {b({ left: x(392), top: 178, width: 236, height: 12, background: "#7d5641", boxShadow: `0 0 0 4px ${OL}` })}
      {/* clock on the left, shelf on the right */}
      {b({ left: x(140), top: 60, width: 52, height: 52, background: "#efe2c9", border: `5px solid ${OL}`, boxSizing: "border-box" })}
      {b({ left: x(163), top: 70, width: 5, height: 18, background: OL })}
      {b({ left: x(163), top: 84, width: 16, height: 5, background: OL })}
      {b({ left: x(770), top: 110, width: 180, height: 10, background: "#7d5641", boxShadow: `0 0 0 4px ${OL}` })}
      {b({ left: x(784), top: 70, width: 14, height: 40, background: "oklch(0.62 0.1 185)", boxShadow: `0 0 0 3px ${OL}` })}
      {b({ left: x(802), top: 78, width: 14, height: 32, background: "oklch(0.62 0.1 15)", boxShadow: `0 0 0 3px ${OL}` })}
      {b({ left: x(820), top: 66, width: 14, height: 44, background: "#e8d9bd", boxShadow: `0 0 0 3px ${OL}` })}
      {b({ left: x(880), top: 90, width: 30, height: 20, background: "#a5603f", boxShadow: `0 0 0 3px ${OL}` })}
      {b({ left: x(878), top: 64, width: 14, height: 22, background: "oklch(0.62 0.1 140)", boxShadow: `0 0 0 3px ${OL}` })}
      {b({ left: x(896), top: 58, width: 14, height: 28, background: "oklch(0.68 0.1 140)", boxShadow: `0 0 0 3px ${OL}` })}
      {/* rug, centred under the lower rows and your desk */}
      {b({ left: (W - rugW) / 2, top: rugTop, width: rugW, height: Math.max(200, Math.min(ownerTop + 196, H - 14) - rugTop), background: "#6b4a57", boxShadow: "0 0 0 6px #563848,inset 0 0 0 12px #6b4a57,inset 0 0 0 16px #80606b" })}
      {b({ left: 0, top: 0, width: W, height: H, background: "radial-gradient(600px 380px at 50% 100%,rgba(255,190,120,.16),transparent),radial-gradient(500px 300px at 50% 20%,rgba(120,140,220,.08),transparent)", pointerEvents: "none" })}
    </>
  );
}

export function OfficeFloor({ desks, waiting, selected, onSelect }: { desks: DeskInfo[]; waiting: number; selected: string | null; onSelect: (id: string) => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const box = useBox(el);
  const L = layout(desks.length, box);
  const pressable = (fn: () => void) => ({ role: "button", tabIndex: 0, onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
  return (
    <div ref={setEl} style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#5a4238" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: L.W, height: L.H, transform: `scale(${L.scale})`, transformOrigin: "0 0", background: "#5a4238", backgroundImage: "repeating-linear-gradient(0deg,transparent 0 40px,#4f3a31 40px 44px)", visibility: box.w ? "visible" : "hidden" }}>
        <Decor W={L.W} H={L.H} dx={L.decorX} rugTop={L.rugTop} ownerTop={L.ownerTop} />
      {desks.map((d, i) => {
        const p = L.pos[i], state = deskState(d.enabled ? d.status : "paused");
        return (
          <div key={d.id} {...pressable(() => onSelect(d.id))} aria-label={`${d.name}, ${d.role}, ${statusLine(d)}`} style={{ position: "absolute", left: p.left, top: p.top, width: 200, cursor: "pointer" }}>
            {selected === d.id && <div style={{ position: "absolute", left: -14, top: -54, width: 228, height: 296, border: `3px dashed oklch(0.82 0.13 ${d.hue})` }} />}
            {d.status === "needs_you" && d.waiting > 0 && (
              <div key={d.waiting} className="pixel" style={{ animation: "ns-pop .35s cubic-bezier(.2,.9,.3,1.3) both", transformOrigin: "0 100%", position: "absolute", left: 112, top: -42, padding: "6px 10px", background: "#fff6e4", border: `3px solid ${OL}`, fontSize: 14, color: OL, whiteSpace: "nowrap", boxShadow: "4px 4px 0 0 rgba(0,0,0,.25)", zIndex: 2 }}>
                {d.waiting} {d.waiting === 1 ? "draft" : "drafts"} for you
              </div>
            )}
            {d.status === "blocked" && (
              <div className="pixel" style={{ animation: "ns-wave 1.8s ease-in-out infinite", transformOrigin: "50% 100%", position: "absolute", left: 96, top: -42, padding: "6px 10px", background: "#ffe3dd", border: `3px solid ${OL}`, fontSize: 14, color: OL, whiteSpace: "nowrap", zIndex: 2 }}>I&apos;m stuck.</div>
            )}
            {state === "idle" && (
              <div aria-hidden className="pixel" style={{ position: "absolute", left: 150, top: -14, fontSize: 16, color: "#b9a9b6" }}>
                <span style={{ display: "inline-block", animation: "ns-steam 2.6s ease-out infinite" }}>z</span>
                <span style={{ display: "inline-block", fontSize: 12, marginLeft: 3, animation: "ns-steam 2.6s 1.3s ease-out infinite" }}>z</span>
              </div>
            )}
            <div style={{ position: "relative", height: 150 }}><Hop id={d.id}><Desk bot={d} state={state} /></Hop></div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, marginTop: 6 }}>
              <div className="pixel" style={{ display: "flex", alignItems: "center", gap: 7, background: "#1f1720", border: `3px solid ${OL}`, padding: "3px 9px", fontSize: 15, color: "#f3e7d3", letterSpacing: ".04em", whiteSpace: "nowrap" }}>
                <span style={{ width: 8, height: 8, background: dot(d.status, d.hue) }} />
                {d.name.toUpperCase()}<span style={{ color: "#a8988a" }}>· {d.role.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 12.5, color: statusColor(d.status), textAlign: "center", maxWidth: 220 }}>{d.enabled ? statusLine(d) : "Paused"}</div>
            </div>
          </div>
        );
      })}
      <div {...pressable(() => onSelect("me"))} aria-label={`Your desk, ${waiting} waiting for approval`} style={{ position: "absolute", left: L.ownerLeft, top: L.ownerTop, width: 280, cursor: "pointer" }}>
        {selected === "me" && <div style={{ position: "absolute", left: -14, top: -24, width: 308, height: 236, border: "3px dashed #f0c27a" }} />}
        {waiting > 0 && <div className="pixel" style={{ position: "absolute", left: 150, top: 46, width: 26, height: 26, background: "#f0c27a", border: `3px solid ${OL}`, fontSize: 15, color: OL, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>{waiting}</div>}
        <div style={{ position: "relative", height: 150 }}><OwnerDesk /></div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          <div className="pixel" style={{ background: "#f0c27a", border: `3px solid ${OL}`, padding: "3px 9px", fontSize: 15, color: OL, letterSpacing: ".04em" }}>YOUR DESK</div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ---- the side panels ----
const panel: CSSProperties = { width: 420, flex: "none", background: "#f8f2e9", color: "#2b2320", display: "flex", flexDirection: "column", borderLeft: "3px solid #17111a", minHeight: 0 };
const Close = ({ onClick }: { onClick: () => void }) => (
  <button aria-label="Close panel" onClick={onClick} style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#5d5148", fontSize: 20, background: "transparent", border: "none" }}>×</button>
);

interface BotDetail { bot: { id: string; kind: string; name: string; enabled: boolean }; template: { role: string; title: string }; waiting: Action[]; runs: { id: string; at: string; status: string; summary: string | null; retry_at: string | null }[] }

export function BotPanel({ desk, onClose }: { desk: DeskInfo; onClose: () => void }) {
  const { me, refreshOffice, toast } = useApp();
  const router = useRouter();
  const approve = useApprove();
  const canApprove = useCanApprove();
  const d = useApi<BotDetail>(`/api/bots/${encodeURIComponent(desk.kind)}`, { poll: 20_000 });
  const [review, setReview] = useState<Action | null>(null);
  const tz = me.workspace.timezone;
  const owner = me.user.role === "owner";
  const account = me.connections.find((c) => c.kinds.includes("email"))?.account;
  const pill = desk.status === "needs_you" ? <Pill>Needs you</Pill> : desk.status === "working" ? <Pill tone="green">Working</Pill> : desk.status === "blocked" ? <Pill tone="red">Blocked</Pill> : desk.status === "failed" ? <Pill tone="red">Didn&apos;t finish</Pill> : !desk.enabled ? <Pill tone="grey">Paused</Pill> : <Pill tone="grey">Idle</Pill>;
  useEffect(() => { d.refresh(); }, [desk.status, desk.waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePause = async () => {
    await api(`/api/bots/${encodeURIComponent(desk.kind)}`, { method: "PATCH", json: { enabled: !desk.enabled } });
    toast({ text: desk.enabled ? `${desk.name} is paused.` : `${desk.name} is back on shift.` });
    refreshOffice();
  };
  const failed = d.data?.runs.find((r) => r.status === "failed" || r.status === "partial");

  return (
    <aside style={panel} aria-label={`${desk.name}'s desk`}>
      <div style={{ padding: "22px 24px 18px", display: "flex", gap: 14, alignItems: "center", borderBottom: "1px solid #e4d9ca" }}>
        <BotTile desk={desk} size={56} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 21, fontWeight: 700 }}>{desk.name}</span>{pill}</div>
          <div style={{ fontSize: 13.5, color: "#776a5e" }}>{desk.role}{desk.kind === "inbox" && account ? ` · watching ${account}` : ` · ${desk.title}`}</div>
        </div>
        <Close onClick={onClose} />
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
        {(d.data?.waiting.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Label>Waiting for you · {d.data!.waiting.length} {d.data!.waiting.length === 1 ? "draft" : "drafts"}</Label>
            {d.data!.waiting.map((a) => (
              <Card key={a.id}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{a.title}</span>
                  {a.payload.body && <span style={{ fontSize: 13, color: "#776a5e", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{String(a.payload.body)}</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" disabled={!canApprove(a)} onClick={async () => { await approve(a.id, a.title, undefined, a.bot_id); d.refresh(); }}>Approve</Button>
                  <Button size="sm" kind="outline" onClick={() => setReview(a)}>Open</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
        {desk.status === "working" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Label>Working on now</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}><TypingDots /><span>{desk.status_text}</span></div>
          </div>
        )}
        {desk.status === "blocked" && (
          <Card style={{ background: "#fff1ee", borderColor: "#efc3ba" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{desk.status_text}</span>
            <span style={{ fontSize: 13, color: "#776a5e" }}>{desk.name} can&apos;t work until it&apos;s reconnected.</span>
            {owner && <div><Link href="/settings/connections"><Button size="sm">Reconnect</Button></Link></div>}
          </Card>
        )}
        {failed && desk.status === "failed" && (
          <Card style={{ background: "#fff1ee", borderColor: "#efc3ba" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>I couldn&apos;t finish the last job.</span>
            <span style={{ fontSize: 13, color: "#776a5e" }}>{failed.summary?.slice(0, 220)}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" kind="outline" onClick={() => router.push(`/chats/${encodeURIComponent(desk.kind)}`)}>Show partial</Button>
              <Button size="sm" onClick={async () => { const r = await api<{ retry_at: string }>(`/api/runs/${failed.id}/retry`, { json: { at: "04:00" } }); toast({ text: `${desk.name} will try again at ${clock(r.retry_at, tz)}.` }); }}>Retry at 4 AM</Button>
            </div>
          </Card>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Label>Recent runs</Label>
          {!d.data ? <span style={{ fontSize: 13.5, color: "#776a5e" }}>Loading…</span> : d.data.runs.length === 0 ? (
            <span style={{ fontSize: 13.5, color: "#776a5e" }}>No runs yet. {desk.next_run_at ? `First check at ${clock(desk.next_run_at, tz)}.` : "Works when you ask."}</span>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", rowGap: 10, fontSize: 13.5 }}>
              {d.data.runs.slice(0, 6).map((r) => (
                <div key={r.id} style={{ display: "contents" }}>
                  <span className="mono" style={{ fontSize: 12, color: "#716459", paddingTop: 2 }}>{clock(r.at, tz)}</span>
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.summary?.split("\n")[0] || (r.status === "failed" ? "Didn't finish" : "Ran")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: "16px 24px", borderTop: "1px solid #e4d9ca", display: "flex", gap: 10 }}>
        <Button style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 14.5 }} onClick={() => router.push(`/chats/${encodeURIComponent(desk.kind)}`)}>Chat with {desk.name}</Button>
        {owner && <Button kind="outline" style={{ height: 44, borderRadius: 10, fontSize: 14.5, padding: "0 18px" }} onClick={togglePause}>{desk.enabled ? `Pause ${desk.name}` : `Resume ${desk.name}`}</Button>}
      </div>
      {review && <Review a={review} onClose={() => setReview(null)} onDone={() => { setReview(null); d.refresh(); refreshOffice(); }} />}
    </aside>
  );
}

interface Desk { date: string; brief: { headline: string; content: string; status: string } | null; minutes: number; queue: { id: string }[]; groups: { bot: string; key: string | null; items: Action[] }[] }

// 01b Your desk: the brief on the clipboard, then everything waiting.
export function DeskPanel({ onClose, asPage }: { onClose?: () => void; asPage?: boolean }) {
  const { me, office, refreshOffice } = useApp();
  const d = useApi<Desk>("/api/desk", { poll: 20_000 });
  const [review, setReview] = useState<number | null>(null);
  const items = d.data?.groups.flatMap((g) => g.items) ?? [];
  const date = new Date(`${d.data?.date ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <aside style={{ ...panel, ...(asPage ? { width: "100%", maxWidth: 560, margin: "0 auto", borderLeft: "none", minHeight: "100%" } : {}) }} aria-label="Your desk">
      <div style={{ padding: "22px 24px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e4d9ca" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ fontSize: 21, fontWeight: 700 }}>Your desk</span><span style={{ fontSize: 13.5, color: "#776a5e" }}>{date}</span></div>
        {onClose && <Close onClick={onClose} />}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22, overflowY: "auto" }}>
        <BriefCard brief={d.data?.brief ?? null} finalAt={me.workspace.brief_prefs.time} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.length > 0 ? (
            <>
              <Label style={{ marginBottom: 4 }}>Waiting for your approval · {items.length}</Label>
              {items.map((a, i) => <ActionRow key={a.id} a={a} last={i === items.length - 1} onReview={() => setReview(i)} />)}
            </>
          ) : d.data ? (
            // X2 Desk clear
            <div style={{ textAlign: "center", padding: "28px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
              <Crew desks={office?.desks ?? []} />
              <span className="pixel" style={{ fontSize: 20 }}>All clear</span>
              <span style={{ fontSize: 14, color: "#776a5e" }}>You&apos;ve approved everything. The team will leave anything new here tonight.</span>
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ padding: "16px 24px", borderTop: "1px solid #e4d9ca", fontSize: 13, color: "#776a5e" }}>Nothing is sent until you approve it.</div>
      {review != null && items[review] && (
        <Review
          a={items[review]}
          pager={{ n: review + 1, of: items.length, prev: review > 0 ? () => setReview(review - 1) : undefined, next: review < items.length - 1 ? () => setReview(review + 1) : undefined }}
          onClose={() => setReview(null)}
          onDone={() => { d.refresh(); refreshOffice(); setReview(items.length > 1 ? Math.min(review, items.length - 2) : null); }}
        />
      )}
    </aside>
  );
}

// X1 The office before the first shift.
export function QuietOffice({ onStart }: { onStart: () => void }) {
  const rename = useRename();
  const { me } = useApp();
  const start = me.workspace.shift_start.slice(0, 5);
  const [h, m] = start.split(":").map(Number);
  const label = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: m ? "2-digit" : undefined });
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: me.workspace.timezone }));
  let hours = h - now.getHours() - (now.getMinutes() > m ? 1 : 0);
  if (hours < 0) hours += 24;
  return (
    <div style={{ position: "absolute", left: "50%", top: 40, transform: "translateX(-50%)", background: "#fff6e4", color: OL, border: `3px solid ${OL}`, boxShadow: "6px 6px 0 0 rgba(0,0,0,.25)", padding: "18px 22px", width: 460, zIndex: 5 }}>
      <div className="pixel" style={{ fontSize: 20, marginBottom: 6 }}>The office is quiet for now</div>
      <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>Your team clocks in at {label}{hours > 0 ? `, in ${hours} hour${hours === 1 ? "" : "s"}` : ""}. Want a head start? Ask Penny to sort today&apos;s inbox now.</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Button onClick={onStart}>{rename("Start Penny now")}</Button>
        {me.user.role === "owner" && <Link href="/settings/bots"><Button kind="outline">Change shift hours</Button></Link>}
      </div>
    </div>
  );
}

// X4 banner: a connection broke and a bot is blocked.
export function BrokenBanner() {
  const { me } = useApp();
  const broken = me.connections.find((c) => c.status !== "ok");
  if (!broken) return null;
  const kind = broken.kinds.includes("accounting") ? "Accounting" : broken.kinds.includes("email") ? "Email" : broken.kinds.includes("crm") ? "Your CRM" : "A connection";
  const when = broken.broken_at ? ` at ${clock(broken.broken_at, me.workspace.timezone)}` : "";
  const oauth = ["google", "microsoft", "quickbooks", "xero", "freshbooks"].includes(broken.provider);
  return (
    <div role="alert" style={{ background: "#fff1ee", color: "#2b2320", borderBottom: "3px solid #17111a", padding: "10px 20px", display: "flex", alignItems: "center", gap: 14, fontSize: 14 }}>
      <span style={{ width: 10, height: 10, background: "#e0675a", flex: "none" }} />
      <span style={{ flex: 1 }}>{kind} got disconnected{when}. The bots that use it can&apos;t work until you reconnect.</span>
      {me.user.role === "owner" && (oauth ? <a href={`/api/connect/${broken.provider}`}><Button size="sm">Reconnect</Button></a> : <Link href="/settings/connections"><Button size="sm">Reconnect</Button></Link>)}
    </div>
  );
}

// "Start Penny now": run the inbox bot and follow it in the office.
export async function startBot(kind: string, onStatus: (text: string) => void) {
  await streamPost(`/api/bots/${encodeURIComponent(kind)}/run`, {}, (e) => { if (e.type === "status") onStatus(e.text); });
}
