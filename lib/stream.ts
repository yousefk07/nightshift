import type { EngineEvent } from "./engine/tool";

// Streams engine events to the browser or CLI as NDJSON (one JSON object per line), then a final "done" line.
export function ndjson(work: (send: (e: EngineEvent | Record<string, unknown>) => void, signal: AbortSignal) => Promise<Record<string, unknown>>, req: Request) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {} // the reader went away; the work still finishes and is saved
      };
      try {
        send({ type: "done", ...(await work(send, req.signal)) });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
