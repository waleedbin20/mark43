import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { StepLog } from "@mark43/shared";
import { AgentState } from "../state";
import { getChatLLM } from "../../core/llm";
import { getIntelligenceTools } from "../../tools";
import { getConfig } from "../../core/config";
import { summariseConversationIfNeeded } from "../memory";
import { buildPlannerSystemPrompt } from "../../prompts";
import { sanitiseUserQuery } from "../../security";

/**
 * Planner node: runs one step of the ReAct loop. It reasons about the query,
 * optionally emits tool calls, and hands control back to the graph router.
 */
export async function intelligencePlannerNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const { AGENT_MAX_ITERATIONS } = getConfig();
  const stepId = `step-planner-${Date.now()}`;
  const startedAt = new Date().toISOString();

  if ((state.iterationCount ?? 0) >= AGENT_MAX_ITERATIONS) {
    return buildIterationLimitResult(state, stepId, startedAt, AGENT_MAX_ITERATIONS);
  }

  const { summary, trimmedMessages } = await summariseConversationIfNeeded(
    state.messages,
    state.query,
    state.conversationSummary
  );

  const sanitised = sanitiseUserQuery(state.query);

  const llmWithTools = getChatLLM(false).bindTools(getIntelligenceTools());
  const systemMessage = new SystemMessage(buildPlannerSystemPrompt(summary));

  const hasHumanMessage = trimmedMessages.some((m) => m instanceof HumanMessage);
  const contextMessages: BaseMessage[] = hasHumanMessage
    ? trimmedMessages
    : [...trimmedMessages, new HumanMessage(sanitised.query)];

  const response = await llmWithTools.invoke([systemMessage, ...contextMessages]);
  const toolCallNames = (response as AIMessage).tool_calls?.map((tc) => tc.name) ?? [];

  return {
    messages: [response],
    conversationSummary: summary,
    iterationCount: (state.iterationCount ?? 0) + 1,
    stepLogs: [
      {
        id: stepId,
        nodeName: "intelligencePlanner",
        status: "completed",
        timestamp: startedAt,
        details: buildPlannerLogDetails(toolCallNames, sanitised.injectionSuspected),
      },
    ],
  };
}

function buildPlannerLogDetails(
  toolCallNames: string[],
  injectionSuspected: boolean
): string {
  const guard = injectionSuspected ? " (query flagged for injection, treated as data)" : "";
  return toolCallNames.length > 0
    ? `Planned ${toolCallNames.length} tool call(s): ${toolCallNames.join(", ")}${guard}`
    : `No further tools needed, ready for synthesis${guard}`;
}

function buildIterationLimitResult(
  state: AgentState,
  stepId: string,
  startedAt: string,
  maxIterations: number
): Partial<AgentState> {
  const safetyMessage = new AIMessage(
    "Maximum tool-call iterations reached. Proceeding to synthesis with information gathered so far."
  );

  const log: StepLog = {
    id: stepId,
    nodeName: "intelligencePlanner",
    status: "completed",
    timestamp: startedAt,
    details: `Iteration limit (${maxIterations}) hit, forcing synthesis`,
  };

  return {
    messages: [safetyMessage],
    iterationCount: (state.iterationCount ?? 0) + 1,
    stepLogs: [log],
  };
}
