import { Router, Request, Response, type IRouter } from "express";
import { getOrBuildGraph } from "@mark43/agent";
import { AgentQueryRequestSchema } from "@mark43/shared";
import { writeSSE, initSSEHeaders } from "../utils/sse";
import { emitNodeEvents } from "../mappers/agentEventMapper";
import { agentRateLimiter } from "../middleware/rateLimiter";

export const agentRouter: IRouter = Router();

// Singleton graph: MemorySaver persists across requests with the same sessionId.
const graph = getOrBuildGraph();

/**
 * POST /api/agent/stream
 * Streams the agent run over SSE. sessionId is used as the LangGraph thread_id so
 * the MemorySaver checkpointer restores conversation state across turns.
 */
agentRouter.post("/stream", agentRateLimiter, async (req: Request, res: Response) => {
  const parsed = AgentQueryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.format() });
    return;
  }

  const { query, sessionId, enableHybridSearch } = parsed.data;
  const startTime = Date.now();

  initSSEHeaders(res);

  try {
    const stream = await graph.stream(
      { query, enableHybridSearch, iterationCount: 0 },
      {
        configurable: { thread_id: sessionId },
        streamMode: "updates",
      }
    );

    for await (const chunk of stream) {
      emitNodeEvents(res, chunk as Record<string, any>);
    }

    writeSSE(res, "done", { totalDurationMs: Date.now() - startTime });
  } catch (error: any) {
    console.error("Agent execution error:", error);
    writeSSE(res, "error", { error: error?.message ?? "Unexpected agent error" });
  } finally {
    res.end();
  }
});

