import Link from "next/link";
import { PageHead, SitePage } from "@/components/site";

export const metadata = { title: "Pricing" };

// P1 Pricing: compare plans.
const ROWS: [string, string, string, string][] = [
  ["Bots", "Penny, Ledger, Dawn", "Up to 10, specialists included", "Up to 40"],
  ["Bot room", "—", "Included", "Included"],
  ["Seats that can approve", "1", "2", "10"],
  ["Inboxes", "1", "3", "10"],
  ["Research hours a month", "—", "100", "300"],
  ["CLI and API", "CLI", "CLI", "CLI + API"],
  ["Activity log", "30 days", "1 year", "Unlimited, exportable"],
  ["Roles", "—", "Approver, viewer", "All roles"],
  ["Support", "Email", "Email, 1 business day", "Priority, 4 hours"],
];

export default function Pricing() {
  return (
    <SitePage>
      <PageHead title="Simple pricing, no per-task fees" sub="Every plan starts with a 14-day trial of Studio. Money never moves without you on any plan." />
      <div style={{ overflowX: "auto", background: "#fffbf4", border: "1px solid #e4d9ca", borderRadius: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15, minWidth: 640 }}>
          <thead>
            <tr>{["", "Solo · $39/mo", "Studio · $89/mo", "Team · $189/mo"].map((h, i) => <th key={i} style={{ textAlign: "left", padding: "18px 20px", borderBottom: "1px solid #e4d9ca", fontSize: 16 }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {ROWS.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={{ padding: "14px 20px", borderBottom: "1px solid #ece3d6", fontWeight: i === 0 ? 600 : 400, color: c === "—" ? "#a99ba1" : "#2b2320" }}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 15, color: "#5d5148", margin: 0 }}>Yearly billing is two months free. Extra seats are $15 a month. Need more than 15 seats or a custom bot? <a href="mailto:hello@nightshiftai.ca">We&apos;ll set it up with you.</a></p>
      <div><Link href="/signin?new=1" style={{ fontSize: 16, fontWeight: 600, padding: "14px 22px", borderRadius: 12, background: "#2b2320", color: "#fbf3e6", textDecoration: "none" }}>Start your 14-day trial</Link></div>
    </SitePage>
  );
}
