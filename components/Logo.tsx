import type { CSSProperties } from "react";

// The Nightshift logo (Claude Design "Nightshift Logo", option 1b): the night-shift bot, a pixel bot head with an
// amber antenna light, drawn in the office sprite style. "dark" is for dark backgrounds, "light" for light ones.

const BOT = [".....aa.....", ".....oo.....", "..oooooooo..", ".occcccccco.", ".ocddddddco.", ".ocdaddadco.", ".ocddddddco.", ".occcccccco.", "..oooooooo.."];
const PALETTE = {
  dark: { o: "#f6f0e7", c: "#f6f0e7", d: "#221a24", a: "#f0c27a" },
  light: { o: "#221a24", c: "#3b2f47", d: "#221a24", a: "#f0c27a" },
} as const;

export function LogoMark({ tone = "dark", size = 24, style }: { tone?: "dark" | "light"; size?: number; style?: CSSProperties }) {
  const pal = PALETTE[tone] as Record<string, string>;
  const rects: { x: number; y: number; fill: string }[] = [];
  BOT.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (pal[row[x]]) rects.push({ x, y, fill: pal[row[x]] }); });
  return (
    <svg viewBox="0 0 12 9" width={size} height={(size * 9) / 12} shapeRendering="crispEdges" style={{ display: "block", flex: "none", ...style }} aria-hidden>
      {rects.map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} />)}
    </svg>
  );
}

// Mark + "nightshift" wordmark.
export function Logo({ tone = "dark", size = 20, wordSize, color, style }: { tone?: "dark" | "light"; size?: number; wordSize?: number; color?: string; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.45), ...style }}>
      <LogoMark tone={tone} size={Math.round(size * 1.35)} />
      <span className="pixel" style={{ fontSize: wordSize ?? size, fontWeight: 600, color: color ?? (tone === "dark" ? "#f6f0e7" : "#221a24"), lineHeight: 1 }}>nightshift</span>
    </span>
  );
}

// The app icon: the light bot on a rounded gold tile (112 · 60 · 32 in the design).
export function AppIcon({ size = 60 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.23, background: "#f0c27a", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <LogoMark tone="light" size={Math.round(size * 0.68)} />
    </span>
  );
}
