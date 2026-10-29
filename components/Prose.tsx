"use client";

import { useState, type ReactNode } from "react";
import { blocks, pieces } from "@/lib/markdown";

// Bot text, the little markdown bots write (lib/markdown.ts), built as elements, never as HTML.
// Long text can fold behind "Show all".

type Mention = (name: string) => string | null; // a colour for a known bot, else null

function inline(text: string, mention?: Mention): ReactNode[] {
  return pieces(text).map((x, k) =>
    x.t === "b" ? <b key={k} style={{ fontWeight: 650 }}>{inline(x.v, mention)}</b>
    : x.t === "code" ? <code key={k} className="mono" style={{ fontSize: "0.88em", background: "rgba(42,31,43,.07)", padding: "1px 5px", borderRadius: 4 }}>{x.v}</code>
    : x.t === "link" ? <a key={k} href={x.href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecorationThickness: 1, textUnderlineOffset: 2 }}>{x.v}</a>
    : x.t === "mention" && mention?.(x.v.slice(1)) ? <span key={k} style={{ fontWeight: 600, color: mention(x.v.slice(1))! }}>{x.v}</span>
    : x.v);
}

export function Prose({ text, mention, collapse = false }: { text: string; mention?: Mention; collapse?: boolean }) {
  const [open, setOpen] = useState(false);
  const all = blocks(text);
  const long = collapse && (text.length > 700 || all.reduce((n, b) => n + b.lines.length, 0) > 9);
  const shown = long && !open ? all.slice(0, 3) : all;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowWrap: "anywhere" }}>
      {shown.map((b, i) =>
        b.kind === "h" ? <div key={i} style={{ fontWeight: 700, marginTop: i ? 4 : 0 }}>{inline(b.lines[0], mention)}</div>
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
