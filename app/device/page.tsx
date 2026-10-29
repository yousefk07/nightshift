"use client";

import { useEffect, useState } from "react";

// `nightshift login` sends people here to approve their terminal. Placeholder look until the real UI lands.
export default function Device() {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    queueMicrotask(() => setCode(new URLSearchParams(location.search).get("code") ?? ""));
  }, []);
  const approve = async (scope: "full" | "read") => {
    const r = await fetch("/api/device/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, scope }) });
    const j = await r.json();
    setNote(r.ok ? `Approved ${j.approved}. You can go back to your terminal.` : r.status === 401 ? "Sign in first, then come back to this link." : j.error);
  };
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Approve this device</h1>
      <p>Your terminal is asking to sign in to Nightshift. Check the code matches what it shows.</p>
      <p style={{ fontFamily: "monospace", fontSize: 28, letterSpacing: 3 }}>{code || "…"}</p>
      <p>
        <button onClick={() => approve("full")}>Approve (full, approvals allowed)</button>{" "}
        <button onClick={() => approve("read")}>Read only</button>
      </p>
      {note && <p>{note}</p>}
    </main>
  );
}
