import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Citation } from "@mark43/shared";
import { policeFetch } from "./policeUkRateLimiter";

const BASE = "https://data.police.uk/api";

interface NeighbourhoodRecord { id: string; name: string }

async function listNeighbourhoods(forceId: string): Promise<NeighbourhoodRecord[]> {
    const res = await policeFetch(`${BASE}/${encodeURIComponent(forceId)}/neighbourhoods`);
    if (!res.ok) throw new Error(`neighbourhoods error: ${res.status}`);
    return res.json() as Promise<NeighbourhoodRecord[]>;
}

async function getNeighbourhoodDetail(forceId: string, neighbourhoodId: string): Promise<unknown> {
    const res = await policeFetch(`${BASE}/${encodeURIComponent(forceId)}/${encodeURIComponent(neighbourhoodId)}`);
    if (!res.ok) throw new Error(`neighbourhood detail error: ${res.status}`);
    return res.json();
}

async function getNeighbourhoodBoundary(forceId: string, neighbourhoodId: string): Promise<Array<{ latitude: string; longitude: string }>> {
    const res = await policeFetch(`${BASE}/${encodeURIComponent(forceId)}/${encodeURIComponent(neighbourhoodId)}/boundary`);
    if (!res.ok) throw new Error(`neighbourhood boundary error: ${res.status}`);
    return res.json() as Promise<Array<{ latitude: string; longitude: string }>>;
}

async function getNeighbourhoodTeam(forceId: string, neighbourhoodId: string): Promise<unknown[]> {
    const res = await policeFetch(`${BASE}/${encodeURIComponent(forceId)}/${encodeURIComponent(neighbourhoodId)}/people`);
    if (!res.ok) throw new Error(`neighbourhood team error: ${res.status}`);
    return res.json() as Promise<unknown[]>;
}

async function getNeighbourhoodEvents(forceId: string, neighbourhoodId: string): Promise<unknown[]> {
    const res = await policeFetch(`${BASE}/${encodeURIComponent(forceId)}/${encodeURIComponent(neighbourhoodId)}/events`);
    if (!res.ok) throw new Error(`neighbourhood events error: ${res.status}`);
    return res.json() as Promise<unknown[]>;
}

async function getNeighbourhoodPriorities(forceId: string, neighbourhoodId: string): Promise<unknown[]> {
    const res = await policeFetch(`${BASE}/${encodeURIComponent(forceId)}/${encodeURIComponent(neighbourhoodId)}/priorities`);
    if (!res.ok) throw new Error(`neighbourhood priorities error: ${res.status}`);
    return res.json() as Promise<unknown[]>;
}

async function locateNeighbourhood(lat: number, lng: number): Promise<{ force: string; neighbourhood: string }> {
    const res = await policeFetch(`${BASE}/locate-neighbourhood?q=${lat},${lng}`);
    if (!res.ok) throw new Error(`locate-neighbourhood error: ${res.status}`);
    return res.json() as Promise<{ force: string; neighbourhood: string }>;
}

/**
 * Tool: fetch_uk_neighbourhood_data
 * All neighbourhood-related Police UK API endpoints.
 * Rate-limited via shared token bucket (15 req/s, burst 30).
 */
export const policeUkNeighbourhoodTool = new DynamicStructuredTool({
    name: "fetch_uk_neighbourhood_data",
    description:
        "Query UK police neighbourhood data from data.police.uk. " +
        "Methods: list (all neighbourhoods for a force), detail (profile of a specific neighbourhood), " +
        "boundary (polygon boundary coordinates), team (officer team for a neighbourhood), " +
        "events (upcoming community events), priorities (current policing priorities), " +
        "locate (find neighbourhood from lat/lng coordinates). " +
        "Use for community policing questions, local team contacts, area boundaries, or neighbourhood priorities.",
    schema: z.object({
        method: z
            .enum(["list", "detail", "boundary", "team", "events", "priorities", "locate"])
            .default("locate")
            .describe("Which neighbourhood endpoint to call"),
        force_id: z
            .string()
            .optional()
            .describe("Force identifier (e.g. 'metropolitan', 'west-yorkshire'). Required for list/detail/boundary/team/events/priorities."),
        neighbourhood_id: z
            .string()
            .optional()
            .describe("Neighbourhood ID. Required for detail/boundary/team/events/priorities."),
        lat: z.number().optional().default(51.5074).describe("Latitude for locate method"),
        lng: z.number().optional().default(-0.1278).describe("Longitude for locate method"),
    }),
    func: async ({ method, force_id, neighbourhood_id, lat, lng }) => {
        try {
            switch (method) {
                case "list": {
                    if (!force_id) throw new Error("'force_id' required for list");
                    const hoods = await listNeighbourhoods(force_id);
                    const citations: Citation[] = hoods.slice(0, 10).map((n, i) => ({
                        id: `neighbourhood-${force_id}-${i}`,
                        source: `data.police.uk/api/${force_id}/neighbourhoods`,
                        title: n.name,
                        snippet: `Neighbourhood ID: ${n.id}, Force: ${force_id}`,
                    }));
                    return JSON.stringify({ force_id, count: hoods.length, neighbourhoods: hoods, citations });
                }

                case "detail": {
                    if (!force_id || !neighbourhood_id) throw new Error("'force_id' and 'neighbourhood_id' required for detail");
                    const detail = await getNeighbourhoodDetail(force_id, neighbourhood_id);
                    return JSON.stringify({ force_id, neighbourhood_id, detail, source: `data.police.uk/api/${force_id}/${neighbourhood_id}` });
                }

                case "boundary": {
                    if (!force_id || !neighbourhood_id) throw new Error("'force_id' and 'neighbourhood_id' required for boundary");
                    const boundary = await getNeighbourhoodBoundary(force_id, neighbourhood_id);
                    return JSON.stringify({ force_id, neighbourhood_id, pointCount: boundary.length, boundary, source: `data.police.uk/api/${force_id}/${neighbourhood_id}/boundary` });
                }

                case "team": {
                    if (!force_id || !neighbourhood_id) throw new Error("'force_id' and 'neighbourhood_id' required for team");
                    const team = await getNeighbourhoodTeam(force_id, neighbourhood_id);
                    return JSON.stringify({ force_id, neighbourhood_id, officerCount: team.length, team, source: `data.police.uk/api/${force_id}/${neighbourhood_id}/people` });
                }

                case "events": {
                    if (!force_id || !neighbourhood_id) throw new Error("'force_id' and 'neighbourhood_id' required for events");
                    const events = await getNeighbourhoodEvents(force_id, neighbourhood_id);
                    const citations: Citation[] = (events as any[]).slice(0, 5).map((e: any, i) => ({
                        id: `event-${i}`,
                        source: `data.police.uk/api/${force_id}/${neighbourhood_id}/events`,
                        title: e.title ?? "Community Event",
                        snippet: `${e.description ?? ""}. Contact: ${e.contact_details?.email ?? "See force website"}.`,
                    }));
                    return JSON.stringify({ force_id, neighbourhood_id, count: events.length, citations });
                }

                case "priorities": {
                    if (!force_id || !neighbourhood_id) throw new Error("'force_id' and 'neighbourhood_id' required for priorities");
                    const priorities = await getNeighbourhoodPriorities(force_id, neighbourhood_id);
                    const citations: Citation[] = (priorities as any[]).slice(0, 5).map((p: any, i) => ({
                        id: `priority-${i}`,
                        source: `data.police.uk/api/${force_id}/${neighbourhood_id}/priorities`,
                        title: p.issue ?? "Policing Priority",
                        snippet: `Action: ${p.action ?? "Ongoing"}. Created: ${p["issue-date"] ?? "Unknown"}.`,
                    }));
                    return JSON.stringify({ force_id, neighbourhood_id, count: priorities.length, citations });
                }

                case "locate": {
                    const located = await locateNeighbourhood(lat ?? 51.5074, lng ?? -0.1278);
                    return JSON.stringify({ lat, lng, force: located.force, neighbourhood: located.neighbourhood, source: "data.police.uk/api/locate-neighbourhood" });
                }

                default:
                    throw new Error(`Unknown method: ${method}`);
            }
        } catch (err: any) {
            return JSON.stringify({ error: err.message, method, source: "data.police.uk" });
        }
    },
});
