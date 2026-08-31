import { Response } from "express";
import { SSEEventType } from "@mark43/shared";

/**
 * Small helper around the Server-Sent Events wire format. Writes one framed
 * `event:`/`data:` pair and flushes immediately so the client streams in real time.
 */
export function writeSSE(res: Response, event: SSEEventType, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  const maybeFlush = (res as Response & { flush?: () => void }).flush;
  if (typeof maybeFlush === "function") maybeFlush.call(res);
}

/** Sets the standard SSE response headers. Call once before streaming. */
export function initSSEHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}
