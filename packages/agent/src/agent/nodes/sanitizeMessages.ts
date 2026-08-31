import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";

/**
 * Produces a message list that satisfies the OpenAI/OpenRouter constraint that
 * every `tool` message must directly follow an assistant message whose
 * `tool_calls` includes its id.
 *
 * Across multiple turns (and after summarisation trims the history), the stored
 * messages can start with, or contain, an orphaned tool message whose matching
 * assistant tool_calls was cut. Sending that raises a 400. This walks the list
 * and keeps only complete assistant-tool_calls -> tool-responses groups, drops
 * orphaned tool messages, and demotes assistant messages with unanswered
 * tool_calls to plain text (preserving any content).
 */
export function toValidLLMHistory(messages: BaseMessage[]): BaseMessage[] {
  const result: BaseMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const message = messages[i];

    if (message instanceof AIMessage && (message.tool_calls?.length ?? 0) > 0) {
      const expectedIds = new Set(
        (message.tool_calls ?? []).map((tc) => tc.id).filter(Boolean) as string[]
      );

      // Collect the contiguous tool messages that follow this assistant turn.
      const toolMessages: ToolMessage[] = [];
      let j = i + 1;
      while (j < messages.length && messages[j] instanceof ToolMessage) {
        const toolMessage = messages[j] as ToolMessage;
        if (expectedIds.has(toolMessage.tool_call_id)) {
          toolMessages.push(toolMessage);
        }
        j += 1;
      }

      const respondedIds = new Set(toolMessages.map((tm) => tm.tool_call_id));
      const allAnswered = expectedIds.size > 0 && [...expectedIds].every((id) => respondedIds.has(id));

      if (allAnswered) {
        result.push(message, ...toolMessages);
      } else if (String(message.content ?? "").trim().length > 0) {
        // Unanswered tool_calls would be invalid; keep only the textual content.
        result.push(new AIMessage(String(message.content)));
      }

      i = j;
      continue;
    }

    if (message instanceof ToolMessage) {
      // Orphaned tool message with no preceding assistant tool_calls: drop it.
      i += 1;
      continue;
    }

    result.push(message);
    i += 1;
  }

  return result;
}
