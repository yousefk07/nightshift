import type { CSSProperties, ReactNode } from "react";

// The design's pixel art (Nightshift.dc.html): bots drawn as box-shadow sprites, desks as bordered boxes.
// The core five have their own head shapes; every specialist borrows one (picked from its id) in its own hue.

export const OL = "#2a1f2b";
const BODY = ["....oddo....", "..oooooooo..", ".obbbbbbbbo.", ".obblllbbbo.", ".obbbbbbbbo."];
const HEADS: Record<string, string[]> = {
  penny: [".....aa.....", ".....oo.....", "..oooooooo..", ".ollllllllo.", ".obssssssbo.", ".obsessesbo.", ".obssssssbo.", ".obbbbbbbbo.", "..oooooooo.."],
  sage: ["....oooo....", "...ollllo...", "..ollllllo..", ".obbbbbbbbo.", ".obssssssbo.", ".obsessesbo.", ".obssssssbo.", ".obbbbbbbbo.", "..oooooooo.."],
  ledger: ["..a......a..", "..o......o..", "oooooooooooo", "ollllllllllo", "obssssssssbo", "obseesseesbo", "obssssssssbo", "obbbbbbbbbbo", "oooooooooooo"],
  nudge: ["............", "....oooo....", "..oolllloo..", ".ollllllllo.", "aobssssssboa", "aobsessesboa", ".obssssssbo.", "..obbbbbbo..", "...oooooo..."],
  dawn: ["............", "..a..aa..a..", "...a.oo.a...", "...oooooo...", "..ollllllo..", "..obssssbo..", "..obessebo..", "..obbbbbbo..", "...oooooo..."],
};
const CORE: Record<string, keyof typeof HEADS> = { inbox: "penny", research: "sage", invoices: "ledger", leads: "nudge", brief: "dawn" };
const SHAPES = Object.keys(HEADS);

export interface Persona {
  kind: string; // template id
  hue: number;
  prop?: string;
}

function shapeOf(kind: string) {
  if (CORE[kind]) return CORE[kind];
  let h = 0;
  for (const ch of kind) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHAPES[h % SHAPES.length];
}

export const palette = (hue: number, blocked = false) => ({
  o: OL,
  b: `oklch(0.74 0.1 ${hue})`,
  l: `oklch(0.86 0.07 ${hue})`,
  d: `oklch(0.55 0.1 ${hue})`,
  s: "#1d1820",
  e: blocked ? "#ff6b5a" : "#fff1cc",
  a: `oklch(0.88 0.15 ${hue})`,
});

function Sprite({ map, pal, size, style }: { map: string[]; pal: Record<string, string>; size: number; style?: CSSProperties }) {
  const sh: string[] = [];
  map.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const c = pal[r[x]];
      if (c) sh.push(`${(x + 1) * size}px ${(y + 1) * size}px 0 ${c}`);
    }
  });
  return (
    <div style={{ position: "relative", width: map[0].length * size, height: map.length * size, flex: "none", ...style }}>
      <div style={{ position: "absolute", left: -size, top: -size, width: size, height: size, boxShadow: sh.join(",") }} />
    </div>
  );
}

// A bot's face, for avatars and lists. size 4 = big, 2.5 = list, 2 = tiny.
export function Head({ bot, size = 2.5, blocked }: { bot: Persona; size?: number; blocked?: boolean }) {
  return <Sprite map={HEADS[shapeOf(bot.kind)]} pal={palette(bot.hue, blocked)} size={size} />;
}

// The avatar tile used beside names (head on a tinted square).
export function Avatar({ bot, size = 36 }: { bot: Persona; size?: number }) {
  const scale = size / 36;
  return (
    <div style={{ width: size, height: size, flex: "none", background: `oklch(0.9 0.05 ${bot.hue})`, border: `2px solid ${OL}`, display: "grid", placeItems: "center", overflow: "hidden" }}>
      <Head bot={bot} size={2.2 * scale} />
    </div>
  );
}

const Box = ({ s }: { s: CSSProperties }) => <div style={{ position: "absolute", boxSizing: "border-box", ...s }} />;

function Mug({ x, y }: { x: number; y: number }) {
  return (
    <>
      <Box s={{ left: x, top: y, width: 18, height: 16, background: "#efe3cf", border: `3px solid ${OL}` }} />
      <Box s={{ left: x + 16, top: y + 4, width: 7, height: 8, border: `3px solid ${OL}`, borderLeft: "none" }} />
      <div style={{ position: "absolute", left: x + 6, top: y - 10, width: 4, height: 4, background: "#d8ccc0", animation: "ns-steam 2.4s ease-out infinite" }} />
      <div style={{ position: "absolute", left: x + 10, top: y - 8, width: 4, height: 4, background: "#d8ccc0", animation: "ns-steam 2.4s 1.2s ease-out infinite" }} />
    </>
  );
}

// What's on the desk: the design's five props, plus simple ones for the specialists.
function Prop({ prop, hue }: { prop: string; hue: number }) {
  const b = `3px solid ${OL}`;
  const list: CSSProperties[] = {
    papers: [{ left: 20, top: 70, width: 36, height: 14, background: "#f1e5cf", border: b }, { left: 24, top: 62, width: 36, height: 14, background: "#fff6e6", border: b }, { left: 48, top: 65, width: 6, height: 6, background: "oklch(0.65 0.13 30)" }],
    books: [{ left: 18, top: 74, width: 42, height: 10, background: "oklch(0.62 0.09 185)", border: b }, { left: 22, top: 66, width: 36, height: 10, background: "#e8d9bd", border: b }, { left: 20, top: 58, width: 40, height: 10, background: "oklch(0.6 0.1 30)", border: b }],
    coins: [0, 1, 2, 3].map((i) => ({ left: 22, top: 76 - i * 6, width: 18, height: 8, background: "#e9c46a", border: b })).concat([0, 1].map((i) => ({ left: 42, top: 76 - i * 6, width: 18, height: 8, background: "#e9c46a", border: b }))),
    plant: [{ left: 26, top: 66, width: 26, height: 20, background: "#a5603f", border: b }, { left: 22, top: 48, width: 14, height: 20, background: "oklch(0.62 0.1 140)", border: b }, { left: 38, top: 42, width: 14, height: 26, background: "oklch(0.7 0.1 140)", border: b }],
    phone: [{ left: 24, top: 64, width: 30, height: 20, background: "#5b4a54", border: b }, { left: 28, top: 56, width: 22, height: 10, background: `oklch(0.7 0.1 ${hue})`, border: b }],
    calendar: [{ left: 20, top: 58, width: 36, height: 28, background: "#fff6e6", border: b }, { left: 20, top: 58, width: 36, height: 9, background: "oklch(0.6 0.13 25)", border: b }, { left: 28, top: 72, width: 6, height: 6, background: OL }],
    toolbox: [{ left: 16, top: 66, width: 44, height: 20, background: "oklch(0.6 0.14 30)", border: b }, { left: 30, top: 58, width: 16, height: 10, border: b, borderBottom: "none" }],
    camera: [{ left: 20, top: 64, width: 38, height: 22, background: "#463a4f", border: b }, { left: 32, top: 68, width: 14, height: 14, background: `oklch(0.75 0.08 ${hue})`, border: b, borderRadius: 7 }],
    chart: [{ left: 20, top: 56, width: 38, height: 30, background: "#fff6e6", border: b }, { left: 26, top: 72, width: 6, height: 10, background: `oklch(0.6 0.1 ${hue})` }, { left: 35, top: 66, width: 6, height: 16, background: `oklch(0.6 0.1 ${hue})` }, { left: 44, top: 62, width: 6, height: 20, background: `oklch(0.6 0.1 ${hue})` }],
    clipboard: [{ left: 22, top: 56, width: 32, height: 30, background: "#8a5a3a", border: b }, { left: 27, top: 62, width: 22, height: 20, background: "#fff6e4" }, { left: 30, top: 52, width: 16, height: 8, background: "#b9b0a6", border: b }],
    laptop: [{ left: 16, top: 72, width: 46, height: 12, background: "#b9b0a6", border: b }, { left: 20, top: 56, width: 38, height: 18, background: "#463a4f", border: b }],
    box: [{ left: 18, top: 60, width: 40, height: 26, background: "#c89a6a", border: b }, { left: 34, top: 60, width: 8, height: 26, background: "#e8d9bd" }],
    megaphone: [{ left: 22, top: 66, width: 14, height: 14, background: `oklch(0.7 0.12 ${hue})`, border: b }, { left: 34, top: 60, width: 22, height: 26, background: `oklch(0.78 0.12 ${hue})`, border: b }],
    magnifier: [{ left: 22, top: 58, width: 24, height: 24, border: `4px solid ${OL}`, borderRadius: 12, background: "#cfe8ea" }, { left: 42, top: 78, width: 14, height: 6, background: OL, transform: "rotate(45deg)" }],
  }[prop] ?? [];
  return <>{list.map((s, i) => <Box key={i} s={s} />)}</>;
}

export type DeskState = "typing" | "hand" | "idle" | "blocked";

export const deskState = (status: string): DeskState =>
  status === "working" ? "typing" : status === "needs_you" ? "hand" : status === "blocked" || status === "failed" ? "blocked" : "idle";

// One bot at its desk, 200x150, drawn exactly like the design's office desks.
export function Desk({ bot, state }: { bot: Persona; state: DeskState }) {
  const P = palette(bot.hue, state === "blocked");
  const lean = state === "idle";
  const tilt = state === "blocked" ? "rotate(8deg)" : lean ? "rotate(-12deg) translateX(-4px)" : "none";
  const map = [...HEADS[shapeOf(bot.kind)], ...BODY];
  const prop = bot.prop ?? "papers";
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Box s={{ left: 20, top: -30, width: 180, height: 170, background: `radial-gradient(closest-side, oklch(0.8 0.12 ${state === "blocked" ? 25 : bot.hue} / .3), transparent)` }} />
      <Box s={{ left: 62, top: 36, width: 76, height: 60, background: "#3d2f3e", border: `4px solid ${OL}`, transform: lean ? "rotate(-12deg)" : "none", transformOrigin: "50% 100%" }} />
      <div style={{ position: "absolute", left: 70, top: 14, transformOrigin: "50% 100%", transform: tilt, animation: state === "typing" ? "ns-bob 1.1s steps(2) infinite" : "none" }}>
        <Sprite map={map} pal={P} size={5} />
      </div>
      {state === "hand" && (
        <div style={{ position: "absolute", left: 130, top: -8, width: 10, height: 44, background: P.b, boxShadow: `0 0 0 3px ${OL}`, transformOrigin: "50% 100%", animation: "ns-wave 1.4s ease-in-out infinite" }}>
          <div style={{ position: "absolute", left: -3, top: -10, width: 16, height: 12, background: P.l, boxShadow: `0 0 0 3px ${OL}` }} />
        </div>
      )}
      <Box s={{ left: 8, top: 84, width: 184, height: 20, background: "#b9865f", border: `4px solid ${OL}` }} />
      <Box s={{ left: 8, top: 100, width: 184, height: 44, background: "#8a5b40", border: `4px solid ${OL}` }} />
      <Box s={{ left: 24, top: 114, width: 56, height: 4, background: "#6e4632" }} />
      <Box s={{ left: 120, top: 114, width: 56, height: 4, background: "#6e4632" }} />
      <Box s={{ left: 78, top: 86, width: 44, height: 10, background: "#efe3cf", border: `3px solid ${OL}` }} />
      <Box s={{ left: 140, top: 44, width: 48, height: 40, background: state === "blocked" ? "#5a2a2a" : "#463a4f", border: `4px solid ${OL}` }} />
      <Box s={{ left: 134, top: 48, width: 6, height: 32, background: state === "blocked" ? "#ff6b5a" : P.a }} />
      <Box s={{ left: 156, top: 82, width: 16, height: 6, background: OL }} />
      {prop !== "mug" && <Prop prop={prop} hue={bot.hue} />}
      {(state === "typing" || state === "hand") && (
        <div style={{ position: "absolute", left: 66, top: 66, width: 10, height: 24, background: P.b, boxShadow: `0 0 0 3px ${OL}`, animation: state === "typing" ? "ns-tap .32s steps(2) infinite" : "none" }} />
      )}
      {state === "typing" && <div style={{ position: "absolute", left: 124, top: 66, width: 10, height: 24, background: P.b, boxShadow: `0 0 0 3px ${OL}`, animation: "ns-tap .32s .16s steps(2) infinite" }} />}
      {(lean || prop === "mug") && <Mug x={30} y={66} />}
    </div>
  );
}

// "YOUR DESK": the owner's desk with the clipboard, lamp, mug and plant (280x150).
export function OwnerDesk() {
  const b3 = `3px solid ${OL}`, b4 = `4px solid ${OL}`;
  const parts: CSSProperties[] = [
    { left: -20, top: -40, width: 320, height: 220, background: "radial-gradient(closest-side, rgba(255,196,120,.28), transparent)" },
    { left: 100, top: 24, width: 80, height: 60, background: "#3d2f3e", border: b4 },
    { left: 0, top: 66, width: 280, height: 48, background: "#b9865f", border: b4 },
    { left: 0, top: 110, width: 280, height: 38, background: "#8a5b40", border: b4 },
    { left: 20, top: 124, width: 70, height: 4, background: "#6e4632" },
    { left: 190, top: 124, width: 70, height: 4, background: "#6e4632" },
    { left: 108, top: 56, width: 60, height: 54, background: "#8a5a3a", border: b4 },
    { left: 116, top: 64, width: 44, height: 40, background: "#fff6e4" },
    { left: 122, top: 74, width: 30, height: 3, background: "#b8aa9c" },
    { left: 122, top: 82, width: 24, height: 3, background: "#b8aa9c" },
    { left: 122, top: 90, width: 28, height: 3, background: "#b8aa9c" },
    { left: 124, top: 50, width: 28, height: 12, background: "#b9b0a6", border: b3 },
    { left: 214, top: 94, width: 36, height: 10, background: "#5b4a54", border: b3 },
    { left: 228, top: 40, width: 8, height: 56, background: "#5b4a54" },
    { left: 196, top: 22, width: 44, height: 26, background: "#f0c27a", border: b4 },
    { left: 70, top: 58, width: 22, height: 18, background: "#a5603f", border: b3 },
    { left: 68, top: 40, width: 12, height: 20, background: "oklch(0.62 0.1 140)", border: b3 },
    { left: 80, top: 34, width: 12, height: 26, background: "oklch(0.7 0.1 140)", border: b3 },
  ];
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {parts.map((s, i) => <Box key={i} s={s} />)}
      <Mug x={36} y={66} />
    </div>
  );
}

export const NeedDot = () => <span style={{ width: 8, height: 8, background: "#f0c27a", display: "inline-block", animation: "ns-pulse 1.6s ease-in-out infinite" }} />;

export const TypingDots = () => (
  <span style={{ display: "inline-flex", gap: 4 }}>
    {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#9a8b7d", animation: `ns-pulse 1.2s ${i * 0.2}s infinite` }} />)}
  </span>
);

export const PixelText = ({ children, size = 16, style }: { children: ReactNode; size?: number; style?: CSSProperties }) => (
  <span style={{ fontFamily: "var(--font-pixel)", fontSize: size, ...style }}>{children}</span>
);
