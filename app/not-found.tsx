import Link from "next/link";
import { Head } from "@/components/pixel";

// P6 404.
export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#221a24", color: "#f1e6d6", padding: 24, textAlign: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 460 }}>
        <div style={{ width: 80, height: 80, borderRadius: 16, background: "oklch(0.92 0.045 185)", display: "grid", placeItems: "center" }}>
          <Head bot={{ kind: "research", hue: 185 }} size={5} />
        </div>
        <div className="pixel" style={{ fontSize: 56, color: "#f0c27a" }}>404</div>
        <h1 style={{ margin: 0, fontSize: 30 }}>Sage looked everywhere</h1>
        <p style={{ margin: 0, color: "#d6c8bb", fontSize: 16 }}>This page doesn&apos;t exist, or it moved while you were asleep.</p>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/office" style={{ fontSize: 15, fontWeight: 600, padding: "12px 20px", borderRadius: 10, background: "#f0c27a", color: "#221a24", textDecoration: "none" }}>Back to the office</Link>
          <Link href="/help" style={{ fontSize: 15, padding: "12px 20px", color: "#f1e6d6" }}>Search help</Link>
        </div>
      </div>
    </main>
  );
}
