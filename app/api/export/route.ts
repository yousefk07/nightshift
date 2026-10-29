import { requireOwner, route } from "@/lib/auth";
import { admin } from "@/lib/store-supabase";

export const maxDuration = 120;

// "Export your data": drafts, briefs, bot room history, documents, memory, contacts and settings as one JSON file.
// Secrets (connection tokens, API keys) are never included.
export const GET = route(async (_req, me) => {
  requireOwner(me);
  const db = admin(), ws = me.ws.id;
  const all = async (table: string, select = "*") => {
    const out: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(select).eq("workspace_id", ws).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  };
  const { stripe_customer_id: _c, stripe_subscription_id: _s, ...workspace } = me.ws;
  const data = {
    exported_at: new Date().toISOString(),
    workspace,
    bots: await all("bots"),
    connections: await all("connections", "provider, kinds, account, status, created_at"),
    threads: await all("threads"),
    messages: await all("messages"),
    approvals: await all("actions"),
    runs: await all("runs", "id, bot_id, trigger, status, input, summary, cost_usd, created_at, finished_at"),
    briefs: await all("briefs"),
    documents: await all("documents"),
    memories: await all("memories"),
    flags: await all("flags"),
    holds: await all("holds"),
    contacts: await all("contacts"),
    do_not_contact: await all("do_not_contact"),
    activity: await all("activity"),
  };
  const name = me.ws.name.replace(/[^\w-]+/g, "-").toLowerCase();
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="nightshift-${name}-${data.exported_at.slice(0, 10)}.json"` } });
});
