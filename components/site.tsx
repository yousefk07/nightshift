import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

// The public site's nav and footer (Nightshift Home / Pages designs).

export function SiteNav({ dark = true }: { dark?: boolean }) {
  const fg = dark ? "#f1e6d6" : "#2b2320", muted = dark ? "#d6c8bb" : "#5d5148", bg = dark ? "#221a24" : "#f6f0e7";
  return (
    <nav style={{ minHeight: 72, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px clamp(16px,4vw,56px)", background: bg, color: fg, flexWrap: "wrap" }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, color: fg, textDecoration: "none" }}>
        <Logo tone={dark ? "dark" : "light"} size={22} />
      </Link>
      <div className="ns-site-links" style={{ display: "flex", gap: 32, fontSize: 15 }}>
        {[["/#team", "The team"], ["/#how", "How it works"], ["/pricing", "Pricing"], ["/security", "Security"], ["/docs", "CLI"]].map(([h, l]) => <Link key={h} href={h} style={{ color: muted, textDecoration: "none" }}>{l}</Link>)}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Link href="/signin" style={{ fontSize: 15, padding: "10px 14px", color: fg, textDecoration: "none" }}>Sign in</Link>
        <Link href="/signin?new=1" style={{ fontSize: 15, fontWeight: 600, padding: "11px 18px", borderRadius: 10, background: "#f0c27a", color: "#221a24", textDecoration: "none" }}>Start free trial</Link>
      </div>
      <style>{`@media (max-width: 860px) { .ns-site-links { display: none !important; } }`}</style>
    </nav>
  );
}

export function SiteFooter() {
  const cols: [string, [string, string][]][] = [
    ["Product", [["/#team", "The team"], ["/pricing", "Pricing"], ["/docs", "CLI"], ["/help", "Changelog"]]],
    ["Resources", [["/help", "Help center"], ["/docs", "Docs & API"], ["https://www.vercel-status.com", "System status"]]],
    ["Company", [["/help#contact", "About"], ["mailto:hello@nightshiftai.ca", "Contact"]]],
    ["Legal", [["/legal/privacy", "Privacy"], ["/legal/terms", "Terms"], ["/security", "Security"], ["/legal/dpa", "DPA"]]],
  ];
  return (
    <footer style={{ background: "#221a24", color: "#d6c8bb", padding: "56px clamp(16px,4vw,56px) 40px", display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#f1e6d6" }}>
            <Logo tone="dark" size={20} />
          </div>
          <p style={{ fontSize: 14, maxWidth: 260, lineHeight: 1.6 }}>A night shift for your small business. Made in Canada.</p>
        </div>
        {cols.map(([t, links]) => (
          <div key={t} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 140 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f1e6d6" }}>{t}</div>
            {links.map(([h, l]) => <a key={l} href={h} style={{ color: "#d6c8bb", fontSize: 14, textDecoration: "none" }}>{l}</a>)}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "#a99ba1" }}>© Nightshift · nightshiftai.ca</div>
    </footer>
  );
}

export function PageHead({ kicker, title, sub }: { kicker?: string; title: string; sub?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
      {kicker && <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a4f14" }}>{kicker}</div>}
      <h1 style={{ margin: 0, fontSize: "clamp(34px,5vw,48px)", lineHeight: 1.1, letterSpacing: "-.01em" }}>{title}</h1>
      {sub && <p style={{ margin: 0, fontSize: 18, lineHeight: 1.55, color: "#5d5148" }}>{sub}</p>}
    </div>
  );
}

export const SitePage = ({ children }: { children: ReactNode }) => (
  <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f6f0e7", color: "#2b2320" }}>
    <SiteNav />
    <div style={{ flex: 1, padding: "64px clamp(16px,4vw,56px) 96px", display: "flex", flexDirection: "column", gap: 40 }}>{children}</div>
    <SiteFooter />
  </main>
);
