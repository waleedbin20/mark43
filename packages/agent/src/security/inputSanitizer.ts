/**
 * Input sanitisation and prompt-injection defence for user queries.
 *
 * The query is untrusted input. Before it reaches the LLM we:
 *  1. Strip control characters and cap length (denial-of-service guard).
 *  2. Flag known prompt-injection patterns so the planner can treat the text
 *     as data to research, not as instructions that override its own rules.
 *
 * This is a defence-in-depth layer. The planner prompt also states that the
 * query is data, not instructions.
 */

const MAX_QUERY_LENGTH = 2000;

// Patterns that commonly signal an attempt to hijack the system prompt.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|the)\s+(?:instructions|rules|prompt)/i,
  /forget\s+(?:everything|all|your)\s+(?:instructions|rules|context)/i,
  /you\s+are\s+now\s+(?:a|an|the)\b/i,
  /new\s+(?:system\s+)?(?:instructions|prompt|role)\s*:/i,
  /reveal\s+(?:your|the)\s+(?:system\s+)?prompt/i,
  /(?:print|repeat|output)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions)/i,
  /\bdeveloper\s+mode\b/i,
  /\bDAN\b/,
];

export interface SanitisedQuery {
  query: string;
  wasTruncated: boolean;
  injectionSuspected: boolean;
}

/** Removes control characters that could break prompt framing or logs. */
function stripControlCharacters(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function detectPromptInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Cleans and length-caps a raw user query and reports whether it looks like a
 * prompt-injection attempt. Never throws; always returns a usable string.
 */
export function sanitiseUserQuery(rawQuery: string): SanitisedQuery {
  const stripped = stripControlCharacters(rawQuery).trim();
  const wasTruncated = stripped.length > MAX_QUERY_LENGTH;
  const query = wasTruncated ? stripped.slice(0, MAX_QUERY_LENGTH) : stripped;

  return {
    query,
    wasTruncated,
    injectionSuspected: detectPromptInjection(query),
  };
}
