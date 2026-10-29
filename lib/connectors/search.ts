import { api } from "./http";

// Web search for Research (and later Watchdog), through Tavily: built for agents, returns clean page text.

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  published?: string;
}

const key = () => {
  const k = process.env.TAVILY_API_KEY;
  if (!k) throw new Error("Web search isn't set up (TAVILY_API_KEY).");
  return k;
};

export async function webSearch(query: string, opts: { max?: number; recent?: boolean } = {}): Promise<SearchHit[]> {
  const r = await api<{ results: { title: string; url: string; content: string; published_date?: string }[] }>("https://api.tavily.com/search", {
    method: "POST",
    token: key(),
    json: { query, max_results: Math.min(opts.max ?? 6, 10), search_depth: "basic", topic: opts.recent ? "news" : "general" },
  });
  return r.results.map((x) => ({ title: x.title, url: x.url, content: x.content, published: x.published_date }));
}

export async function readPage(url: string): Promise<{ url: string; text: string }> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Only http and https pages can be read.");
  const r = await api<{ results: { url: string; raw_content: string }[]; failed_results?: unknown[] }>("https://api.tavily.com/extract", {
    method: "POST",
    token: key(),
    json: { urls: [url] },
  });
  const page = r.results[0];
  if (!page) throw new Error("That page couldn't be read.");
  return { url: page.url, text: page.raw_content.slice(0, 15_000) };
}
