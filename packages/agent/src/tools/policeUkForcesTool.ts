import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Citation } from "@mark43/shared";
import { policeFetch } from "./policeUkRateLimiter";

const BASE = "https://data.police.uk/api";

interface ForceRecord { id: string; name: string }
interface SeniorOfficer { name: string; rank: { name: string }; bio?: string; contact_details?: Record<string, string> }

async function listForces(): Promise<ForceRecord[]> {
    const res = await policeFetch(`${BASE}/forces`);
    if (!res.ok) throw new Error(`forces error: ${res.status}`);
    return res.json() as Promise<ForceRecord[]>;
}

async function getForceDetail(forceId: string): Promise<unknown> {
    const res = await policeFetch(`${BASE}/forces/${encodeURIComponent(forceId)}`);
    if (!res.ok) throw new Error(`force detail error: ${res.status} — invalid force ID?`);
    return res.json();
}

async function getSeniorOfficers(forceId: string): Promise<SeniorOfficer[]> {
    const res = await policeFetch(`${BASE}/forces/${encodeURIComponent(forceId)}/people`);
    if (!res.ok) throw new Error(`senior-officers error: ${res.status}`);
    return res.json() as Promise<SeniorOfficer[]>;
}

/**
 * Tool: fetch_uk_force_info
 * Police force directory, detail, and senior leadership from data.police.uk.
 * Rate-limited via shared token bucket (15 req/s, burst 30).
 */
export const policeUkForcesTool = new DynamicStructuredTool({
    name: "fetch_uk_force_info",
    description:
        "Query UK police force information from data.police.uk. " +
        "Methods: list (all 43+ forces in England/Wales/NI), detail (full profile for a specific force), " +
        "senior_officers (leadership team for a specific force). " +
        "Use when asked about police forces, their structure, leadership, or contact details.",
    schema: z.object({
        method: z
            .enum(["list", "detail", "senior_officers"])
            .default("list")
            .describe("list = all forces, detail = single force profile, senior_officers = leadership"),
        force_id: z
            .string()
            .optional()
            .describe("Force identifier required for detail/senior_officers (e.g. 'metropolitan', 'thames-valley', 'west-yorkshire')"),
    }),
    func: async ({ method, force_id }) => {
        try {
            switch (method) {
                case "list": {
                    const forces = await listForces();
                    const citations: Citation[] = forces.map((f, i) => ({
                        id: `police-force-${i}`,
                        source: "data.police.uk/api/forces",
                        title: f.name,
                        snippet: `Force ID: ${f.id}`,
                    }));
                    return JSON.stringify({ count: forces.length, forces, citations });
                }

                case "detail": {
                    if (!force_id) throw new Error("'force_id' required for detail");
                    const detail = await getForceDetail(force_id);
                    return JSON.stringify({
                        force_id,
                        detail,
                        source: `data.police.uk/api/forces/${force_id}`,
                    });
                }

                case "senior_officers": {
                    if (!force_id) throw new Error("'force_id' required for senior_officers");
                    const officers = await getSeniorOfficers(force_id);
                    const citations: Citation[] = officers.map((o, i) => ({
                        id: `officer-${force_id}-${i}`,
                        source: `data.police.uk/api/forces/${force_id}/people`,
                        title: `${o.rank?.name ?? "Officer"}: ${o.name}`,
                        snippet: o.bio?.slice(0, 200) ?? "No biography available.",
                    }));
                    return JSON.stringify({ force_id, count: officers.length, officers, citations });
                }

                default:
                    throw new Error(`Unknown method: ${method}`);
            }
        } catch (err: any) {
            return JSON.stringify({ error: err.message, method, source: "data.police.uk" });
        }
    },
});
