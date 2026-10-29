// DeepSeek is the only model provider. It speaks the OpenAI chat API, with tool calls and prompt caching.
// Flash does almost everything; Pro is kept for the big jobs (research write-ups, hard drafts).

export type Tier = "flash" | "pro";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Usage {
  hit: number; // cached input tokens
  miss: number; // uncached input tokens
  out: number;
}

export interface Reply {
  content: string;
  toolCalls: ToolCall[];
  usage: Usage;
  model: string;
}

export const model = (tier: Tier) =>
  tier === "pro" ? process.env.DEEPSEEK_MODEL_PRO || "deepseek-v4-pro" : process.env.DEEPSEEK_MODEL_FLASH || "deepseek-flash";

// US$ per million tokens at peak (weekdays 01:00-04:00 and 06:00-10:00 UTC); everything else is half price.
// Same figures as yAI (lib/handlers.js); override with DEEPSEEK_PRICE_<TIER>_<IN|CACHED|OUT> if DeepSeek changes them.
const PEAK: Record<Tier, { in: number; cached: number; out: number }> = {
  flash: { in: 0.3, cached: 0.006, out: 1.2 },
  pro: { in: 1.32, cached: 0.044, out: 3.96 },
};

export function isPeak(at = new Date()) {
  const h = at.getUTCHours(), day = at.getUTCDay();
  return day >= 1 && day <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
}

export function price(tier: Tier, at = new Date()) {
  const env = (k: string, d: number) => Number(process.env[`DEEPSEEK_PRICE_${tier.toUpperCase()}_${k}`]) || d;
  const p = PEAK[tier], k = isPeak(at) ? 1 : 0.5;
  return { in: env("IN", p.in) * k, cached: env("CACHED", p.cached) * k, out: env("OUT", p.out) * k };
}

export function cost(tier: Tier, u: Usage, at = new Date()) {
  const p = price(tier, at);
  return (u.miss * p.in + u.hit * p.cached + u.out * p.out) / 1e6;
}

export const addUsage = (a: Usage, b: Usage): Usage => ({ hit: a.hit + b.hit, miss: a.miss + b.miss, out: a.out + b.out });
export const noUsage = (): Usage => ({ hit: 0, miss: 0, out: 0 });

function readUsage(u: Record<string, number> | undefined): Usage {
  if (!u) return noUsage();
  const hit = u.prompt_cache_hit_tokens ?? 0;
  return { hit, miss: u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens ?? 0) - hit), out: u.completion_tokens ?? 0 };
}

// One call, streamed. Text arrives through onText as it's written; tool calls are put back together from their
// pieces. Retries rate limits and server errors a few times before giving up.
export async function chat(
  tier: Tier,
  messages: ChatMessage[],
  opts: { tools?: ToolSchema[]; onText?: (delta: string) => void; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<Reply> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const body: Record<string, unknown> = {
    model: model(tier),
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: opts.maxTokens ?? 8000,
  };
  if (opts.tools?.length) body.tools = opts.tools;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: opts.signal ?? AbortSignal.timeout(240_000),
    });
    if (res.ok && res.body) return readStream(res.body, body.model as string, opts.onText);
    const text = await res.text().catch(() => "");
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      continue;
    }
    let msg = text;
    try { msg = JSON.parse(text).error?.message ?? text; } catch {}
    throw new Error(`DeepSeek ${res.status}: ${String(msg).replace(/\s+/g, " ").slice(0, 300)}`);
  }
}

export async function readStream(stream: ReadableStream<Uint8Array>, modelId: string, onText?: (d: string) => void): Promise<Reply> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buf = "", content = "", usage = noUsage();
  const calls: ToolCall[] = [];
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const chunk = JSON.parse(data);
    if (chunk.usage) usage = readUsage(chunk.usage);
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.content) {
      content += delta.content;
      onText?.(delta.content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const i = tc.index ?? calls.length;
      calls[i] ??= { id: "", type: "function", function: { name: "", arguments: "" } };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].function.name += tc.function.name;
      if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      handle(buf.slice(0, nl).trim());
      buf = buf.slice(nl + 1);
    }
  }
  handle(buf.trim());
  return { content, toolCalls: calls.filter(Boolean), usage, model: modelId };
}
