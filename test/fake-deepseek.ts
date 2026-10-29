import { vi } from "vitest";

// Stands in for DeepSeek's streaming API. Each queued turn is either text, or tool calls the model "decides" to make.
// Requests to anything else (Gmail, Stripe, Tavily ...) go to `others`, so a test can answer them too.
export type Turn = { text?: string; tools?: { name: string; args: Record<string, unknown> }[]; usage?: { hit?: number; miss?: number; out?: number } };

export function fakeDeepSeek(turns: Turn[], others: (url: string, init?: RequestInit) => unknown = () => { throw new Error("unexpected request"); }) {
  const requests: any[] = [];
  const queue = [...turns];
  process.env.DEEPSEEK_API_KEY = "test";
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!String(url).includes("api.deepseek.com")) {
      const body = await others(String(url), init);
      return new Response(JSON.stringify(body), { status: 200 });
    }
    requests.push(JSON.parse(String(init?.body)));
    const turn = queue.shift() ?? { text: "(no more turns)" };
    const chunks: unknown[] = [];
    if (turn.text) for (const piece of turn.text.match(/[\s\S]{1,12}/g) ?? []) chunks.push({ choices: [{ delta: { content: piece } }] });
    (turn.tools ?? []).forEach((t, i) => {
      const args = JSON.stringify(t.args);
      // split the call over two chunks, the way the real stream does
      chunks.push({ choices: [{ delta: { tool_calls: [{ index: i, id: `call_${i}`, type: "function", function: { name: t.name, arguments: args.slice(0, 5) } }] } }] });
      chunks.push({ choices: [{ delta: { tool_calls: [{ index: i, function: { arguments: args.slice(5) } }] } }] });
    });
    const u = turn.usage ?? {};
    chunks.push({ choices: [], usage: { prompt_tokens: (u.hit ?? 0) + (u.miss ?? 1000), prompt_cache_hit_tokens: u.hit ?? 0, prompt_cache_miss_tokens: u.miss ?? 1000, completion_tokens: u.out ?? 100 } });
    const sse = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(new Blob([sse]).stream(), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests, fetchMock, left: () => queue.length };
}
