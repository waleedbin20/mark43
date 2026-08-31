import { Router, Request, Response, type IRouter } from "express";
import { getOrBuildGraph, getGraphStore } from "@mark43/agent";

export const introspectRouter: IRouter = Router();

// Same singleton graph the stream route uses, so memory reads reflect live state.
const graph = getOrBuildGraph();

/**
 * GET /api/agent/graph
 * Returns the LangGraph node/edge topology plus a Mermaid diagram string.
 */
introspectRouter.get("/graph", (_req: Request, res: Response) => {
  try {
    const drawable: any = graph.getGraph();
    res.json({
      nodes: Object.keys(drawable.nodes ?? {}),
      edges: (drawable.edges ?? []).map((e: any) => ({
        source: e.source,
        target: e.target,
        conditional: Boolean(e.conditional),
      })),
      mermaid: typeof drawable.drawMermaid === "function" ? drawable.drawMermaid() : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to read graph" });
  }
});

/**
 * GET /api/agent/graph-store
 * Returns the Graph RAG entity store: stats, entities, and edges.
 */
introspectRouter.get("/graph-store", (_req: Request, res: Response) => {
  try {
    const store = getGraphStore();
    res.json({
      stats: store.getStats(),
      entities: store.getEntities(),
      edges: store.getEdges(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to read graph store" });
  }
});

/**
 * GET /api/agent/memory/:sessionId
 * Returns the LangGraph checkpoint (session memory) for a thread_id: the message
 * history and the running conversation summary.
 */
introspectRouter.get("/memory/:sessionId", async (req: Request, res: Response) => {
  try {
    const snapshot: any = await graph.getState({
      configurable: { thread_id: req.params.sessionId },
    });

    const values = snapshot?.values ?? {};
    const messages = (values.messages ?? []).map((m: any) => ({
      type: m?.constructor?.name ?? "Message",
      content:
        typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? ""),
      toolCalls: m?.tool_calls?.map((tc: any) => tc.name) ?? undefined,
    }));

    res.json({
      sessionId: req.params.sessionId,
      exists: messages.length > 0 || Boolean(values.conversationSummary),
      messageCount: messages.length,
      conversationSummary: values.conversationSummary ?? "",
      citations: values.citations ?? [],
      messages,
      nextNodes: snapshot?.next ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to read memory" });
  }
});
