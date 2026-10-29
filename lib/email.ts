import { blocks, firstSentence, pieces } from "./markdown";

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

// The bot mark drawn with table cells, not an image, so it shows even when mail apps block pictures.
const BOT = [".....aa.....", ".....oo.....", "..oooooooo..", ".occcccccco.", ".ocddddddco.", ".ocdaddadco.", ".ocddddddco.", ".occcccccco.", "..oooooooo.."];
export function markHtml(px = 3) {
  const fill: Record<string, string> = { o: "#f6f0e7", c: "#f6f0e7", d: "#221a24", a: "#f0c27a", ".": "#221a24" };
  // each row is its own small table of same-colour runs, which keeps the markup short and the widths exact
  const run = (n: number, color: string) => `<td width="${n * px}" height="${px}" bgcolor="${color}" style="font-size:0;line-height:0"></td>`;
  const rows = BOT.map((r) => {
    const cells: string[] = [];
    for (let i = 0; i < r.length; ) {
      let j = i;
      while (j < r.length && fill[r[j]] === fill[r[i]]) j++;
      cells.push(run(j - i, fill[r[i]]));
      i = j;
    }
    return `<tr><td><table cellpadding="0" cellspacing="0" border="0"><tr>${cells.join("")}</tr></table></td></tr>`;
  }).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

// The header lockup: the bot and the wordmark side by side in two cells, which every mail app keeps on one line.
export const brandHtml = () => `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle">${markHtml(3)}</td><td valign="middle" style="padding-left:12px;color:#f1e6d6;font-size:18px;font-weight:700;letter-spacing:-0.01em;font-family:${FONT}">nightshift</td></tr></table>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const INK = "#2b2320", INK2 = "#4a3f38", MUTED = "#857769", LINE = "#eee4d6", ACCENT = "#b46a22";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

// The shared look of every Nightshift email: the dark nightshift bar, one white card, one dark button.
// `body` is ready-made HTML (the brief); `paragraphs` are plain text.
export function layout(o: { heading: string; eyebrow?: string; lead?: string; paragraphs?: string[]; body?: string; button?: { label: string; url: string }; footer?: string; preheader?: string }) {
  const app = process.env.APP_URL || "https://www.nightshiftai.ca";
  const p = (o.paragraphs ?? []).map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK2}">${esc(t)}</p>`).join("");
  const button = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 4px"><tr><td style="background:${INK};border-radius:9px"><a href="${esc(o.button.url)}" style="display:inline-block;padding:12px 20px;color:#faf6ef;text-decoration:none;font-weight:600;font-size:14.5px;font-family:${FONT}">${esc(o.button.label)} &rarr;</a></td></tr></table>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#efe8dd;font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(o.preheader ?? o.lead ?? o.paragraphs?.[0] ?? "")}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe8dd"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fffdf9;border:1px solid #e4d9cb;border-radius:16px;overflow:hidden">
<tr><td style="background:#221a24;padding:16px 28px">
${brandHtml()}
</td></tr>
<tr><td style="padding:30px 28px 26px">
${o.eyebrow ? `<div style="font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${ACCENT};margin:0 0 8px">${esc(o.eyebrow)}</div>` : ""}
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:${INK};font-weight:700;letter-spacing:-0.01em">${esc(o.heading)}</h1>
${o.lead ? `<p style="margin:0 0 6px;font-size:16.5px;line-height:1.55;color:${INK2}">${inline(o.lead)}</p>` : ""}
${p}${o.body ?? ""}${button}
</td></tr>
<tr><td style="padding:16px 28px;background:#faf6ef;border-top:1px solid ${LINE};font-size:12.5px;line-height:1.5;color:${MUTED}">${esc(o.footer ?? "Nothing is sent without your OK.")}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#9c8f84">Nightshift &middot; <a href="${esc(app)}" style="color:#9c8f84">nightshiftai.ca</a></p>
</td></tr></table>
</body></html>`;
  const text = [o.eyebrow, o.heading, "", o.lead, ...(o.paragraphs ?? []), o.button ? `\n${o.button.label}: ${o.button.url}` : "", "", o.footer ?? ""].filter((l) => l !== undefined).join("\n");
  return { html, text };
}

// Inline markdown to email-safe HTML. Dots in code get a zero-width space so mail apps don't turn them into links.
function inline(s: string) {
  return pieces(s).map((x) =>
    x.t === "b" ? `<b style="color:${INK};font-weight:650">${esc(x.v)}</b>`
    : x.t === "code" ? `<span style="font-family:SFMono-Regular,Consolas,monospace;font-size:13px;background:#f4efe7;border-radius:4px;padding:1px 5px">${esc(x.v).replace(/\./g, ".&#8203;")}</span>`
    : x.t === "link" ? `<a href="${esc(x.href)}" style="color:${ACCENT}">${esc(x.v)}</a>`
    : esc(x.v)).join("");
}

// A brief (or any bot text) as email sections: headings become small labels over a hairline, lists stay lists.
export function briefHtml(markdown: string) {
  return blocks(markdown).map((b, i) => {
    if (b.kind === "h") return `<div style="margin:${i ? 26 : 18}px 0 10px;padding-top:${i ? 18 : 0}px;${i ? `border-top:1px solid ${LINE};` : ""}font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${MUTED}">${inline(b.lines[0])}</div>`;
    if (b.kind === "ul" || b.kind === "ol") {
      const tag = b.kind;
      return `<${tag} style="margin:0 0 12px;padding-left:20px;color:${INK2}">${b.lines.map((l) => `<li style="margin:0 0 7px;font-size:15px;line-height:1.55">${inline(l)}</li>`).join("")}</${tag}>`;
    }
    return `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${INK2}">${b.lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

// The morning brief email. Dawn's opening paragraph leads: its first sentence is the big heading (and the subject),
// the rest sits under it; her sections follow.
export function briefEmail(o: { day: string; headline: string; content: string; pending: number; url: string; writer?: { name: string; role: string } }) {
  const date = new Date(`${o.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const paras = o.content.replace(/\r/g, "").split(/\n{2,}/);
  const opens = paras[0] && !/^\s*(\*\*|#|[-*•] )/.test(paras[0]); // the content starts with a plain lead paragraph
  const lead = (opens ? paras[0] : o.headline).trim();
  const heading = firstSentence(lead, 60);
  const rest = lead.replace(/\*\*/g, "").slice(lead.replace(/\*\*/g, "").indexOf(heading.replace(/…$/, "")) + heading.length).replace(/^[.!?:\s]+/, "").trim();
  const body = (opens ? paras.slice(1) : paras).join("\n\n");
  const { html, text } = layout({
    eyebrow: `${o.writer?.role ?? "Morning brief"} · ${date}`, heading, lead: heading.endsWith("…") ? lead : rest || undefined, preheader: lead,
    body: briefHtml(body),
    button: o.pending ? { label: `Review ${o.pending} approval${o.pending === 1 ? "" : "s"}`, url: o.url } : { label: "Open the office", url: o.url },
    footer: `Written by ${o.writer?.name ?? "Dawn"}, your ${(o.writer?.role ?? "brief bot").toLowerCase()}${o.writer?.role ? " bot" : ""}. Change the time, days or length in Settings → Notifications & brief.`,
  });
  return { subject: `${heading} · ${date}`, html, text: `${text}\n\n${body}` };
}
