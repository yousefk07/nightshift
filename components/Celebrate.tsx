"use client";

import { Head, type Persona } from "./pixel";
import { Button, useDialog } from "./ui";

// The team cheering: everyone hops in turn under pixel confetti. For the big moments (a new plan, a first
// connection). Click, Esc or the button closes it; with "reduce motion" on it's a still card.

const COLORS = ["#f0c27a", "oklch(0.74 0.1 185)", "oklch(0.72 0.12 15)", "oklch(0.75 0.1 140)", "#f6f0e7", "oklch(0.7 0.1 300)"];
// fixed, so the render is the same every time (no Math.random in render)
const PIECES = Array.from({ length: 56 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 90) / 100,
  dur: 1.8 + ((i * 29) % 12) / 10,
  size: 6 + ((i * 7) % 3) * 3,
  dx: (((i * 41) % 9) - 4) * 14,
  spin: 360 + ((i * 67) % 5) * 120,
  color: COLORS[i % COLORS.length],
}));

export function Celebrate({ title, line, team, onClose, cta = "Let's go" }: { title: string; line: string; team: (Persona & { name?: string })[]; onClose: () => void; cta?: string }) {
  const panel = useDialog(onClose);
  const crew = team.slice(0, 7);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "radial-gradient(900px 600px at 50% 40%, rgba(58,40,68,.97), rgba(18,12,20,.99))", display: "grid", placeItems: "center", padding: 16, overflow: "hidden" }}>
      {PIECES.map((p, i) => (
        <span key={i} aria-hidden style={{ position: "absolute", top: 0, left: `${p.left}%`, width: p.size, height: p.size, background: p.color, animation: `ns-confetti ${p.dur}s ${p.delay}s cubic-bezier(.3,.6,.5,1) forwards`, opacity: 0, ["--dx" as string]: `${p.dx}px`, ["--spin" as string]: `${p.spin}deg` }} />
      ))}
      <div ref={panel} onClick={(e) => e.stopPropagation()} style={{ position: "relative", textAlign: "center", color: "var(--night-ink)", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, animation: "ns-pop .45s cubic-bezier(.2,.9,.3,1.2) both", maxWidth: 520 }}>
        {[[-40, 10], [520, 40], [-20, 150], [500, 170]].map(([x, y], i) => (
          <span key={i} aria-hidden className="pixel" style={{ position: "absolute", left: x, top: y, color: "var(--gold)", fontSize: 22, animation: `ns-twinkle 1.6s ${i * 0.4}s ease-in-out infinite` }}>✦</span>
        ))}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", justifyContent: "center", flexWrap: "wrap", minHeight: 90, padding: "0 8px" }}>
          {crew.map((b, i) => (
            <div key={b.kind} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ animation: `ns-cheer .9s ${0.15 + i * 0.12}s ease-in-out 3 both`, transformOrigin: "50% 100%" }}>
                <Head bot={b} size={4.5} />
              </div>
              {b.name && <span className="pixel" style={{ fontSize: 12, color: `oklch(0.82 0.08 ${b.hue})` }}>{b.name.toUpperCase()}</span>}
            </div>
          ))}
        </div>
        <div className="pixel" style={{ fontSize: 34, color: "var(--gold)", lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 16.5, lineHeight: 1.5, color: "#e6d8c8" }}>{line}</div>
        <Button size="lg" onClick={onClose} style={{ background: "var(--gold)", color: "var(--outline)" }}>{cta}</Button>
      </div>
    </div>
  );
}
