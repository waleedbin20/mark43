import { Citation } from "@mark43/shared";

const MAX_CITATIONS_IN_PROMPT = 12;
const MAX_SNIPPET_LENGTH = 300;

/**
 * Formats accumulated citations into the numbered block the synthesiser reads.
 * Caps the count and snippet length to keep the prompt within budget.
 */
export function formatCitationsForPrompt(citations: Citation[]): string {
    if (citations.length === 0) {
        return "No external citations retrieved.";
    }

    return citations
        .slice(0, MAX_CITATIONS_IN_PROMPT)
        .map(
            (citation, index) =>
                `[${index + 1}] ${citation.title}\n    Source: ${citation.source}\n    ${citation.snippet?.slice(0, MAX_SNIPPET_LENGTH) ?? ""
                }`
        )
        .join("\n\n");
}
