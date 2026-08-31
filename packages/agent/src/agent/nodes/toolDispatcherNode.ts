import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { Citation, ToolCallLog } from "@mark43/shared";
import { AgentState } from "../state";
import { getIntelligenceTools } from "../../tools";

const MAX_LOGGED_OUTPUT_LENGTH = 600;

interface ToolExecution {
  message: ToolMessage;
  log?: ToolCallLog;
  citations: Citation[];
}

/**
 * Tool dispatcher node: executes every tool call the planner emitted, collects
 * citations from JSON tool output, and records a log entry per call.
 */
export async function toolDispatcherNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage?.tool_calls ?? [];
  if (toolCalls.length === 0) return {};

  const toolMap = new Map(getIntelligenceTools().map((tool) => [tool.name, tool]));

  const toolMessages: ToolMessage[] = [];
  const toolLogs: ToolCallLog[] = [];
  const citations: Citation[] = [];

  for (const toolCall of toolCalls) {
    const tool = toolMap.get(toolCall.name);
    const execution = await runToolCall(tool, toolCall);

    toolMessages.push(execution.message);
    citations.push(...execution.citations);
    if (execution.log) toolLogs.push(execution.log);
  }

  return {
    messages: toolMessages,
    toolLogs,
    citations,
    stepLogs: [
      {
        id: `step-dispatch-${Date.now()}`,
        nodeName: "toolDispatcher",
        status: "completed",
        timestamp: new Date().toISOString(),
        details: `Executed: ${toolCalls
          .map((tc) => tc.name)
          .join(", ")}, ${citations.length} citation(s)`,
      },
    ],
  };
}

async function runToolCall(
  tool: ReturnType<typeof getIntelligenceTools>[number] | undefined,
  toolCall: NonNullable<AIMessage["tool_calls"]>[number]
): Promise<ToolExecution> {
  const toolCallId = toolCall.id ?? `tc-${Date.now()}`;

  if (!tool) {
    return {
      message: new ToolMessage({
        content: JSON.stringify({ error: `Tool "${toolCall.name}" not found` }),
        tool_call_id: toolCallId,
        name: toolCall.name,
      }),
      citations: [],
    };
  }

  const startedAt = new Date().toISOString();
  let outputRaw: string;
  let status: "success" | "error" = "success";

  try {
    outputRaw = await tool.invoke(toolCall.args);
  } catch (err: any) {
    outputRaw = JSON.stringify({ error: err?.message ?? "Tool execution failed" });
    status = "error";
  }

  return {
    message: new ToolMessage({
      content: outputRaw,
      tool_call_id: toolCallId,
      name: toolCall.name,
    }),
    citations: extractCitations(outputRaw),
    log: {
      id: `tool-${toolCallId}`,
      toolName: toolCall.name,
      input: toolCall.args,
      output: outputRaw.slice(0, MAX_LOGGED_OUTPUT_LENGTH),
      status,
      startedAt,
      completedAt: new Date().toISOString(),
    },
  };
}

/** Pulls a `citations` array out of a tool's JSON output, if present. */
function extractCitations(outputRaw: string): Citation[] {
  try {
    const parsed = JSON.parse(outputRaw);
    return Array.isArray(parsed?.citations) ? parsed.citations : [];
  } catch {
    return [];
  }
}
