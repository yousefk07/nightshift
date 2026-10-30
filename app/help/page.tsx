import Link from "next/link";
import { PageHead, SitePage } from "@/components/site";

export const metadata = { title: "Help" };

// P3 Help center.
const TOPICS: [string, string][] = [
  ["Why didn't my draft send?", "It's waiting for you. Every bot starts on \"ask me first\": open Your desk, review the draft and press Approve. You have 8 seconds to undo."],
  ["Pause one bot for a specific client", "In the bot room, write \"@Ledger hold Acme until I say so\", or ask Ledger in chat. The hold shows in the room's sidebar until you release it."],
  ["Teach Penny how you write", "Settings → Profile → Email signature and tone. Penny also learns from your sent mail, and you can add facts to Team memory."],
  ["Reconnect an expired email connection", "When a connection breaks you'll see a banner in the office. Press Reconnect, or go to Settings → Connections."],
  ["Let a bot send email on its own", "Settings → Bots & approvals → Emails: \"Send on its own\". Credit notes and invoices still always wait for you."],
  ["Hire a specialist for my industry", "Settings → Bots & approvals → Hire a bot. Pick your industry to see its specialists."],
];

export default function Help() {
  return (
    <SitePage>
      <PageHead title="How can we help?" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        {TOPICS.map(([q, a]) => (
          <div key={q} style={{ background: "#fffbf4", border: "1px solid #e4d9ca", borderRadius: 16, padding: 22 }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{q}</div>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: "#4a3f38" }}>{a}</div>
          </div>
        ))}
      </div>
      <div id="contact" style={{ background: "#221a24", color: "#f1e6d6", borderRadius: 16, padding: 28, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Still stuck?</div>
          <div style={{ color: "#d6c8bb" }}>A real person answers within one business day, usually much sooner.</div>
        </div>
        <a href="mailto:admin@nightshiftai.ca" style={{ fontSize: 15, fontWeight: 600, padding: "12px 20px", borderRadius: 10, background: "#f0c27a", color: "#221a24", textDecoration: "none" }}>Contact support</a>
        <Link href="/docs" style={{ color: "#f0c27a" }}>CLI &amp; API docs →</Link>
      </div>
    </SitePage>
  );
}
