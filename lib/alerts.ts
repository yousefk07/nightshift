import { layout, sendMail } from "./email";

// Nightshift's own business alerts, for the people who run Nightshift (OWNER_ALERT_EMAILS): payments, failed
// payments, new customers, plan changes, cancellations, new sign-ups. In the same look as every Nightshift email.

export const alertEmails = () => (process.env.OWNER_ALERT_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

export type AlertKind = "signup" | "subscribed" | "plan_changed" | "canceling" | "resumed" | "ended" | "paid" | "payment_failed";
const EYEBROW: Record<AlertKind, string> = {
  signup: "New sign-up", subscribed: "New customer", plan_changed: "Plan changed", canceling: "Cancellation",
  resumed: "Cancellation taken back", ended: "Subscription ended", paid: "Payment received", payment_failed: "Payment failed",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const rowsHtml = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;border:1px solid #eee4d6;border-radius:10px;border-collapse:separate;overflow:hidden">${rows
    .map(([k, v], i) => `<tr><td style="padding:10px 14px;font-size:13px;color:#857769;${i ? "border-top:1px solid #eee4d6;" : ""}width:38%">${esc(k)}</td><td style="padding:10px 14px;font-size:14px;color:#2b2320;font-weight:600;${i ? "border-top:1px solid #eee4d6;" : ""}">${esc(v)}</td></tr>`)
    .join("")}</table>`;

export function alertEmail(a: { kind: AlertKind; heading: string; lead: string; rows?: [string, string][]; button?: { label: string; url: string } }) {
  const app = process.env.APP_URL || "https://www.nightshiftai.ca";
  const { html, text } = layout({
    eyebrow: EYEBROW[a.kind], heading: a.heading, lead: a.lead, preheader: a.lead,
    body: a.rows?.length ? rowsHtml(a.rows) : "",
    button: a.button ?? { label: "Open the admin view", url: `${app}/admin` },
    footer: "A Nightshift business alert, sent to the people who run Nightshift.",
  });
  const plain = a.rows?.length ? `${text}\n\n${a.rows.map(([k, v]) => `${k}: ${v}`).join("\n")}` : text;
  return { subject: `${EYEBROW[a.kind]}: ${a.heading}`, html, text: plain };
}

// Never throws: a failed alert must not break a sign-up or a webhook.
export async function ownerAlert(a: Parameters<typeof alertEmail>[0]) {
  const to = alertEmails();
  if (!to.length || !process.env.RESEND_API_KEY) return false;
  try {
    await sendMail({ to, ...alertEmail(a) });
    return true;
  } catch (e) {
    console.error("owner alert", a.kind, e);
    return false;
  }
}

export const usd = (cents: number, currency = "usd") => (cents / 100).toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase() });
