/**
 * Summariser prompts.
 *
 * Used by the memory layer to compress older conversation turns into a short
 * factual summary, keeping the context window small while preserving facts.
 */

export const SUMMARISER_SYSTEM_PROMPT =
  "You are a conversation summariser for a public safety intelligence system.";

export function buildSummariserUserPrompt(
  existingSummary: string,
  historyText: string,
  currentQuery: string
): string {
  const parts = [
    existingSummary ? `Previous summary:\n${existingSummary}\n` : "",
    `Conversation to summarise:\n${historyText}`,
    `\nCurrent query context: "${currentQuery}"`,
    "\nCreate a concise factual summary (max 200 words) of the key topics, findings, and decisions made so far. Preserve source names and any specific facts cited.",
  ];
  return parts.join("\n");
}
