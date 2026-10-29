"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// The invite email's "Accept invite" link. Placeholder look until the real UI lands.
export default function Invite() {
  const router = useRouter();
  const [note, setNote] = useState("Accepting your invite…");
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token");
    if (!token) return queueMicrotask(() => setNote("This link is missing its invite."));
    fetch("/api/invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(async (r) => {
      const j = await r.json();
      if (r.ok) router.push("/");
      else setNote(r.status === 401 ? "Sign in with the address the invite was sent to, then open this link again." : j.error);
    });
  }, [router]);
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Join the night shift</h1>
      <p>{note}</p>
    </main>
  );
}
