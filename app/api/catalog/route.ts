import { route } from "@/lib/auth";
import { CATEGORIES, forIndustry, INDUSTRIES, TEMPLATES, type Industry } from "@/lib/bots";
import { suggestedBots } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

// The hiring catalog. ?industry= narrows it (default: the workspace's); ?all=1 lists every bot.
// Each entry says whether it's hired and which connections it still needs.
export const GET = route(async (req, me) => {
  const p = new URL(req.url).searchParams;
  const industry = (p.get("industry") ?? me.ws.industry) as Industry;
  const store = supabaseStore();
  const [team, conns] = await Promise.all([store.bots(me.ws.id), store.connections(me.ws.id)]);
  const have = new Set(conns.filter((c) => c.status === "ok").flatMap((c) => c.kinds as string[]));
  if (process.env.TAVILY_API_KEY) have.add("web");
  const list = p.get("all") === "1" ? TEMPLATES : forIndustry(industry in INDUSTRIES ? industry : "general");
  const suggested = new Set(suggestedBots(industry, me.ws.pain_points).map((t) => t.id));
  return Response.json({
    industries: INDUSTRIES,
    categories: CATEGORIES,
    industry,
    bots: list.map((t) => ({
      id: t.id, name: t.name, role: t.role, title: t.title, hue: t.hue, prop: t.prop, category: t.category, industries: t.industries,
      schedule: t.schedule, needs: t.needs, missing: t.needs.filter((n) => !have.has(n)),
      hired: team.some((b) => b.kind === t.id), suggested: suggested.has(t.id),
    })),
  });
});
