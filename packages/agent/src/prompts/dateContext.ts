/**
 * Formats the current date for injection into system prompts, giving the agent
 * real-time awareness so it can reason about recency ("recent", "last 5 years").
 */
export function getCurrentDateContext(): string {
    const now = new Date();
    const formatted = now.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    return `Today's date is ${formatted}. Use this to judge how recent information is and to interpret relative time references such as "recent", "latest", or "last N years".`;
}
