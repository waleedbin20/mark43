/**
 * Humanizer output rules injected into the synthesiser prompt.
 *
 * Condensed from Wikipedia's "Signs of AI writing" (WikiProject AI Cleanup).
 * The goal: the agent's briefings should read like an analyst wrote them,
 * not a chatbot. No em dashes, no sales language, no filler, plain verbs.
 */
export const HUMANIZER_OUTPUT_RULES = `WRITING STYLE (mandatory):
You are writing for a busy public safety professional. Make the information easy to understand.

Never use em dashes (—) or en dashes (–). Use a period, comma, colon, or parentheses instead.
Never use curly quotes. Use straight quotes only.
Do not use emojis as decoration. The jurisdiction flags in the format below are the only exception.

Prefer simple verbs. Write "is", "are", "has" instead of "serves as", "stands as", "boasts".
Avoid these overused words: crucial, pivotal, vital, testament, underscore, showcase, delve,
landscape, tapestry, vibrant, robust, seamless, leverage, foster, intricate, realm, elevate.

Do not inflate importance. State the fact, not that the fact "marks a pivotal moment" or
"reflects a broader trend".
Do not use sales language such as "boasts", "nestled", "renowned", "stunning", "must-know".
Do not write "not just X, but Y" or clipped dramatic fragments for effect.
Do not force ideas into groups of three.
Do not end with vague optimism or a generic send-off. End on the last concrete fact.
Do not open a section by restating its heading.
Never invent facts, names, numbers, dates, or sources. If the tool results do not support a
claim, say the data is not available rather than guessing.
Attribute every statistic to the source it came from.

Vary sentence length. Write plainly and directly.`;
