import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Citation } from "@mark43/shared";
import { policeFetch } from "./policeUkRateLimiter";

const BASE = "https://data.police.uk/api";

// ── Endpoint helpers ──────────────────────────────────────────────────────────

async function getStreetCrimes(lat: number, lng: number, category: string, date?: string): Promise<unknown[]> {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (date) q.set("date", date);
  const res = await policeFetch(`${BASE}/crimes-street/${encodeURIComponent(category)}?${q}`);
  if (!res.ok) throw new Error(`crimes-street error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

async function getOutcomesAtLocation(lat: number, lng: number, date?: string): Promise<unknown[]> {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (date) q.set("date", date);
  const res = await policeFetch(`${BASE}/outcomes-at-location?${q}`);
  if (!res.ok) throw new Error(`outcomes-at-location error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

async function getCrimesAtLocation(lat: number, lng: number, date?: string): Promise<unknown[]> {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (date) q.set("date", date);
  const res = await policeFetch(`${BASE}/crimes-at-location?${q}`);
  if (!res.ok) throw new Error(`crimes-at-location error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

async function getCrimesNoLocation(force: string, category: string, date?: string): Promise<unknown[]> {
  const q = new URLSearchParams({ force, category });
  if (date) q.set("date", date);
  const res = await policeFetch(`${BASE}/crimes-no-location?${q}`);
  if (!res.ok) throw new Error(`crimes-no-location error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

async function getCrimeCategories(date?: string): Promise<Array<{ url: string; name: string }>> {
  const q = date ? `?date=${date}` : "";
  const res = await policeFetch(`${BASE}/crime-categories${q}`);
  if (!res.ok) throw new Error(`crime-categories error: ${res.status}`);
  return res.json() as Promise<Array<{ url: string; name: string }>>;
}

async function getCrimeLastUpdated(): Promise<{ date: string }> {
  const res = await policeFetch(`${BASE}/crime-last-updated`);
  if (!res.ok) throw new Error(`crime-last-updated error: ${res.status}`);
  return res.json() as Promise<{ date: string }>;
}

async function getOutcomesForCrime(persistentId: string): Promise<unknown> {
  const res = await policeFetch(`${BASE}/outcomes-for-crime/${encodeURIComponent(persistentId)}`);
  if (!res.ok) throw new Error(`outcomes-for-crime error: ${res.status}`);
  return res.json();
}

async function getAvailability(): Promise<Array<{ date: string; stop_and_search: string[] }>> {
  const res = await policeFetch(`${BASE}/crimes-street-dates`);
  if (!res.ok) throw new Error(`crimes-street-dates error: ${res.status}`);
  return res.json() as Promise<Array<{ date: string; stop_and_search: string[] }>>;
}

// ── Tool ─────────────────────────────────────────────────────────────────────

/**
 * Tool: fetch_uk_crime_data
 * All crime-related Police UK API endpoints, rate-limited at 15 req/s (burst 30).
 * https://data.police.uk/docs/#api-call-limits
 */
export const policeUkTool = new DynamicStructuredTool({
  name: "fetch_uk_crime_data",
  description:
    "Query the UK Police API (data.police.uk) for crime data. " +
    "Methods: street_crimes (crimes near lat/lng), outcomes_at_location (outcomes near lat/lng), " +
    "crimes_at_location (crimes snapped to nearest location), crimes_no_location (force-level unlocatable crimes), " +
    "crime_categories (full category taxonomy), last_updated (data currency date), " +
    "outcomes_for_crime (outcome history for a specific crime ID), availability (available data dates).",
  schema: z.object({
    method: z
      .enum([
        "street_crimes",
        "outcomes_at_location",
        "crimes_at_location",
        "crimes_no_location",
        "crime_categories",
        "last_updated",
        "outcomes_for_crime",
        "availability",
      ])
      .default("street_crimes")
      .describe("Which crime endpoint to call"),
    lat: z.number().optional().default(51.5074).describe("Latitude (default: central London)"),
    lng: z.number().optional().default(-0.1278).describe("Longitude (default: central London)"),
    date: z.string().optional().describe("Month as YYYY-MM; omit for latest available"),
    category: z
      .string()
      .optional()
      .default("all-crime")
      .describe("Crime category slug, e.g. 'burglary', 'violent-crime'. Use 'all-crime' for all categories."),
    force: z
      .string()
      .optional()
      .describe("Force ID required for crimes_no_location (e.g. 'metropolitan', 'thames-valley')"),
    persistent_id: z.string().optional().describe("Crime persistent_id required for outcomes_for_crime"),
    location_name: z.string().optional().describe("Human-readable label for display"),
  }),
  func: async ({ method, lat, lng, date, category, force, persistent_id, location_name }) => {
    try {
      const loc = location_name ?? `(${lat}, ${lng})`;

      switch (method) {
        case "street_crimes": {
          const crimes = await getStreetCrimes(lat ?? 51.5074, lng ?? -0.1278, category ?? "all-crime", date);
          const sample = (crimes as any[]).slice(0, 20);
          const counts: Record<string, number> = {};
          for (const c of crimes as any[]) counts[c.category] = (counts[c.category] || 0) + 1;
          const citations: Citation[] = sample.map((c: any, i) => ({
            id: `police-uk-crime-${i}`,
            source: "data.police.uk/api/crimes-street",
            title: `UK Crime: ${c.category} (${c.month})`,
            snippet: `Street: ${c.location?.street?.name ?? "Unknown"}. Outcome: ${c.outcome_status?.category ?? "Under investigation"}.`,
          }));
          return JSON.stringify({ location: loc, total: crimes.length, categorySummary: counts, citations });
        }

        case "outcomes_at_location": {
          const outcomes = await getOutcomesAtLocation(lat ?? 51.5074, lng ?? -0.1278, date);
          const sample = (outcomes as any[]).slice(0, 15);
          const citations: Citation[] = sample.map((o: any, i) => ({
            id: `police-uk-outcome-${i}`,
            source: "data.police.uk/api/outcomes-at-location",
            title: `Outcome: ${o.outcomes?.[0]?.category?.name ?? "Unknown"} (${o.month})`,
            snippet: `Crime: ${o.crime?.category ?? "n/a"}. Street: ${o.crime?.location?.street?.name ?? "Unknown"}.`,
          }));
          return JSON.stringify({ location: loc, total: outcomes.length, citations });
        }

        case "crimes_at_location": {
          const crimes = await getCrimesAtLocation(lat ?? 51.5074, lng ?? -0.1278, date);
          const sample = (crimes as any[]).slice(0, 15);
          const citations: Citation[] = sample.map((c: any, i) => ({
            id: `police-uk-at-loc-${i}`,
            source: "data.police.uk/api/crimes-at-location",
            title: `Crime at location: ${c.category} (${c.month})`,
            snippet: `Street: ${c.location?.street?.name ?? "Unknown"}. Outcome: ${c.outcome_status?.category ?? "Pending"}.`,
          }));
          return JSON.stringify({ location: loc, total: crimes.length, citations });
        }

        case "crimes_no_location": {
          if (!force) throw new Error("'force' is required for crimes_no_location");
          const crimes = await getCrimesNoLocation(force, category ?? "all-crime", date);
          const sample = (crimes as any[]).slice(0, 15);
          const citations: Citation[] = sample.map((c: any, i) => ({
            id: `police-uk-no-loc-${i}`,
            source: "data.police.uk/api/crimes-no-location",
            title: `Unlocated crime: ${c.category} (${c.month})`,
            snippet: `Force: ${force}. Outcome: ${c.outcome_status?.category ?? "Pending"}.`,
          }));
          return JSON.stringify({ force, total: crimes.length, citations });
        }

        case "crime_categories": {
          const cats = await getCrimeCategories(date);
          return JSON.stringify({ categories: cats, count: cats.length, source: "data.police.uk/api/crime-categories" });
        }

        case "last_updated": {
          const info = await getCrimeLastUpdated();
          return JSON.stringify({ lastUpdated: info.date, source: "data.police.uk/api/crime-last-updated" });
        }

        case "outcomes_for_crime": {
          if (!persistent_id) throw new Error("'persistent_id' is required for outcomes_for_crime");
          const data = await getOutcomesForCrime(persistent_id);
          return JSON.stringify({ persistent_id, data, source: "data.police.uk/api/outcomes-for-crime" });
        }

        case "availability": {
          const dates = await getAvailability();
          return JSON.stringify({ availableDates: dates.map((d) => d.date), count: dates.length, source: "data.police.uk/api/crimes-street-dates" });
        }

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message, method, source: "data.police.uk" });
    }
  },
});

