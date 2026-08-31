import rateLimit from "express-rate-limit";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

/**
 * Per-IP rate limiter for the agent endpoint. Agent runs are expensive (LLM plus
 * live API calls), so this caps abusive request volume without blocking normal use.
 */
export const agentRateLimiter = rateLimit({
    windowMs: WINDOW_MS,
    max: MAX_REQUESTS_PER_WINDOW,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down and try again shortly." },
});
