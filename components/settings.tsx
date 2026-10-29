"use client";

import type { CSSProperties, ReactNode } from "react";

// Shared layout bits for the settings pages.
export function Page({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 28 }}>{title}</h1>
          {sub && <p style={{ margin: 0, color: "#5d5148", fontSize: 15 }}>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, children, style }: { title?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ background: "#fffbf4", border: "1px solid #e4d9ca", borderRadius: 12, ...style }}>
      {title && <div style={{ padding: "14px 18px", borderBottom: "1px solid #ece3d6", fontSize: 15, fontWeight: 700 }}>{title}</div>}
      {children}
    </section>
  );
}

export function Row({ title, sub, children, first }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; first?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderTop: first ? "none" : "1px solid #ece3d6", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: "#776a5e", marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export const Locked = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", background: "#efe4d4", borderRadius: 10, padding: "12px 16px", fontSize: 14 }}>
    <span aria-hidden style={{ width: 10, height: 12, border: "2px solid #2b2320", borderRadius: 2, flex: "none" }} />{children}
  </div>
);

export function Meter({ label, used, of, foot }: { label: string; used: number; of: number; foot?: ReactNode }) {
  const pct = of ? Math.min(100, Math.round((used / of) * 100)) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, border: "1px solid #e4d9ca", borderRadius: 12, background: "#fffbf4", flex: 1, minWidth: 200 }}>
      <div style={{ fontSize: 13.5, color: "#5d5148" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{used} <span style={{ fontSize: 14, fontWeight: 400, color: "#776a5e" }}>of {of || "—"}</span></div>
      <div style={{ height: 6, background: "#ece3d6", borderRadius: 3 }}><div style={{ width: `${pct}%`, height: 6, background: pct > 90 ? "#b94a3a" : "#2b2320", borderRadius: 3 }} /></div>
      {foot && <div style={{ fontSize: 12.5, color: "#776a5e" }}>{foot}</div>}
    </div>
  );
}
