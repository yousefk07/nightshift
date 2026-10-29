import { PageHead, SitePage } from "@/components/site";

export const metadata = { title: "Security" };

// P2 Security: what each bot can read, draft, send and delete.
const MATRIX: [string, string, string, string, string][] = [
  ["Penny", "Email, calendar", "Replies", "Only if you allow it", "Never"],
  ["Sage", "Public web", "Reports", "Never", "Never"],
  ["Ledger", "Invoices, payments", "Reminders, credit notes", "Reminders if you allow it; money never on its own", "Never"],
  ["Nudge", "CRM, email threads", "Follow-ups, quotes", "Only if you allow it", "Never"],
  ["Dawn", "Other bots' activity", "The brief", "Brief only, to you", "Never"],
];
const PILLARS: [string, string][] = [
  ["Least access", "Bots read and draft. Sending email is off until you turn it on per bot, and money always waits for you."],
  ["Not used for training", "Your email, invoices and contacts are only used to do your work, never to train models."],
  ["Everything logged", "Every action and approval is in the activity log: who did what, and why."],
];

export default function Security() {
  return (
    <SitePage>
      <PageHead kicker="Security" title="Your team can draft. Only you can move money." sub="Every bot gets the least access its job needs, nothing is used to train AI models, and everything is logged." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        {PILLARS.map(([t, d]) => (
          <div key={t} style={{ background: "#fffbf4", border: "1px solid #e4d9ca", borderRadius: 16, padding: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{t}</div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: "#4a3f38" }}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{ overflowX: "auto", background: "#fffbf4", border: "1px solid #e4d9ca", borderRadius: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15, minWidth: 680 }}>
          <thead><tr>{["Bot", "Read", "Draft", "Send / pay", "Delete"].map((h) => <th key={h} style={{ textAlign: "left", padding: "16px 20px", borderBottom: "1px solid #e4d9ca" }}>{h}</th>)}</tr></thead>
          <tbody>{MATRIX.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={{ padding: "13px 20px", borderBottom: "1px solid #ece3d6", fontWeight: i === 0 ? 600 : 400 }}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15.5, lineHeight: 1.9, color: "#4a3f38" }}>
        <li>Connection tokens and keys are encrypted at rest (AES-256-GCM); everything travels over TLS.</li>
        <li>Two-step sign-in with an authenticator app; once it&apos;s on, it&apos;s required to approve money.</li>
        <li>Roles: owners, approvers, email-only approvers and viewers.</li>
        <li>Delete your workspace at any time; its history is purged after 30 days.</li>
        <li>Questions or a report: <a href="mailto:security@nightshiftai.ca">security@nightshiftai.ca</a></li>
      </ul>
    </SitePage>
  );
}
