import { MemorySaver } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { getChatLLM } from "../core/llm";
import { getConfig } from "../core/config";
import { SUMMARISER_SYSTEM_PROMPT, buildSummariserUserPrompt } from "../prompts";

/**
 * Singleton MemorySaver — shared across all requests so LangGraph checkpoints survive
 * across API calls for the same thread_id (sessionId).
 *
 * Design choice: in-process short-term memory (Option A) + summarisation trigger at threshold
 * (Option B).  We rejected semantic cross-session retrieval (Option C) because the use case is
 * a per-briefing intelligence session, not a persistent analyst relationship.
 */
let _memorySaver: MemorySaver | null = null;

export function getMemorySaver(): MemorySaver {
    if (!_memorySaver) {
        _memorySaver = new MemorySaver();
    }
    return _memorySaver;
}

export interface SummariseResult {
    summary: string;
    trimmedMessages: BaseMessage[];
}

/**
 * Compresses message history when it exceeds the configured threshold.
 * Keeps the last 4 messages verbatim (so the LLM retains immediate context)
 * and summarises everything older.
 */
export async function summariseConversationIfNeeded(
    messages: BaseMessage[],
    currentQuery: string,
    existingSummary: string
): Promise<SummariseResult> {
    const { SESSION_SUMMARIZE_THRESHOLD } = getConfig();

    if (messages.length <= SESSION_SUMMARIZE_THRESHOLD) {
        return { summary: existingSummary, trimmedMessages: messages };
    }

    const keepTail = 4;
    const toSummarise = messages.slice(0, messages.length - keepTail);
    const tail = messages.slice(messages.length - keepTail);

    const llm = getChatLLM(false);

    const historyText = toSummarise
        .map((m) => {
            if (m instanceof HumanMessage) return `User: ${m.content}`;
            if (m instanceof AIMessage) return `Assistant: ${m.content}`;
            return `[${m.constructor.name}]: ${m.content}`;
        })
        .join("\n");

    try {
        const response = await llm.invoke([
            new SystemMessage(SUMMARISER_SYSTEM_PROMPT),
            new HumanMessage(buildSummariserUserPrompt(existingSummary, historyText, currentQuery)),
        ]);
        const summary = response.content.toString().trim();
        return { summary, trimmedMessages: tail };
    } catch {
        // On failure, keep messages as-is rather than lose context
        return { summary: existingSummary, trimmedMessages: messages };
    }
}
