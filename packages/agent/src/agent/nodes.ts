/**
 * Intelligence Agent Nodes â€” ReAct orchestration via LangGraph.
 *
 * Node names:
 *  intelligencePlannerNode     â€” LLM reasons about the query and calls tools (ReAct loop)
 *  toolDispatcherNode          â€” Executes tool calls made by the planner
 *  intelligenceSynthesiserNode â€” Produces the final structured intelligence briefing
 *
 * Routing is entirely LLM-driven. The planner receives tool schemas and decides
 * whether to call them; keyword-based routing is not used anywhere.
 */

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { AgentState } from "./state";
import { getChatLLM } from "../core/llm";
import { getIntelligenceTools } from "../tools";
import { getConfig } from "../core/config";
import { summariseConversationIfNeeded } from "./memory";
import { Citation, ToolCallLog, StepLog } from "@mark43/shared";

// ============================================================
// System prompt
// ============================================================

function buildSystemPrompt(conversationSummary: string): string {
  const summarySection = conversationSummary
    ? `\n\nPrevious conversation summary (context for follow-up questions):\n${conversationSummary}`
    : "";

  return `You are the Mark43 Public Safety Intelligence Analyst â€” an expert system that synthesises publicly available information about law enforcement, policing technology, crime analytics, and public safety policy across the UK and United States.

Your role is to autonomously gather intelligence by calling the appropriate tools, then synthesise findings into structured briefings.

Available tools:
- search_public_safety_knowledge: Graph RAG search over ingested UK policing research and Gov.uk policy documents
- fetch_uk_crime_data: Live street-level crime, outcomes, and categories from data.police.uk
- fetch_uk_force_info: UK police force directory — list all 43 forces, force profiles, senior officers
- fetch_uk_neighbourhood_data: UK neighbourhood policing — boundaries, team, events, priorities, locate by coordinates
- fetch_uk_stop_search: UK stop-and-search records — by area, at location, no location, or by force
- fetch_uk_policy_and_research: Gov.uk policy documents + College of Policing RSS news
- fetch_us_crime_statistics: FBI Crime Data Explorer statistics (UCR/NIBRS)

Decision rules:
- ALWAYS call at least one tool before answering a substantive question
- For UK crime questions with a location, prefer fetch_uk_crime_data
- For UK force or officer structure questions, use fetch_uk_force_info
- For UK neighbourhood priorities or team questions, use fetch_uk_neighbourhood_data
- For UK stop-and-search patterns, use fetch_uk_stop_search
- For UK policy, legislation, or research questions, prefer fetch_uk_policy_and_research and search_public_safety_knowledge
- For US-focused questions, prefer fetch_us_crime_statistics
- For cross-jurisdictional questions, call tools for both UK and US
- When you have sufficient context, stop calling tools and answer WITHOUT tool calls
- Never fabricate statistics or policy details${summarySection}`;
}

// ============================================================
// Node: intelligencePlannerNode
// ============================================================

export async function intelligencePlannerNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const { AGENT_MAX_ITERATIONS } = getConfig();
  const stepId = `step-planner-${Date.now()}`;
  const startedAt = new Date().toISOString();

  // Safety: prevent infinite ReAct loops
  if ((state.iterationCount ?? 0) >= AGENT_MAX_ITERATIONS) {
    const safetyMsg = new AIMessage(
      "Maximum tool-call iterations reached. Proceeding to synthesis with information gathered so far."
    );
    return {
      messages: [safetyMsg],
      iterationCount: (state.iterationCount ?? 0) + 1,
      stepLogs: [{ id: stepId, nodeName: "intelligencePlanner", status: "completed", timestamp: startedAt, details: `Iteration limit (${AGENT_MAX_ITERATIONS}) hit â€” forcing synthesis` }],
    };
  }

  const { summary, trimmedMessages } = await summariseConversationIfNeeded(
    state.messages,
    state.query,
    state.conversationSummary
  );

  const llm = getChatLLM(false);
  const tools = getIntelligenceTools();
  const llmWithTools = llm.bindTools(tools);

  const systemMessage = new SystemMessage(buildSystemPrompt(summary));

  const hasHumanMessage = trimmedMessages.some((m) => m instanceof HumanMessage);
  const contextMessages: BaseMessage[] = hasHumanMessage
    ? trimmedMessages
    : [...trimmedMessages, new HumanMessage(state.query)];

  const response = await llmWithTools.invoke([systemMessage, ...contextMessages]);

  const toolCallNames = (response as AIMessage).tool_calls?.map((tc) => tc.name) ?? [];

  return {
    messages: [response],
    conversationSummary: summary,
    iterationCount: (state.iterationCount ?? 0) + 1,
    stepLogs: [{
      id: stepId,
      nodeName: "intelligencePlanner",
      status: "completed",
      timestamp: startedAt,
      details: toolCallNames.length > 0
        ? `Planned ${toolCallNames.length} tool call(s): ${toolCallNames.join(", ")}`
        : "No further tools needed â€” ready for synthesis",
    }],
  };
}

// ============================================================
// Node: toolDispatcherNode
// ============================================================

export async function toolDispatcherNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMsg?.tool_calls ?? [];
  if (toolCalls.length === 0) return {};

  const tools = getIntelligenceTools();
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const toolMessages: ToolMessage[] = [];
  const toolLogs: ToolCallLog[] = [];
  const newCitations: Citation[] = [];

  for (const toolCall of toolCalls) {
    const tool = toolMap.get(toolCall.name);
    const startedAt = new Date().toISOString();

    if (!tool) {
      toolMessages.push(new ToolMessage({
        content: JSON.stringify({ error: `Tool "${toolCall.name}" not found` }),
        tool_call_id: toolCall.id ?? `missing-${Date.now()}`,
        name: toolCall.name,
      }));
      continue;
    }

    let outputRaw: string;
    let status: "success" | "error" = "success";

    try {
      outputRaw = await tool.invoke(toolCall.args);
    } catch (err: any) {
      outputRaw = JSON.stringify({ error: err.message });
      status = "error";
    }

    try {
      const parsed = JSON.parse(outputRaw);
      if (Array.isArray(parsed?.citations)) newCitations.push(...parsed.citations);
    } catch { /* non-JSON output */ }

    toolMessages.push(new ToolMessage({
      content: outputRaw,
      tool_call_id: toolCall.id ?? `tc-${Date.now()}`,
      name: toolCall.name,
    }));

    toolLogs.push({
      id: `tool-${toolCall.id ?? Date.now()}`,
      toolName: toolCall.name,
      input: toolCall.args,
      output: outputRaw.slice(0, 600),
      status,
      startedAt,
      completedAt: new Date().toISOString(),
    });
  }

  return {
    messages: toolMessages,
    toolLogs,
    citations: newCitations,
    stepLogs: [{
      id: `step-dispatch-${Date.now()}`,
      nodeName: "toolDispatcher",
      status: "completed",
      timestamp: new Date().toISOString(),
      details: `Executed: ${toolCalls.map((tc) => tc.name).join(", ")} â€” ${newCitations.length} citation(s)`,
    }],
  };
}

// ============================================================
// Node: intelligenceSynthesiserNode
// ============================================================

export async function intelligenceSynthesiserNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const llm = getChatLLM(true);
  const stepId = `step-synth-${Date.now()}`;

  const citationsContext = state.citations.length > 0
    ? state.citations.slice(0, 12).map((c, i) =>
      `[${i + 1}] ${c.title}\n    Source: ${c.source}\n    ${c.snippet?.slice(0, 300) ?? ""}`
    ).join("\n\n")
    : "No external citations retrieved.";

  const systemPrompt = `You are the Mark43 Public Safety Intelligence Analyst.

Synthesise the tool results and conversation into a structured briefing.

Format your response as:
## Executive Summary
(2â€“3 sentence overview)

## Key Findings
(Bullet points, organised by jurisdiction where relevant: ðŸ‡¬ðŸ‡§ UK / ðŸ‡ºðŸ‡¸ US)

## Cross-Jurisdictional Analysis
(Compare UK and US if both present; note gaps if only one jurisdiction covered)

## Sources & Citations
(Number each source as [1], [2], etc.)

## Operational Recommendations
(1â€“3 actionable points for a public safety professional)

---
Retrieved source material:
${citationsContext}
${state.conversationSummary ? `\nSession context:\n${state.conversationSummary}` : ""}

Rules: Only state facts from tool results. Mark uncertain items with "reportedly" or "according to [source]".`;

  let finalAnswer = "";

  try {
    const response = await llm.invoke(
      [new SystemMessage(systemPrompt), new HumanMessage(state.query)],
      { callbacks: [{ handleLLMNewToken(token: string) { finalAnswer += token; } }] }
    );
    if (!finalAnswer && response.content) finalAnswer = response.content.toString();
  } catch (err: any) {
    finalAnswer = buildOfflineFallback(state, err.message);
  }

  return {
    finalAnswer,
    messages: [new AIMessage(finalAnswer)],
    stepLogs: [{
      id: stepId,
      nodeName: "intelligenceSynthesiser",
      status: "completed",
      timestamp: new Date().toISOString(),
      details: `Synthesised ${state.citations.length} citation(s) into intelligence briefing`,
    }],
  };
}

function buildOfflineFallback(state: AgentState, errMsg: string): string {
  return `## Intelligence Briefing (Offline Mode)\n\n**Query:** ${state.query}\n\n### Retrieved Citations:\n${state.citations.length > 0
    ? state.citations.map((c, i) => `**[${i + 1}] ${c.title}** (${c.source})\n> ${c.snippet}`).join("\n\n")
    : "No citations available."
    }\n\n*Configure OPENROUTER_API_KEY for full LLM synthesis. Error: ${errMsg}*`;
}

// ============================================================
// Legacy exports â€” kept for backward compat during transition
// ============================================================
/** @deprecated use intelligencePlannerNode */
