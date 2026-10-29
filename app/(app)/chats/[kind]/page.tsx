"use client";

import { use } from "react";
import { useApp } from "@/components/AppShell";
import { ChatView, TeamList } from "@/components/office/Chat";

// 02 Chat with one bot.
export default function ChatPage({ params }: { params: Promise<{ kind: string }> }) {
  const kind = decodeURIComponent(use(params).kind);
  const { office } = useApp();
  const desk = office?.desks.find((d) => d.kind === kind);
  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0, background: "#f8f2e9" }}>
      <aside className="ns-chat-team" style={{ width: 300, flex: "none", padding: "20px 14px", borderRight: "1px solid #e4d9ca", background: "#f4ecdf", overflowY: "auto" }}>
        <TeamList current={kind} />
      </aside>
      {desk ? <ChatView key={desk.kind} desk={desk} /> : <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#776a5e" }}>{office ? "That bot isn't on your team." : "Loading…"}</div>}
      <style>{`@media (max-width: 720px) { .ns-chat-team { display: none; } }`}</style>
    </div>
  );
}
