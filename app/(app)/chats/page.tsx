"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/components/AppShell";
import { TeamList } from "@/components/office/Chat";

// Chats: on a laptop, open the first bot that needs you (or Penny); on a phone, the team list.
export default function ChatsPage() {
  const { office } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (!office || window.innerWidth <= 720) return;
    const first = office.desks.find((d) => d.waiting > 0) ?? office.desks.find((d) => d.kind === "inbox") ?? office.desks[0];
    if (first) router.replace(`/chats/${encodeURIComponent(first.kind)}`);
  }, [office, router]);
  return (
    <div style={{ flex: 1, background: "#f8f2e9", color: "#2b2320", padding: "20px 14px", minHeight: "calc(100vh - 59px)" }}>
      <TeamList />
    </div>
  );
}
