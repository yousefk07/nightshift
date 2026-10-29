// The little markdown bots write, split into blocks. Shared by the app (components/Prose.tsx) and the emails
// (lib/email.ts), so a brief reads the same in both.

export type Block = { kind: "p" | "h" | "ul" | "ol"; lines: string[] }; // for a list, each line is an item
const BULLET = /^\s*(?:[-*•])\s+/, NUMBER = /^\s*\d+[.)]\s+/;

export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd(), prev = out[out.length - 1];
    if (!line.trim()) { out.push({ kind: "p", lines: [] }); continue; }
    // "# Heading", or a line that is only bold ("**Needs you**"), starts a section
    if (/^#{1,4}\s/.test(line)) { out.push({ kind: "h", lines: [line.replace(/^#{1,4}\s+/, "")] }); continue; }
    if (/^\*\*[^*]+\*\*:?$/.test(line.trim())) { out.push({ kind: "h", lines: [line.trim().replace(/^\*\*|\*\*:?$/g, "").replace(/:$/, "")] }); continue; }
    const list = BULLET.test(line) ? "ul" : NUMBER.test(line) ? "ol" : null;
    if (list) {
      const item = line.replace(list === "ul" ? BULLET : NUMBER, "");
      if (prev?.kind === list) prev.lines.push(item);
      else out.push({ kind: list, lines: [item] });
      continue;
    }
    // an indented line straight after a list item carries on that item
    if ((prev?.kind === "ul" || prev?.kind === "ol") && /^\s{2,}/.test(raw)) { prev.lines[prev.lines.length - 1] += " " + line.trim(); continue; }
    if (prev?.kind === "p" && prev.lines.length) prev.lines.push(line);
    else out.push({ kind: "p", lines: [line] });
  }
  return out.filter((b) => b.lines.length > 0);
}

// Inline pieces: **bold**, `code`, [label](https://…) and @mentions; everything else is plain text.
export type Piece = { t: "text" | "b" | "code" | "mention"; v: string } | { t: "link"; v: string; href: string };
const INLINE = /(\*\*[^*\n]+?\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|@[\p{L}][\p{L}\d_.-]*)/gu;

export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const s = m[0], at = m.index ?? 0;
    if (at > last) out.push({ t: "text", v: text.slice(last, at) });
    if (s.startsWith("**")) out.push({ t: "b", v: s.slice(2, -2) });
    else if (s.startsWith("`")) out.push({ t: "code", v: s.slice(1, -1) });
    else if (s.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\((.+)\)$/.exec(s) ?? [];
      out.push({ t: "link", v: label, href });
    } else out.push({ t: "mention", v: s });
    last = at + s.length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

// The first sentence, cut at a word, for subjects and previews.
export function firstSentence(text: string, max = 70) {
  const plain = text.replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
  const one = (plain.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? plain).replace(/[.]$/, "");
  return one.length <= max ? one : one.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
