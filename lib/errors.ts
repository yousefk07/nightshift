import { createClient } from "@supabase/supabase-js";

// Server errors into error_log (migration 0004), for the admin view and the daily summary email. Never throws and
// never slows a reply down for long: a failure to record an error is only logged.

let db: ReturnType<typeof createClient> | null = null;
const client = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // tests and local tools: console only
  return (db ??= createClient(url, key, { auth: { persistSession: false } }));
};

export async function recordError(source: string, e: unknown, extra: { workspace_id?: string | null; [k: string]: unknown } = {}) {
  const err = e as Error;
  const { workspace_id, ...detail } = extra;
  console.error(`[${source}]`, err);
  const c = client();
  if (!c) return;
  try {
    await c.from("error_log").insert({
      source: source.slice(0, 120),
      message: String(err?.message ?? e).slice(0, 500),
      workspace_id: workspace_id ?? null,
      detail: { ...detail, stack: String(err?.stack ?? "").split("\n").slice(0, 8).join("\n") },
    } as never);
  } catch (x) {
    console.error("recordError failed", x);
  }
}
