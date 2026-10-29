"use client";

import { DeskPanel } from "@/components/office/Office";

// Your desk as its own page: the brief and everything waiting (where "Penny needs you" goes).
export default function DeskPage() {
  return (
    <div style={{ flex: 1, display: "flex", background: "#5a4238", minHeight: "calc(100vh - 59px)" }}>
      <DeskPanel asPage />
    </div>
  );
}
