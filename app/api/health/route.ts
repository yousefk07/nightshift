import { connection } from "next/server";
import { admin } from "@/lib/store-supabase";

// Is Nightshift up, and how far is the server from its database? Timings only, no data: the region this function
// runs in, three database round trips and one call to the sign-in service. Handy for uptime checks too.
export async function GET() {
  await connection();
  const db = admin();
  const time = async (fn: () => PromiseLike<unknown>) => { const t = performance.now(); await fn(); return Math.round(performance.now() - t); };
  const query = () => db.from("workspaces").select("id", { head: true, count: "exact" }).limit(1);
  const dbMs = [await time(query), await time(query), await time(query)];
  const authMs = await time(() => fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } }));
  return Response.json({ ok: true, region: process.env.VERCEL_REGION ?? "local", db_ms: dbMs, auth_ms: authMs }, { headers: { "Cache-Control": "no-store" } });
}
