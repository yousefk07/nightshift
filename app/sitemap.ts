import type { MetadataRoute } from "next";

const BASE = "https://www.nightshiftai.ca";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/pricing", "/trial", "/security", "/help", "/docs", "/legal/privacy", "/legal/terms", "/legal/dpa", "/legal/subprocessors", "/legal/cookies"];
  return pages.map((p) => ({ url: `${BASE}${p}`, changeFrequency: p === "" ? "weekly" : "monthly", priority: p === "" ? 1 : p === "/pricing" || p === "/trial" ? 0.8 : 0.5 }));
}
