// fetch with a timeout and readable errors, shared by every connector.
export async function api<T = any>(url: string, init: RequestInit & { token?: string; json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body, signal: init.signal ?? AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.error?.message ?? j.error_description ?? j.errors ?? j.message ?? text;
      if (typeof msg !== "string") msg = JSON.stringify(msg);
    } catch {}
    throw new Error(`${new URL(url).host} ${res.status}: ${String(msg).slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const form = (data: Record<string, string>) => ({
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(data).toString(),
});
