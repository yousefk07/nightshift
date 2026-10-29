"use client";

import { useState, type ReactNode } from "react";

// Bot text, the little markdown bots write: paragraphs, "- " and "1. " lists, "#" headings, **bold**, `code`,
// [links](https://…) and @mentions. Built as elements, never as HTML. Long text can fold behind "Show all".

type Mention = (name: string) => string | null; // a colour for a known bot, else null

const INLINE = /(\*\*[^*\n]+?\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|@[\p{L}][\p{L}\d_.-]*)/gu;

function inline(text: string, mention?: Mention): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(INLINE)) {
    const t = m[0], at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (t.startsWith("**")) out.push(<b key={k++} style={{ fontWeight: 650 }}>{inline(t.slice(2, -2), mention)}</b>);
    else if (t.startsWith("`")) out.push(<code key={k++} className="mono" style={{ fontSize: "0.88em", background: "rgba(42,31,43,.07)", padding: "1px 5px", borderRadius: 4 }}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\((.+)\)$/.exec(t) ?? [];
      out.push(<a key={k++} href={href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecorationThickness: 1, textUnderlineOffset: 2 }}>{label}</a>);
    } else {
      const color = mention?.(t.slice(1));
      out.push(color ? <span key={k++} style={{ fontWeight: 600, color }}>{t}</span> : t);
    }
    last = at + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "p" | "h" | "ul" | "ol"; lines: string[] }; // for a list, each line is an item
const BULLET = /^\s*(?:[-*•])\s+/, NUMBER = /^\s*\d+[.)]\s+/;

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd(), prev = out[out.length - 1];
    if (!line.trim()) { out.push({ kind: "p", lines: [] }); continue; }
    if (/^#{1,4}\s/.test(line)) { out.push({ kind: "h", lines: [line.replace(/^#{1,4}\s+/, "")] }); continue; }
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

export function Prose({ text, mention, collapse = false }: { text: string; mention?: Mention; collapse?: boolean }) {
  const [open, setOpen] = useState(false);
  const all = blocks(text);
  const long = collapse && (text.length > 700 || all.reduce((n, b) => n + b.lines.length, 0) > 9);
  const shown = long && !open ? all.slice(0, 3) : all;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowWrap: "anywhere" }}>
      {shown.map((b, i) =>
        b.kind === "h" ? <div key={i} style={{ fontWeight: 700 }}>{inline(b.lines[0], mention)}</div>
        : b.kind === "p" ? <div key={i} style={{ textWrap: "pretty" as never }}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l, mention)}</span>)}</div>
        : b.kind === "ul" ? <ul key={i} style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 3 }}>{b.lines.map((t, j) => <li key={j}>{inline(t, mention)}</li>)}</ul>
        : <ol key={i} style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 3 }}>{b.lines.map((t, j) => <li key={j}>{inline(t, mention)}</li>)}</ol>
      )}
      {long && (
        <button onClick={() => setOpen(!open)} style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, font: "inherit", fontSize: 13, fontWeight: 600, color: "#8a6a3a", cursor: "pointer" }}>
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}
