"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, useApi, useLive } from "@/lib/client";
import { Logo } from "./Logo";
import { NeedDot } from "./pixel";

// The signed-in app: who you are, the office summary for the top bar, and live updates, shared by every screen.

export interface Me {
  user: { id: string; email: string; role: "owner" | "approver" | "approver_email" | "viewer"; full_name?: string; avatar_url?: string | null; two_step: boolean };
  workspace: { id: string; name: string; timezone: string; industry: string; onboarded_at: string | null; onboarding_step: number; brief_prefs: { time: string; days: number[]; length: string; channels: string[] }; shift_start: string; guardrails: Record<string, boolean>; plan: string; trial_ends_at: string; deleted_at: string | null };
  plan: { name: string; active: boolean; limits: { bots: number; seats: number; inboxes: number; researchHours: number; room: boolean; logDays: number | null; api: boolean }; trial_ends_at: string | null };
  connections: { id: string; provider: string; kinds: string[]; account: string; status: string; broken_at?: string | null; last_synced_at?: string | null }[];
  waiting: number;
  unread_notifications: number;
}

export interface DeskInfo {
  id: string; kind: string; name: string; role: string; title: string; hue: number; prop: string;
  status: "idle" | "working" | "needs_you" | "blocked" | "failed" | "paused"; status_text: string; waiting: number; next_run_at: string | null; approval: "ask" | "auto"; enabled: boolean;
}
export interface Office { working: number; needs_you: string[]; blocked: { name: string; why: string }[]; waiting_total: number; desks: DeskInfo[] }

interface Ctx {
  me: Me;
  office: Office | null;
  refreshOffice: () => void;
  refreshMe: () => void;
  onLive: (fn: (e: { type: string; data: any }) => void) => () => void;
  toast: (t: { text: string; undo?: () => Promise<void>; seconds?: number }) => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppShell");
  return c;
};

const TABS = [
  { href: "/office", label: "Office" },
  { href: "/room", label: "Bot room" },
  { href: "/chats", label: "Chats" },
];
const MOBILE_TABS = [
  { href: "/office", label: "Office" },
  { href: "/approvals", label: "Approvals" },
  { href: "/room", label: "Bot room" },
  { href: "/chats", label: "Chats" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const me = useApi<Me>("/api/me");
  const office = useApi<Office>(me.data ? "/api/office" : null, { poll: 30_000 });
  const [listeners] = useState(() => new Set<(e: { type: string; data: any }) => void>());
  const [toasts, setToasts] = useState<{ id: number; text: string; undo?: () => Promise<void>; until: number }[]>([]);
  const [now, setNow] = useState<Date | null>(null); // set after load: the clock isn't part of the prerendered page

  useEffect(() => {
    queueMicrotask(() => setNow(new Date()));
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Not signed in: to sign-in. Signed in but not set up: to onboarding.
  useEffect(() => {
    const e = me.error;
    if (e instanceof ApiError && e.status === 401) router.replace(`/signin?next=${encodeURIComponent(path)}`);
    else if (me.data && !me.data.workspace.onboarded_at && !path.startsWith("/onboarding") && me.data.user.role === "owner") router.replace("/onboarding");
  }, [me.error, me.data, path, router]);

  useLive(
    useCallback(
      (e) => {
        listeners.forEach((fn) => fn(e));
        if (e.type === "bot" || e.type === "action") office.refresh();
      },
      [listeners, office],
    ),
  );

  const toast = useCallback((t: { text: string; undo?: () => Promise<void>; seconds?: number }) => {
    const id = Date.now() + Math.random();
    const seconds = t.seconds ?? (t.undo ? 8 : 4);
    setToasts((all) => [...all, { id, text: t.text, undo: t.undo, until: Date.now() + seconds * 1000 }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), seconds * 1000);
  }, []);

  if (me.error && !(me.error.status === 401)) return <Offline onRetry={me.refresh} />;
  if (!me.data) return <div style={{ minHeight: "100vh", background: "var(--night)" }} />;

  const o = office.data;
  const tz = me.data.workspace.timezone;
  const needs = o?.needs_you ?? [];
  const ctx: Ctx = {
    me: me.data,
    office: o,
    refreshOffice: office.refresh,
    refreshMe: me.refresh,
    onLive: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    toast,
  };
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <AppCtx.Provider value={ctx}>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--night)", color: "var(--night-ink)" }}>
        <header style={{ height: 56, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "var(--night)", borderBottom: "3px solid var(--night-2)", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <Link href="/office" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--night-ink)", textDecoration: "none" }}>
              <Logo tone="dark" size={18} />
            </Link>
            <span style={{ color: "#a99ba1", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.data.workspace.name}</span>
          </div>
          <nav className="ns-tabs" style={{ display: "flex", gap: 4, background: "#2d2330", padding: 4, borderRadius: 10, fontSize: 13.5 }}>
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} style={{ padding: "7px 14px", borderRadius: 7, fontWeight: active(t.href) ? 600 : 400, textDecoration: "none", color: active(t.href) ? "#f1e6d6" : "#c2b3b8", background: active(t.href) ? "#46374d" : "transparent" }}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#cbbcae" }}>
            <span className="mono ns-hide-sm">{now?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</span>
            {o && <span className="ns-hide-sm">{o.working} working</span>}
            {needs.length > 0 && (
              <Link href="/desk" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--gold)", textDecoration: "none" }}>
                <NeedDot /> {needs.length === 1 ? `${needs[0]} needs you` : `${needs.length} bots need you`}
              </Link>
            )}
            <Link href="/settings" aria-label="Account and settings" style={{ width: 30, height: 30, borderRadius: 15, display: "grid", placeItems: "center", background: "#46374d", color: "var(--night-ink)", textDecoration: "none", fontWeight: 700 }}>
              {(me.data.user.full_name || me.data.user.email).slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>

        {me.data.workspace.deleted_at ? (
          <div role="alert" style={{ background: "var(--bad)", color: "#fff", padding: "10px 20px", fontSize: 14, display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
            This workspace is set to be deleted on {new Date(new Date(me.data.workspace.deleted_at).getTime() + 30 * 86_400_000).toLocaleDateString("en-US", { month: "long", day: "numeric" })}, so the team is off shift.
            {me.data.user.role === "owner" && (
              <button onClick={() => api("/api/workspace", { json: { restore: true } }).then(me.refresh)} style={{ background: "#fff", color: "var(--bad)", border: 0, borderRadius: 6, padding: "4px 10px", fontWeight: 700, cursor: "pointer" }}>Restore it</button>
            )}
          </div>
        ) : !me.data.plan.active && (
          <div role="alert" style={{ background: "var(--bad)", color: "#fff", padding: "10px 20px", fontSize: 14, display: "flex", gap: 12, justifyContent: "center" }}>
            Your {me.data.plan.name.toLowerCase()} has ended, so the team is off shift. <Link href="/settings/billing" style={{ color: "#fff", fontWeight: 700 }}>Pick a plan</Link>
          </div>
        )}

        <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</main>

        <nav className="ns-mobile-tabs" aria-label="Sections">
          {MOBILE_TABS.map((t) => (
            <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} style={{ flex: 1, padding: "10px 4px 14px", textAlign: "center", fontSize: 12, fontWeight: 600, textDecoration: "none", color: active(t.href) ? "var(--gold)" : "var(--night-muted)", position: "relative" }}>
              {t.label}
              {t.href === "/approvals" && ctx.me.waiting > 0 && <span style={{ position: "absolute", top: 4, marginLeft: 4, background: "var(--gold)", color: "var(--night)", borderRadius: 8, padding: "0 5px", fontSize: 11 }}>{ctx.me.waiting}</span>}
            </Link>
          ))}
        </nav>

        <div aria-live="polite" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, zIndex: 50 }}>
          {toasts.map((t) => (
            <div key={t.id} role="status" style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--ink)", color: "var(--paper)", padding: "10px 16px", borderRadius: 10, fontSize: 14, boxShadow: "var(--shadow)", animation: "ns-toast .2s ease-out" }}>
              {t.text}
              {t.undo && (
                <button onClick={async () => { await t.undo!(); setToasts((all) => all.filter((x) => x.id !== t.id)); }} style={{ background: "none", border: "none", color: "var(--gold)", fontWeight: 700 }}>
                  Undo · <Countdown until={t.until} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .ns-mobile-tabs { display: none; }
        @media (max-width: 720px) {
          .ns-tabs, .ns-hide-sm { display: none !important; }
          .ns-mobile-tabs { display: flex; position: sticky; bottom: 0; background: var(--night-2); border-top: 2px solid #000; z-index: 20; }
        }
      `}</style>
    </AppCtx.Provider>
  );
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(until - 8000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.ceil((until - now) / 1000))}s</>;
}

// X6 "We can't reach the office".
export function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--night)", color: "var(--night-ink)", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 440 }}>
        <div className="pixel" style={{ fontSize: 26, marginBottom: 12 }}>We can&apos;t reach the office</div>
        <p style={{ color: "var(--night-muted)", lineHeight: 1.6 }}>Your bots are still working. This is only the connection between you and us. Nothing will be sent while you&apos;re away.</p>
        <p style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "center" }}>
          <button onClick={onRetry} style={{ background: "var(--gold)", border: "none", padding: "10px 18px", fontWeight: 700, color: "var(--night)" }}>Try again</button>
          <a href="https://status.vercel.com" style={{ color: "var(--gold)" }}>System status</a>
        </p>
      </div>
    </div>
  );
}

// Approve a card with the 8-second undo toast. Returns true once approved.
export function useApprove() {
  const { toast, refreshOffice, refreshMe } = useApp();
  return useCallback(
    async (id: string, title: string, payload?: Record<string, unknown>) => {
      await api(`/api/actions/${id}`, { json: { decision: "approve", ...(payload ? { payload } : {}) } });
      toast({ text: title.startsWith("Email to") ? `Sending: ${title.replace(/^Email to /, "")}` : `Approved: ${title}`, undo: async () => { await api(`/api/actions/${id}/undo`, { method: "POST" }); refreshOffice(); refreshMe(); } });
      refreshOffice();
      refreshMe();
      return true;
    },
    [toast, refreshOffice, refreshMe],
  );
}
