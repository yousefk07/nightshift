// Local showcase mode, for screenshots and demos: on the dev server only, a page opened with ?showcase (remembered
// for the tab) gets the made-up Maple Street Dental from showcase-data.json instead of the API. Production builds
// never take this path (see lib/client.ts). Regenerate the data with: npx tsx scripts/showcase.mts
import raw from "./showcase-data.json";

const data = raw as unknown as Record<string, any>; // plain made-up data; its exact shape is the API's

export const showcaseOn = () => {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return false;
  if (new URLSearchParams(location.search).has("showcase")) sessionStorage.setItem("ns-showcase", "1");
  return sessionStorage.getItem("ns-showcase") === "1";
};

const pending = () => data.desk.groups.flatMap((g: { items: unknown[] }) => g.items);

export function showcaseAnswer(path: string, method: string): unknown {
  const [p, query = ""] = path.split("?");
  const q = new URLSearchParams(query);
  if (method !== "GET") return { ok: true, status: "sending", undo_until: new Date(Date.now() + 8000).toISOString(), results: [] };
  if (p === "/api/me") return data.me;
  if (p === "/api/office") return data.office;
  if (p === "/api/desk") return data.desk;
  if (p === "/api/room") return q.get("after") ? { ...data.room, messages: [] } : data.room;
  if (p === "/api/actions") return { actions: pending() };
  if (p === "/api/runs") return { runs: [{ id: "r1" }] };
  if (p === "/api/connections") return data.connections;
  if (p === "/api/billing") return data.billing;
  if (p === "/api/catalog") return data.catalog;
  if (p === "/api/do-not-contact") return { entries: [], guardrails: { pause_on_dispute: true, weekly_cap: true } };
  if (p === "/api/threads") return (data.threads as Record<string, unknown>)[q.get("bot") ?? ""] ?? { threads: [] };
  if (p.startsWith("/api/threads/")) return q.get("after") ? { ...data.thread, messages: [] } : data.thread;
  if (p.startsWith("/api/bots/")) return (data.bots as Record<string, unknown>)[decodeURIComponent(p.slice("/api/bots/".length))] ?? {};
  return {};
}
