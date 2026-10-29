"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/AppShell";

// Settings: the left nav from the Account design, on warm paper.
const NAV: { group: string; items: [string, string, boolean?][] }[] = [
  { group: "Account", items: [["/settings/profile", "Profile"], ["/settings/notifications", "Notifications & brief"], ["/settings/security", "Security"]] },
  { group: "Workspace", items: [["/settings/bots", "Bots & approvals"], ["/settings/connections", "Connections"], ["/settings/memory", "Team memory"], ["/settings/team", "Team"], ["/settings/api", "API & CLI"], ["/settings/activity", "Activity log"]] },
  { group: "Billing", items: [["/settings/billing", "Plan & billing", true]] },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me } = useApp();
  return (
    <div style={{ flex: 1, display: "flex", background: "#f6f0e7", color: "#2b2320" }} className="ns-settings">
      <nav aria-label="Settings" style={{ width: 240, flex: "none", padding: "28px 18px", borderRight: "1px solid #e4d9ca", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, padding: "0 10px" }}>Settings</div>
        {NAV.map((g) => (
          <div key={g.group} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#716459", padding: "0 10px 6px" }}>{g.group}</div>
            {g.items.filter(([, , ownerOnly]) => !ownerOnly || me.user.role === "owner").map(([href, label]) => {
              const on = path === href || (href === "/settings/profile" && path === "/settings");
              return <Link key={href} href={href} aria-current={on ? "page" : undefined} style={{ padding: "8px 10px", borderRadius: 8, fontSize: 14.5, textDecoration: "none", color: "#2b2320", fontWeight: on ? 600 : 400, background: on ? "#ebe0d0" : "transparent" }}>{label}</Link>;
            })}
          </div>
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0, padding: "32px clamp(16px,4vw,48px) 64px", overflowY: "auto" }}>
        <div style={{ maxWidth: 860 }}>{children}</div>
      </div>
      <style>{`@media (max-width: 860px) { .ns-settings { flex-direction: column; } .ns-settings > nav { width: auto !important; flex-direction: row !important; flex-wrap: wrap; border-right: none !important; border-bottom: 1px solid #e4d9ca; padding: 14px !important; gap: 8px !important; } .ns-settings > nav > div:first-child { width: 100%; } }`}</style>
    </div>
  );
}
