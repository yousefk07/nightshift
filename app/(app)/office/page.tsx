"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { BotTile } from "@/components/office/cards";
import { BotPanel, BrokenBanner, DeskPanel, OfficeFloor, QuietOffice, startBot } from "@/components/office/Office";
import { useApi } from "@/lib/client";

// 01 Office (desktop) and M1 Office (phone).
export default function OfficePage() {
  const { office, me, refreshOffice } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const runs = useApi<{ runs: unknown[] }>("/api/runs?limit=1");
  const desks = office?.desks ?? [];
  const desk = desks.find((d) => d.id === selected);
  const quiet = runs.data && runs.data.runs.length === 0 && desks.every((d) => d.status !== "working");
  const mobileLabel = (s: string) => ({ needs_you: "Needs you", working: "Working", idle: "Idle", blocked: "Blocked", failed: "Didn't finish", paused: "Paused" })[s] ?? s;

  return (
    <>
      <BrokenBanner />
      <div className="ns-office-desktop" style={{ flex: 1, display: "flex", minHeight: 0, height: "calc(100vh - 59px)" }}>
        {/* the room runs edge to edge (wall, rail, floorboards); the desks sit centred in it */}
        <div style={{ position: "relative", flex: 1, overflow: "auto", background: "linear-gradient(#3b2f47 0 200px, #2c2236 200px 214px, transparent 214px), repeating-linear-gradient(90deg, transparent 0 56px, #372b42 56px 60px) 0 0 / 100% 200px no-repeat, repeating-linear-gradient(0deg, transparent 0 40px, #4f3a31 40px 44px), #5a4238" }}>
          {quiet && <QuietOffice onStart={() => { startBot("inbox", () => refreshOffice()).finally(refreshOffice); setTimeout(refreshOffice, 800); }} />}
          <div style={{ display: "flex", justifyContent: "center", minWidth: "min-content" }}>
            <OfficeFloor desks={desks} waiting={me.waiting} selected={selected} onSelect={(id) => setSelected(selected === id ? null : id)} />
          </div>
        </div>
        {selected === "me" ? <DeskPanel onClose={() => setSelected(null)} /> : desk ? <BotPanel key={desk.id} desk={desk} onClose={() => setSelected(null)} /> : null}
      </div>

      <div className="ns-office-mobile" style={{ padding: "18px 16px 24px", display: "none", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Office</div>
          <div style={{ fontSize: 13.5, color: "#cbbcae" }}>{office?.working ?? 0} working · {office?.needs_you.length ?? 0} needs you</div>
        </div>
        <Link href="/desk" style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, background: "#f0c27a", color: "#2a1f2b", textDecoration: "none" }}>
          <span className="pixel" style={{ fontSize: 16, flex: 1 }}>Your desk</span>
          <span style={{ fontSize: 13 }}>Brief · {me.waiting} waiting</span>
          {me.waiting > 0 && <span className="pixel" style={{ background: "#2a1f2b", color: "#f0c27a", padding: "2px 8px" }}>{me.waiting}</span>}
        </Link>
        {desks.map((d) => (
          <Link key={d.id} href={`/chats/${encodeURIComponent(d.kind)}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, background: "#2d2330", color: "#f1e6d6", textDecoration: "none" }}>
            <BotTile desk={d} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pixel" style={{ fontSize: 15 }}>{d.name.toUpperCase()} <span style={{ color: "#a8988a" }}>· {d.role.toUpperCase()}</span></div>
              <div style={{ fontSize: 12.5, color: d.status === "needs_you" ? "#f0c27a" : "#cbbcae", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.status === "working" ? d.status_text : mobileLabel(d.enabled ? d.status : "paused")}</div>
            </div>
          </Link>
        ))}
      </div>
      <style>{`@media (max-width: 720px) { .ns-office-desktop { display: none !important; } .ns-office-mobile { display: flex !important; } }`}</style>
    </>
  );
}
