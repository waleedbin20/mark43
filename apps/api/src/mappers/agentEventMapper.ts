import { Response } from "express";
import { writeSSE } from "../utils/sse";

/**
 * Shape of a single LangGraph stream chunk: one key (the node name) mapping to
 * that node's partial state update.
 */
type GraphStreamChunk = Record<string, GraphNodeOutput>;

interface GraphNodeOutput {
  citations?: unknown[];
  toolLogs?: unknown[];
  stepLogs?: unknown[];
  finalAnswer?: string;
}

const SYNTHESISER_NODE = "intelligenceSynthesiser";

/**
 * Translates one graph stream chunk into the sequence of SSE events the frontend
 * consumes. Keeping this mapping isolated keeps the route handler thin and the
 * wire protocol in one place.
 */
export function emitNodeEvents(res: Response, chunk: GraphStreamChunk): void {
  const nodeName = Object.keys(chunk)[0];
  const output = chunk[nodeName];
  const timestamp = new Date().toISOString();

  writeSSE(res, "node_start", { node: nodeName, timestamp });

  for (const citation of output?.citations ?? []) {
    writeSSE(res, "citation", { citation });
  }

  for (const toolLog of output?.toolLogs ?? []) {
    writeSSE(res, "tool_end", { toolCall: toolLog });
  }

  for (const step of output?.stepLogs ?? []) {
    writeSSE(res, "log", step);
  }

  if (nodeName === SYNTHESISER_NODE && output?.finalAnswer) {
    writeSSE(res, "token", { token: output.finalAnswer });
  }

  writeSSE(res, "node_end", { node: nodeName, timestamp: new Date().toISOString() });
}
