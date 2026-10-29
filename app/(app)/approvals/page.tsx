"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp, useApprove } from "@/components/AppShell";
import { BotTile, cardDetail, Review, useCanApprove, useDesks, type Action } from "@/components/office/cards";
import { Button } from "@/components/ui";
import { api, useApi } from "@/lib/client";

// M2 Approvals: what's waiting, grouped by bot, with M3's review pager behind Review.
interface Desk { brief: { headline: string; content: string; status: string } | null; minutes: number; groups: { bot: string; key: string | null; items: Action[] }[] }

export default function ApprovalsPage() {
  const { me, refreshOffice, toast } = useApp();
  const approve = useApprove();
  const can = useCanApprove();
  const { byId } = useDesks();
  const d = useApi<Desk>("/api/desk", { poll: 20_000 });
  const [review, setReview] = useState<number | null>(null);
  const items = d.data?.groups.flatMap((g) => g.items) ?? [];
  const first = (me.user.full_name || "").split(" ")[0];
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: me.workspace.timezone, hour: "numeric", hourCycle: "h23" }));
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Cards from the same bot, shown as one ("3 email replies"), except money which always stands alone.
  const byBot = new Map<string, Action[]>();
  for (const a of items) {
    const key = a.risk === "money" || a.group_key ? a.id : `${a.bot_id}:${a.tool}`;
    byBot.set(key, [...(byBot.get(key) ?? []), a]);
  }

  const approveGroup = async (group: Action[]) => {
    if (group.length === 1) return approve(group[0].id, group[0].title).then(() => d.refresh());
    const { results } = await api<{ results: { id: string; error?: string }[] }>("/api/actions/batch", { json: { decision: "approve", ids: group.map((a) => a.id) } });
    const ok = results.filter((r) => !r.error).map((r) => r.id);
    toast({ text: `Approved ${ok.length}.`, undo: async () => { for (const id of ok) await api(`/api/actions/${id}/undo`, { method: "POST" }); d.refresh(); } });
    refreshOffice();
    d.refresh();
  };

  return (
    <div style={{ flex: 1, background: "#f8f2e9", color: "#2b2320", padding: "22px 16px 28px", display: "flex", flexDirection: "column", gap: 16, minHeight: "calc(100vh - 59px)", maxWidth: 640, width: "100%", margin: "0 auto" }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{hello}{first ? `, ${first}` : ""}</div>
        <div style={{ fontSize: 14.5, color: "#776a5e" }}>{items.length ? `${items.length} ${items.length === 1 ? "thing is" : "things are"} waiting. About ${d.data?.minutes ?? 1} minute${d.data?.minutes === 1 ? "" : "s"}.` : "Nothing is waiting."}</div>
      </div>

      {d.data?.brief && (
        <div style={{ background: "#2d2330", color: "#f1e6d6", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="pixel" style={{ fontSize: 15 }}>Morning brief</span>
          <span style={{ fontSize: 14.5, lineHeight: 1.5 }}>{d.data.brief.headline || d.data.brief.content.split("\n")[0]}</span>
          <Link href="/desk" style={{ color: "#f0c27a", fontSize: 14, fontWeight: 600 }}>Read the brief →</Link>
        </div>
      )}

      {[...byBot.values()].map((group) => {
        const a = group[0], bot = byId(a.bot_id);
        const title = group.length > 1 ? `${group.length} ${a.tool === "send_email" ? "email replies" : "drafts"}` : a.title;
        const detail = group.length > 1 ? `${bot?.name ?? "A bot"} · ${group.map((x) => x.counterparty || x.payload.to || "").filter(Boolean).map((s: string) => s.split(/[ @<]/)[0]).join(", ")}` : cardDetail(a, bot?.name ?? "A bot");
        return (
          <div key={a.id} style={{ background: "#fffaf3", border: "1px solid #e4d9ca", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <BotTile desk={bot} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 13, color: "#776a5e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button style={{ flex: 1 }} disabled={!group.every((x) => can(x))} onClick={() => approveGroup(group)}>{group.length > 1 ? "Approve all" : "Approve"}</Button>
              <Button kind="outline" style={{ flex: 1 }} onClick={() => setReview(items.indexOf(a))}>Review</Button>
            </div>
          </div>
        );
      })}

      {d.data && !items.length && (
        // X2 Desk clear
        <div style={{ textAlign: "center", padding: "40px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="pixel" style={{ fontSize: 22 }}>All clear</span>
          <span style={{ fontSize: 14.5, color: "#776a5e" }}>You&apos;ve approved everything. The team will leave anything new here tonight.</span>
          <Link href="/desk" style={{ fontSize: 14 }}>Re-read this morning&apos;s brief</Link>
        </div>
      )}

      {review != null && items[review] && (
        <Review
          a={items[review]}
          pager={{ n: review + 1, of: items.length, prev: review > 0 ? () => setReview(review - 1) : undefined, next: review < items.length - 1 ? () => setReview(review + 1) : undefined }}
          onClose={() => setReview(null)}
          onDone={() => { d.refresh(); refreshOffice(); setReview(items.length > 1 ? Math.min(review, items.length - 2) : null); }}
        />
      )}
    </div>
  );
}
