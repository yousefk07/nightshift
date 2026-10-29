"use client";

import { useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type MouseEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

// The design's small pieces: buttons, pills, section labels, cards, inputs. Colours follow Nightshift.dc.html.

type BtnKind = "dark" | "outline" | "gold" | "ghost" | "danger" | "night";
const BTN: Record<BtnKind, CSSProperties> = {
  dark: { background: "#2b2320", color: "#fbf3e6", border: "1px solid #2b2320" },
  outline: { background: "transparent", color: "#2b2320", border: "1px solid #cdbfac" },
  gold: { background: "#f0c27a", color: "#2a1f2b", border: "3px solid #2a1f2b", fontFamily: "var(--font-pixel)", boxShadow: "3px 3px 0 0 rgba(0,0,0,.25)" },
  ghost: { background: "transparent", color: "#5d5148", border: "1px solid transparent" },
  danger: { background: "transparent", color: "#a3392b", border: "1px solid #e3b5ab" },
  night: { background: "#46374d", color: "#f1e6d6", border: "1px solid #46374d" },
};

// When onClick returns a promise the button holds itself down until it settles (no double approvals, double
// hires or double invites) and a failure becomes a toast instead of nothing happening.
export function Button({ kind = "dark", size = "md", style, onClick, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; size?: "sm" | "md" | "lg" }) {
  const [busy, setBusy] = useState(false);
  const pad = size === "sm" ? "6px 12px" : size === "lg" ? "12px 22px" : "8px 15px";
  const fs = size === "sm" ? 12.5 : size === "lg" ? 15 : 13.5;
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    const r = onClick?.(e) as unknown;
    if (r && typeof (r as Promise<unknown>).then === "function") {
      setBusy(true);
      (r as Promise<unknown>).catch((err: Error) => window.dispatchEvent(new CustomEvent("ns-error", { detail: err?.message ?? "Something went wrong." }))).finally(() => setBusy(false));
    }
  };
  const off = disabled || busy;
  return (
    <button
      type="button"
      {...rest}
      onClick={click}
      disabled={off}
      aria-busy={busy || undefined}
      style={{ fontSize: fs, fontWeight: 600, padding: pad, minHeight: size === "sm" ? 32 : undefined, borderRadius: kind === "gold" ? 0 : 8, cursor: busy ? "progress" : disabled ? "not-allowed" : "pointer", opacity: disabled && !busy ? 0.5 : 1, fontFamily: "inherit", whiteSpace: "nowrap", transition: "transform .08s, opacity .15s", animation: busy ? "ns-pulse 1s ease-in-out infinite" : undefined, ...BTN[kind], ...style }}
    />
  );
}

export function Pill({ tone = "amber", children, style }: { tone?: "amber" | "green" | "grey" | "red" | "teal"; children: ReactNode; style?: CSSProperties }) {
  const t = { amber: ["#f8e2c4", "#8a4f14"], green: ["#dcebd8", "#2f6b3a"], grey: ["#ece4d9", "#6d6056"], red: ["#f6d9d3", "#9a3224"], teal: ["#d6ecea", "#1f6a64"] }[tone];
  return <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: t[0], color: t[1], whiteSpace: "nowrap", ...style }}>{children}</span>;
}

export const Label = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#716459", ...style }}>{children}</div>
);

export const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ background: "#fffaf3", border: "1px solid #e4d9ca", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, ...style }}>{children}</div>
);

const field: CSSProperties = { width: "100%", fontSize: 14.5, padding: "10px 12px", borderRadius: 8, border: "1px solid #d5c7b6", background: "#fffdf9", color: "#2b2320", fontFamily: "inherit" };
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} style={{ ...field, ...p.style }} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} style={{ ...field, resize: "vertical", lineHeight: 1.5, ...p.style }} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} style={{ ...field, ...p.style }} />;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 12.5, color: "#776a5e" }}>{hint}</span>}
    </label>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{ width: 40, height: 23, borderRadius: 12, border: "none", padding: 2, background: on ? "#2b2320" : "#d5c7b6", display: "flex", justifyContent: on ? "flex-end" : "flex-start", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, flex: "none" }}
    >
      <span style={{ width: 19, height: 19, borderRadius: 10, background: "#fffaf3" }} />
    </button>
  );
}

// "Nothing is sent until you approve it." and friends.
export const Note = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <div style={{ fontSize: 12.5, color: "#776a5e", ...style }}>{children}</div>;

export function ErrorLine({ error }: { error?: string | null }) {
  return error ? <div role="alert" style={{ fontSize: 13, color: "#9a3224", background: "#f6d9d3", padding: "8px 12px", borderRadius: 8 }}>{error}</div> : null;
}
