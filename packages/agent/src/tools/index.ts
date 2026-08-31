export { policeUkTool } from "./policeUkTool";
export { policeUkForcesTool } from "./policeUkForcesTool";
export { policeUkNeighbourhoodTool } from "./policeUkNeighbourhoodTool";
export { policeUkStopSearchTool } from "./policeUkStopSearchTool";
export { govUkTool } from "./govUkTool";
export { fbiCrimeDataTool } from "./fbiCrimeDataTool";
export { graphRagTool } from "./graphRagTool";
export { policeUkRateLimiter } from "./policeUkRateLimiter";

import { policeUkTool } from "./policeUkTool";
import { policeUkForcesTool } from "./policeUkForcesTool";
import { policeUkNeighbourhoodTool } from "./policeUkNeighbourhoodTool";
import { policeUkStopSearchTool } from "./policeUkStopSearchTool";
import { govUkTool } from "./govUkTool";
import { fbiCrimeDataTool } from "./fbiCrimeDataTool";
import { graphRagTool } from "./graphRagTool";
import { DynamicStructuredTool } from "@langchain/core/tools";

/**
 * Full tool registry for the Intelligence Agent.
 * The LLM receives all tool schemas and decides which to invoke — no hardcoded routing.
 *
 * Police UK tools share a token-bucket rate limiter (15 req/s avg, burst 30).
 * https://data.police.uk/docs/#api-call-limits
 */
export function getIntelligenceTools(): DynamicStructuredTool[] {
  return [
    // Knowledge base
    graphRagTool,              // Graph RAG: semantic + entity graph over ingested corpus

    // Police UK (all endpoints, shared rate limiter)
    policeUkTool,              // Crime: street crimes, outcomes, categories, availability
    policeUkForcesTool,        // Forces: list, detail, senior officers
    policeUkNeighbourhoodTool, // Neighbourhoods: list, detail, boundary, team, events, priorities, locate
    policeUkStopSearchTool,    // Stop & search: by area, at location, no location, by force

    // International / policy
    govUkTool,                 // Gov.uk policy + College of Policing RSS
    fbiCrimeDataTool,          // US: FBI Crime Data Explorer (UCR/NIBRS)
  ];
}
