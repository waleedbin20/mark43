import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { Citation, ToolCallLog, StepLog } from "@mark43/shared";

export const AgentStateAnnotation = Annotation.Root({
  // Full message history (trimmed by memorySummariser when length > threshold)
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),

  // Current user query
  query: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // Compressed summary of older messages — replaces trimmed turns to save context window
  conversationSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // Safety counter: prevents infinite ReAct loops (reset per turn via API, not across sessions)
  iterationCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  // Whether Hybrid Search (Dense + Sparse with RRF) is active
  enableHybridSearch: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => true,
  }),

  // All citations accumulated across tool calls in this turn
  citations: Annotation<Citation[]>({
    reducer: (curr, update) => {
      const seen = new Set(curr.map((c) => c.id));
      return [...curr, ...update.filter((c) => !seen.has(c.id))];
    },
    default: () => [],
  }),

  // Tool execution logs for UI transparency
  toolLogs: Annotation<ToolCallLog[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),

  // Step/node trace logs for UI transparency
  stepLogs: Annotation<StepLog[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),

  // Final structured intelligence briefing produced by synthesiser
  finalAnswer: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // Error details if any node fails
  error: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;
