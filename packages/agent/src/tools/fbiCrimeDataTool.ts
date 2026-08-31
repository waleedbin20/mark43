import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Citation } from "@mark43/shared";
import { getConfig } from "../core/config";

// FBI Crime Data Explorer API — free key at https://api.data.gov/signup
const FBI_BASE = "https://api.usa.gov/crime/fbi/sapi/api";

async function fetchFbiNationalSummary(
    crimeType: "violent-crime" | "property-crime",
    fromYear: number,
    toYear: number,
    apiKey: string
): Promise<any> {
    const url = `${FBI_BASE}/summarized/national/${crimeType}/${fromYear}/${toYear}?API_KEY=${apiKey}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`FBI API error: ${res.status} ${res.statusText}`);
    return res.json();
}

async function fetchFbiStateData(
    stateAbbr: string,
    crimeType: "violent-crime" | "property-crime",
    fromYear: number,
    toYear: number,
    apiKey: string
): Promise<any> {
    const url = `${FBI_BASE}/summarized/agencies/byStateAbbr/${stateAbbr}/${crimeType}/${fromYear}/${toYear}?API_KEY=${apiKey}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`FBI state API error: ${res.status}`);
    return res.json();
}

/**
 * Tool: fetch_us_crime_statistics
 * Retrieves US national or state-level crime statistics from the FBI Crime Data Explorer API.
 * Requires FBI_API_KEY env var (free key at https://api.data.gov/signup).
 */
export const fbiCrimeDataTool = new DynamicStructuredTool({
    name: "fetch_us_crime_statistics",
    description:
        "Retrieve US crime statistics from the FBI Crime Data Explorer API (UCR/NIBRS data). Use for national trends, state comparisons, violent vs property crime rates, or cross-jurisdictional US/UK analysis. Requires FBI_API_KEY env var.",
    schema: z.object({
        crime_type: z
            .enum(["violent-crime", "property-crime"])
            .default("violent-crime")
            .describe("Type of crime statistics to retrieve"),
        from_year: z
            .number()
            .int()
            .min(2010)
            .max(2024)
            .default(2019)
            .describe("Start year for trend data"),
        to_year: z
            .number()
            .int()
            .min(2010)
            .max(2024)
            .default(2023)
            .describe("End year for trend data"),
        state: z
            .string()
            .optional()
            .describe(
                "Optional two-letter US state abbreviation (e.g. NY, CA) for state-level data. Omit for national summary."
            ),
    }),
    func: async ({ crime_type, from_year, to_year, state }) => {
        const { FBI_API_KEY } = getConfig();

        if (!FBI_API_KEY) {
            return JSON.stringify({ error: "FBI_API_KEY not set. Get a free key at https://api.data.gov/signup and add it to .env" });
        }

        try {
            const data = state
                ? await fetchFbiStateData(state, crime_type, from_year, to_year, FBI_API_KEY)
                : await fetchFbiNationalSummary(crime_type, from_year, to_year, FBI_API_KEY);

            const rows: any[] = data?.data ?? data?.results ?? [];

            const citations: Citation[] = rows.slice(0, 5).map((row: any, i: number) => ({
                id: `fbi-${crime_type}-${row.year ?? i}`,
                source: "api.usa.gov/crime/fbi/sapi",
                title: `FBI UCR: ${crime_type} ${state ? `(${state})` : "(National)"} ${row.year ?? ""}`,
                snippet: `Year: ${row.year ?? "?"} | Rate: ${row.rate ?? row.actual ?? "N/A"} | Offenses: ${row.total ?? row.actual ?? "N/A"}`,
            }));

            return JSON.stringify({
                crimeType: crime_type,
                scope: state ? `State: ${state}` : "National",
                period: `${from_year}–${to_year}`,
                rowCount: rows.length,
                citations,
                source: "api.usa.gov/crime/fbi/sapi (UCR/NIBRS)",
                jurisdiction: "United States",
            });
        } catch (err: any) {
            return JSON.stringify({ error: err.message, source: "api.usa.gov/crime/fbi/sapi" });
        }
    },
});
