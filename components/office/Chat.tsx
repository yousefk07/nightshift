"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, streamPost } from "@/lib/client";
import { useApp, type DeskInfo } from "../AppShell";
import { TypingDots } from "../pixel";
import { Button } from "../ui";
import { BotTile, DraftCard, type Action } from "./cards";

// 02 Chat: the team on the left, one conversation on the right, drafts inline as cards.

interface Msg { id: string; role: "owner" | "bot" | "system"; kind: string; bot_id: string | null; content: string; data: Record<string, any>; created_at: string }

export function TeamList({ current }: { current?: string }) {
  const { office } = useApp();
  const line = (d: DeskInfo) =>
    d.waiting > 0 ? `${d.role} · ${d.waiting} ${d.waiting === 1 ? "draft" : "drafts"} waiting` : `${d.role} · ${!d.enabled ? "paused" : d.status === "working" ? "working" : d.status === "blocked" ? "blocked" : "idle"}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#716459", padding: "4px 10px 8px" }}>Your team</div>
      {(office?.desks ?? []).map((d) => (
        <Link key={d.id} href={`/chats/${encodeURIComponent(d.kind)}`} aria-current={current === d.kind ? "page" : undefined}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 10, textDecoration: "none", color: "#2b2320", background: current === d.kind ? "#efe4d4" : "transparent" }}>
          <BotTile desk={d} size={40} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{d.name}</span>
            <span style={{ fontSize: 12.5, color: "#776a5e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line(d)}</span>
          </div>
          {(d.waiting > 0 || d.status === "needs_you") && <span style={{ width: 8, height: 8, borderRadius: 4, background: "oklch(0.7 0.13 65)" }} />}
        </Link>
      ))}
    </div>
  );
}

// Bot text: paragraphs, bullets and bold, nothing fancier.
function Prose({ text }: { text: string }) {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return (
    <>
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) return <ul key={i} style={{ margin: 0, paddingLeft: 20 }}>{lines.map((l, j) => <li key={j} dangerouslySetInnerHTML={{ __html: esc(l.replace(/^\s*[-*] /, "")) }} />)}</ul>;
        if (/^#{1,3} /.test(block)) return <div key={i} style={{ fontWeight: 700 }} dangerouslySetInnerHTML={{ __html: esc(block.replace(/^#{1,3} /, "")) }} />;
        return <div key={i} style={{ textWrap: "pretty" as never, whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={{ __html: esc(block) }} />;
      })}
    </>
  );
}

const CHIPS: Record<string, string[]> = {
  inbox: ["Summarize today's inbox", "Draft replies to flagged"],
  research: ["Compare my three main suppliers", "What are competitors charging?"],
  invoices: ["Who still owes us?", "Anything overdue this week?"],
  leads: ["Which leads went quiet?", "Follow up on open quotes"],
  brief: ["What happened overnight?", "What needs me today?"],
};

export function ChatView({ desk }: { desk: DeskInfo }) {
  const { me, refreshOffice, onLive } = useApp();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState<{ text: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const account = me.connections.find((c) => c.kinds.includes("email"))?.account;

  const load = useCallback(async (id: string | null) => {
    if (!id) {
      const { threads } = await api<{ threads: { id: string }[] }>(`/api/threads?bot=${encodeURIComponent(desk.kind)}`);
      id = threads[0]?.id ?? null;
      setThreadId(id);
    }
    if (id) {
      const r = await api<{ messages: Msg[]; actions: Action[] }>(`/api/threads/${id}`);
      setMsgs(r.messages);
      setActions(Object.fromEntries(r.actions.map((a) => [a.id, a])));
    }
    setLoaded(true);
  }, [desk.kind]);

  useEffect(() => { queueMicrotask(() => load(null)); }, [load]);
  useEffect(() => onLive((e) => { if (e.type === "action" && threadId) load(threadId); }), [onLive, threadId, load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, streaming]);

  const send = async (message: string) => {
    if (!message.trim() || streaming) return;
    setText("");
    setError(null);
    setMsgs((m) => [...m, { id: `local-${Date.now()}`, role: "owner", kind: "text", bot_id: null, content: message, data: {}, created_at: new Date().toISOString() }]);
    setStreaming({ text: "", status: "Thinking it through" });
    try {
      const done = await streamPost("/api/chat", { bot: desk.kind, message, thread_id: threadId ?? undefined }, (e) => {
        if (e.type === "text") setStreaming((s) => ({ text: (s?.text ?? "") + e.delta, status: s?.status ?? "" }));
        if (e.type === "status") setStreaming((s) => ({ text: s?.text ?? "", status: e.text }));
        if (e.type === "error") setError(e.error);
      });
      if (done?.thread_id) setThreadId(done.thread_id);
      await load(done?.thread_id ?? threadId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming(null);
      refreshOffice();
    }
  };

  const viewer = me.user.role === "viewer";
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "#f8f2e9", color: "#2b2320" }}>
      <div style={{ height: 68, flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "0 32px", borderBottom: "1px solid #e4d9ca" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{desk.name}</span>
          <span style={{ fontSize: 13, color: "#776a5e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desk.kind === "inbox" && account ? `Watches ${account}, flags what matters, drafts replies` : desk.title}</span>
        </div>
        {me.user.role === "owner" && <Link href="/settings/bots"><Button kind="outline" size="sm">Settings</Button></Link>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", justifyContent: "center", padding: "28px 32px" }}>
        <div style={{ width: "100%", maxWidth: 740, display: "flex", flexDirection: "column", gap: 22, justifyContent: "flex-end", minHeight: "100%" }}>
          {loaded && msgs.length === 0 && !streaming && (
            <div style={{ textAlign: "center", color: "#776a5e", fontSize: 14.5, margin: "auto 0" }}>
              <BotTile desk={desk} size={56} />
              <p>{desk.name} is ready. {desk.title}.</p>
            </div>
          )}
          {msgs.map((m) => {
            if (m.role === "owner") return <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: 520, background: "#2b2320", color: "#fbf3e6", padding: "12px 16px", borderRadius: "16px 16px 4px 16px", fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>;
            if (m.role === "system") return <div key={m.id} style={{ alignSelf: "center", fontSize: 12.5, color: "#46603b", background: "#e6eedb", padding: "5px 12px", borderRadius: 20 }}>{m.content.replace(/^Sent: Email to /, "Sent to ").replace(/^Done: /, "")}</div>;
            const cards = ((m.data.action_ids as string[] | undefined) ?? []).map((id) => actions[id]).filter(Boolean);
            return (
              <div key={m.id} style={{ display: "flex", gap: 14 }}>
                <BotTile desk={desk} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, fontSize: 15, lineHeight: 1.55, minWidth: 0 }}>
                  <Prose text={m.content} />
                  {cards.map((a, i) => <DraftCard key={a.id} a={a} collapsed={i > 0} onChanged={() => load(threadId)} />)}
                  {m.data.status === "failed" && <span style={{ fontSize: 12.5, color: "#9a3224" }}>This run didn&apos;t finish.</span>}
                </div>
              </div>
            );
          })}
          {streaming && (
            <div style={{ display: "flex", gap: 14 }}>
              <BotTile desk={desk} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, fontSize: 15, lineHeight: 1.55 }}>
                {streaming.text ? <Prose text={streaming.text} /> : null}
                <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#776a5e" }}><TypingDots /> {streaming.status}</span>
              </div>
            </div>
          )}
          {error && <div role="alert" style={{ alignSelf: "center", fontSize: 13, color: "#9a3224", background: "#f6d9d3", padding: "6px 12px", borderRadius: 8 }}>{error}</div>}
          <div ref={end} />
        </div>
      </div>

      {!viewer && (
        <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "0 32px 24px" }}>
          <div style={{ width: "100%", maxWidth: 740, background: "#fffbf4", border: "1px solid #dccfbe", borderRadius: 16, padding: "14px 14px 12px 18px", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 8px 24px -16px rgba(60,40,30,.3)" }}>
            <textarea aria-label={`Message ${desk.name}`} rows={2} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
              placeholder={`Ask ${desk.name} something or give it a job…`}
              style={{ fontSize: 15, lineHeight: 1.5, border: "none", outline: "none", background: "transparent", resize: "none", fontFamily: "inherit", color: "#2b2320", width: "100%", padding: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {(CHIPS[desk.kind] ?? ["What did you do overnight?", "What needs me today?"]).map((c) => (
                <button key={c} onClick={() => send(c)} disabled={!!streaming} style={{ fontSize: 13, padding: "7px 12px", borderRadius: 20, background: "#f1e8db", color: "#4f443c", border: "none" }}>{c}</button>
              ))}
              <span style={{ flex: 1 }} />
              <button aria-label="Send" onClick={() => send(text)} disabled={!!streaming || !text.trim()} style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: "#2b2320", color: "#fbf3e6", fontSize: 17, border: "none", opacity: streaming || !text.trim() ? 0.5 : 1 }}>↑</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
