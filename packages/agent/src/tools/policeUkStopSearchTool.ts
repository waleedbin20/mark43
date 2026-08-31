import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Citation } from "@mark43/shared";
import { policeFetch } from "./policeUkRateLimiter";

const BASE = "https://data.police.uk/api";

async function getStopsByArea(lat: number, lng: number, date?: string): Promise<unknown[]> {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (date) q.set("date", date);
  const res = await policeFetch(`${BASE}/stops-street?${q}`);
  if (!res.ok) throw new Error(`stops-street error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

async function getStopsAtLocation(locationId: number, date?: string): Promise<unknown[]> {
  const q = new URLSearchParams({ location_id: String(locationId) });
  if (date) q.set("date", date);
  const res = await policeFetch(`${BASE}/stops-at-location?${q}`);
  if (!res.ok) throw new Error(`stops-at-location error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

async function getStopsNoLocation(forceId: string, date?: string): Promise<unknown[]> {
  const q = new URLSearchParams({ force: forceId });
  if (date) q.set("date", date);
  const res = await policeFetch(`${BASE}/stops-no-location?${q}`);
  if (!res.ok) throw new Error(`stops-no-location error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

async function getStopsByForce(forceId: string, date?: string): Promise<unknown[]> {
  const q = new URLSearchParams({ force: forceId });
  if (date) q.set("date", date);
  const res = await policeFetch(`${BASE}/stops-force?${q}`);
  if (!res.ok) throw new Error(`stops-force error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

function buildStopCitations(stops: unknown[], method: string, context: string): Citation[] {
  return (stops as any[]).slice(0, 15).map((s: any, i) => ({
    id: `stop-search-${method}-${i}`,
    source: `data.police.uk/api/${method.replace(/_/g, "-")}`,
    title: `Stop & Search: ${s.type ?? "Unknown type"} (${s.datetime?.slice(0, 7) ?? "Unknown date"})`,
    snippet: `Object: ${s.object_of_search ?? "n/a"}. Outcome: ${s.outcome ?? "n/a"}. ${context}`,
  }));
}

/**
 * Tool: fetch_uk_stop_search
 * All stop-and-search Police UK API endpoints.
 * Rate-limited via shared token bucket (15 req/s, burst 30).
 */
export const policeUkStopSearchTool = new DynamicStructuredTool({
  name: "fetch_uk_stop_search",
  description:
    "Query UK police stop-and-search data from data.police.uk. " +
    "Methods: by_area (stops near lat/lng), at_location (stops at a specific location_id), " +
    "no_location (force-level stops with no recorded location), by_force (all stops for a force). " +
    "Use for stop-and-search analysis, disproportionality questions, or force-level trend data.",
  schema: z.object({
    method: z
      .enum(["by_area", "at_location", "no_location", "by_force"])
      .default("by_area")
      .describe("Which stop-and-search endpoint to call"),
    lat: z.number().optional().default(51.5074).describe("Latitude for by_area (default: central London)"),
    lng: z.number().optional().default(-0.1278).describe("Longitude for by_area (default: central London)"),
    location_id: z.number().optional().describe("Location ID for at_location method"),
    force_id: z
      .string()
      .optional()
      .describe("Force identifier for no_location/by_force (e.g. 'metropolitan', 'west-yorkshire')"),
    date: z.string().optional().describe("Month as YYYY-MM; omit for latest available"),
    location_name: z.string().optional().describe("Human-readable label for display"),
  }),
  func: async ({ method, lat, lng, location_id, force_id, date, location_name }) => {
    try {
      switch (method) {
        case "by_area": {
          const stops = await getStopsByArea(lat ?? 51.5074, lng ?? -0.1278, date);
          const loc = location_name ?? `(${lat}, ${lng})`;
          const outcomeBreakdown: Record<string, number> = {};
          for (const s of stops as any[]) {
            const key = s.outcome ?? "Unknown";
            outcomeBreakdown[key] = (outcomeBreakdown[key] || 0) + 1;
          }
          const citations = buildStopCitations(stops, "stops_street", `Location: ${loc}.`);
          return JSON.stringify({ location: loc, total: stops.length, outcomeBreakdown, citations });
        }

        case "at_location": {
          if (!location_id) throw new Error("'location_id' required for at_location");
          const stops = await getStopsAtLocation(location_id, date);
          const citations = buildStopCitations(stops, "stops_at_location", `Location ID: ${location_id}.`);
          return JSON.stringify({ location_id, total: stops.length, citations });
        }

        case "no_location": {
          if (!force_id) throw new Error("'force_id' required for no_location");
          const stops = await getStopsNoLocation(force_id, date);
          const citations = buildStopCitations(stops, "stops_no_location", `Force: ${force_id}.`);
          return JSON.stringify({ force_id, total: stops.length, citations });
        }

        case "by_force": {
          if (!force_id) throw new Error("'force_id' required for by_force");
          const stops = await getStopsByForce(force_id, date);
          const outcomeBreakdown: Record<string, number> = {};
          for (const s of stops as any[]) {
            const key = s.outcome ?? "Unknown";
            outcomeBreakdown[key] = (outcomeBreakdown[key] || 0) + 1;
          }
          const citations = buildStopCitations(stops, "stops_force", `Force: ${force_id}.`);
          return JSON.stringify({ force_id, total: stops.length, outcomeBreakdown, citations });
        }

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message, method, source: "data.police.uk" });
    }
  },
});
