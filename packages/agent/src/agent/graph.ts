import { StateGraph, START, END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { AgentStateAnnotation, AgentState } from "./state";
import {
  intelligencePlannerNode,
  toolDispatcherNode,
  intelligenceSynthesiserNode,
} from "./nodes";
import { getMemorySaver } from "./memory";

/**
 * Builds and compiles the Mark43 Intelligence Agent graph.
 *
 * Topology (ReAct loop):
 *   START → intelligencePlanner
 *   intelligencePlanner → toolDispatcher   (when LLM produced tool calls)
 *   intelligencePlanner → intelligenceSynthesiser  (when LLM has enough context)
 *   toolDispatcher → intelligencePlanner   (results fed back for next reasoning step)
 *   intelligenceSynthesiser → END
 *
 * Memory: MemorySaver checkpointer — state is persisted by thread_id (= sessionId from the API).
 * Across HTTP calls with the same sessionId the agent remembers prior turns.
 */

function shouldCallTools(state: AgentState): "toolDispatcher" | "intelligenceSynthesiser" {
  const lastMsg = state.messages[state.messages.length - 1];
  if (
    lastMsg instanceof AIMessage &&
    lastMsg.tool_calls &&
    lastMsg.tool_calls.length > 0
  ) {
    return "toolDispatcher";
  }
  return "intelligenceSynthesiser";
}

let _compiledGraph: ReturnType<typeof buildGraph> | null = null;

export function buildGraph() {
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode("intelligencePlanner", intelligencePlannerNode)
    .addNode("toolDispatcher", toolDispatcherNode)
    .addNode("intelligenceSynthesiser", (state: AgentState) =>
      intelligenceSynthesiserNode(state)
    )
    .addEdge(START, "intelligencePlanner")
    .addConditionalEdges("intelligencePlanner", shouldCallTools)
    .addEdge("toolDispatcher", "intelligencePlanner") // loop back for next reasoning step
    .addEdge("intelligenceSynthesiser", END);

  return workflow.compile({ checkpointer: getMemorySaver() });
}

/**
 * Singleton graph — shared across requests so the MemorySaver state persists.
 * Never call buildGraph() per-request; use this instead.
 */
export function getOrBuildGraph(): ReturnType<typeof buildGraph> {
  if (!_compiledGraph) {
    _compiledGraph = buildGraph();
  }
  return _compiledGraph;
}
