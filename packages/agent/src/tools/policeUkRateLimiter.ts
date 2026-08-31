/**
 * Token-bucket rate limiter for the Police UK API.
 * Limit: 15 requests/second average, burst of 30.
 * https://data.police.uk/docs/#api-call-limits
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRatePerMs: number;

  constructor(capacity: number, tokensPerSecond: number) {
    this.capacity = capacity;
    this.refillRatePerMs = tokensPerSecond / 1_000;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait until the bucket refills enough for one token
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRatePerMs);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }
}

/** Singleton — shared across all Police UK API calls in the process. */
export const policeUkRateLimiter = new TokenBucket(30, 15);

/**
 * Rate-limited fetch wrapper for any data.police.uk endpoint.
 * Automatically retries once on HTTP 429.
 */
export async function policeFetch(url: string): Promise<Response> {
  await policeUkRateLimiter.acquire();
  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (res.status === 429) {
    // Back off 2s and retry once
    await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
    await policeUkRateLimiter.acquire();
    return fetch(url, { headers: { Accept: "application/json" } });
  }

  return res;
}
