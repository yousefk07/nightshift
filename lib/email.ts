// Outgoing mail from Nightshift itself (alerts, invites, the morning brief), through Resend.
// The business's own customer emails go through their own mailbox (lib/connectors/mail.ts), never through here.

export async function sendMail(m: { to: string | string[]; subject: string; html: string; text: string; replyTo?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM || "Nightshift <onboarding@resend.dev>", to: m.to, subject: m.subject, html: m.html, text: m.text, reply_to: m.replyTo }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { id: string };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// The shared look of every Nightshift email: warm paper, one dark button.
export function layout(o: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }) {
  const p = o.paragraphs.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3a302b">${esc(t)}</p>`).join("");
  const b = o.button ? `<p style="margin:22px 0"><a href="${esc(o.button.url)}" style="background:#2b2320;color:#faf6ef;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">${esc(o.button.label)}</a></p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><div style="max-width:520px;margin:0 auto;padding:32px 24px"><p style="font-weight:700;color:#2b2320;margin:0 0 20px">Nightshift</p><h1 style="font-size:21px;color:#2b2320;margin:0 0 16px">${esc(o.heading)}</h1>${p}${b}<p style="font-size:12px;color:#8a7d73;margin-top:28px">${esc(o.footer ?? "Nightshift · Nothing is sent without your OK.")}</p></div></body></html>`;
  const text = [o.heading, "", ...o.paragraphs, o.button ? `\n${o.button.label}: ${o.button.url}` : "", "", o.footer ?? ""].join("\n");
  return { html, text };
}

// Markdown-ish brief to simple HTML paragraphs and bullets.
export function briefHtml(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) return `<ul style="padding-left:18px;margin:0 0 14px">${lines.map((l) => `<li style="margin:4px 0">${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
      if (/^#{1,3} /.test(block)) return `<h3 style="font-size:15px;margin:18px 0 8px;color:#2b2320">${inline(block.replace(/^#{1,3} /, ""))}</h3>`;
      return `<p style="margin:0 0 14px;line-height:1.55">${inline(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
