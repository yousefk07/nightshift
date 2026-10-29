"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useRef, useState } from "react";

// The browser side of the API: fetch helpers, a polling/live data hook, and the live stream.

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.json !== undefined || opts.body ? "POST" : "GET"),
    headers: { ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}), ...opts.headers },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
  return data as T;
}

// Data for a screen: loads once, refreshes every `poll` ms (optional) and whenever refresh() is called.
export function useApi<T = any>(path: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);
  const seq = useRef(0); // only the newest request may land: an older answer arriving late is dropped
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    try {
      const d = await api<T>(path);
      if (alive.current && n === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current && n === seq.current) setError(e as ApiError);
    } finally {
      if (alive.current && n === seq.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    queueMicrotask(load);
    // polling pauses while the tab is hidden and catches up the moment it's back
    const t = opts.poll ? setInterval(() => { if (!document.hidden) load(); }, opts.poll) : null;
    const back = () => { if (opts.poll && !document.hidden) load(); };
    document.addEventListener("visibilitychange", back);
    return () => { alive.current = false; if (t) clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, [load, opts.poll]);
  return { data, error, loading, refresh: load, setData };
}

export type StreamEvent = { type: "message" | "action" | "bot" | "notification"; data: any };

// Live updates from /api/stream (messages, approval cards, bot status, notifications). Reconnects on its own.
export function useLive(onEvent: (e: StreamEvent) => void) {
  const handler = useRef(onEvent);
  useEffect(() => { handler.current = onEvent; }, [onEvent]);
  useEffect(() => {
    const es = new EventSource("/api/stream");
    const on = (type: StreamEvent["type"]) => (e: MessageEvent) => {
      try { handler.current({ type, data: JSON.parse(e.data) }); } catch {}
    };
    for (const t of ["message", "action", "bot", "notification"] as const) es.addEventListener(t, on(t));
    return () => es.close();
  }, []);
}

// Streams a chat reply or a run (NDJSON): text deltas, tool use, approval cards, then "done".
export async function streamPost(path: string, json: unknown, onEvent: (e: any) => void) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch {}
    throw new ApiError(res.status, msg);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", done: any = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const e = JSON.parse(line);
      if (e.type === "done") done = e;
      onEvent(e);
    }
  }
  return done;
}

export const supabase = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// Formatting the screens share.
export const money = (cents: number | null | undefined, currency = "USD") =>
  cents == null ? "" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: currency || "USD" });
export const clock = (iso: string | Date, timeZone?: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
