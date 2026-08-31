import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentState } from "../state";
import { getChatLLM } from "../../core/llm";
import { buildSynthesiserSystemPrompt } from "../../prompts";
import { formatCitationsForPrompt } from "./formatCitations";

/**
 * Synthesiser node: turns accumulated citations and conversation context into
 * the final briefing. Streaming is on so tokens accumulate as they arrive.
 */
export async function intelligenceSynthesiserNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const stepId = `step-synth-${Date.now()}`;
  const citationsContext = formatCitationsForPrompt(state.citations);
  const systemPrompt = buildSynthesiserSystemPrompt(
    citationsContext,
    state.conversationSummary
  );

  const finalAnswer = await synthesise(systemPrompt, state);

  return {
    finalAnswer,
    messages: [new AIMessage(finalAnswer)],
    stepLogs: [
      {
        id: stepId,
        nodeName: "intelligenceSynthesiser",
        status: "completed",
        timestamp: new Date().toISOString(),
        details: `Synthesised ${state.citations.length} citation(s) into intelligence briefing`,
      },
    ],
  };
}

async function synthesise(systemPrompt: string, state: AgentState): Promise<string> {
  const llm = getChatLLM(true);
  let finalAnswer = "";

  try {
    const response = await llm.invoke(
      [new SystemMessage(systemPrompt), new HumanMessage(state.query)],
      {
        callbacks: [
          {
            handleLLMNewToken(token: string) {
              finalAnswer += token;
            },
          },
        ],
      }
    );
    if (!finalAnswer && response.content) {
      finalAnswer = response.content.toString();
    }
    return finalAnswer;
  } catch (err: any) {
    return buildOfflineBriefing(state, err?.message ?? "Unknown error");
  }
}

/** Degraded output when the LLM is unreachable: shows raw citations, no invention. */
function buildOfflineBriefing(state: AgentState, errorMessage: string): string {
  const citationsBlock =
    state.citations.length > 0
      ? state.citations
          .map((c, i) => `**[${i + 1}] ${c.title}** (${c.source})\n> ${c.snippet}`)
          .join("\n\n")
      : "No citations available.";

  return [
    "## Intelligence Briefing (Offline Mode)",
    "",
    `**Query:** ${state.query}`,
    "",
    "### Retrieved Citations:",
    citationsBlock,
    "",
    `*Configure OPENROUTER_API_KEY for full LLM synthesis. Error: ${errorMessage}*`,
  ].join("\n");
}
