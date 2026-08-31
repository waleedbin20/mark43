import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Citation } from "@mark43/shared";
import { getConfig } from "../core/config";

// FBI Crime Data Explorer (CDE) API — free key at https://api.data.gov/signup
const FBI_BASE = "https://api.usa.gov/crime/fbi/cde";
const CDE_VIEWER = "https://cde.ucr.cjis.gov";

interface FbiSummarized {
    offenses?: {
        rates?: Record<string, Record<string, number>>;
        actuals?: Record<string, Record<string, number>>;
    };
}

async function fetchFbiSummarized(
    scopePath: string,
    crimeType: "violent-crime" | "property-crime",
    fromYear: number,
    toYear: number,
    apiKey: string
): Promise<FbiSummarized> {
    // The CDE summarized endpoint expects MM-YYYY bounds and returns monthly series.
    const url = `${FBI_BASE}/summarized/${scopePath}/${crimeType}?from=01-${fromYear}&to=12-${toYear}&API_KEY=${apiKey}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`FBI API error: ${res.status} ${res.statusText}`);
    return (await res.json()) as FbiSummarized;
}

/** Picks the "...Offenses" series (not "...Clearances") from a CDE label map. */
function pickOffenceSeries(
    map: Record<string, Record<string, number>> | undefined
): Record<string, number> | null {
    if (!map) return null;
    const label = Object.keys(map).find((l) => /offenses/i.test(l)) ?? Object.keys(map)[0];
    return label ? map[label] : null;
}

/** Aggregates a MM-YYYY series into per-year totals and averages. */
function aggregateByYear(series: Record<string, number>): Record<string, { total: number; avg: number }> {
    const buckets: Record<string, number[]> = {};
    for (const [key, value] of Object.entries(series)) {
        const year = key.split("-")[1] ?? key;
        (buckets[year] ??= []).push(value);
    }

    const result: Record<string, { total: number; avg: number }> = {};
    for (const [year, values] of Object.entries(buckets)) {
        const total = values.reduce((s, v) => s + v, 0);
        result[year] = { total, avg: total / values.length };
    }
    return result;
}

/**
 * Tool: fetch_us_crime_statistics
 * Retrieves US national or state-level crime statistics from the FBI Crime Data Explorer (CDE) API.
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
            const scopePath = state ? `state/${state.toUpperCase()}` : "national";
            const data = await fetchFbiSummarized(scopePath, crime_type, from_year, to_year, FBI_API_KEY);

            const offenceCounts = pickOffenceSeries(data.offenses?.actuals);
            const offenceRates = pickOffenceSeries(data.offenses?.rates);

            if (!offenceCounts && !offenceRates) {
                return JSON.stringify({
                    error: "FBI API returned no offence data for this scope/period",
                    scope: state ? `State: ${state}` : "National",
                    period: `${from_year}-${to_year}`,
                });
            }

            const countsByYear = offenceCounts ? aggregateByYear(offenceCounts) : {};
            const ratesByYear = offenceRates ? aggregateByYear(offenceRates) : {};
            const years = Array.from(
                new Set([...Object.keys(countsByYear), ...Object.keys(ratesByYear)])
            ).sort();

            const scopeLabel = state ? state.toUpperCase() : "National";

            const citations: Citation[] = years.map((year) => {
                const total = countsByYear[year]?.total;
                const avgRate = ratesByYear[year]?.avg;
                return {
                    id: `fbi-${crime_type}-${scopeLabel}-${year}`,
                    source: CDE_VIEWER,
                    title: `FBI CDE: ${crime_type} (${scopeLabel}) ${year}`,
                    snippet: `Year ${year}: ${total != null ? `${total.toLocaleString()} offences` : "offences N/A"}${avgRate != null ? `, avg monthly rate ${avgRate.toFixed(2)} per 100k` : ""}.`,
                };
            });

            const yearly = years.map((year) => ({
                year,
                totalOffences: countsByYear[year]?.total ?? null,
                avgMonthlyRatePer100k: ratesByYear[year]?.avg != null ? Number(ratesByYear[year].avg.toFixed(2)) : null,
            }));

            return JSON.stringify({
                crimeType: crime_type,
                scope: state ? `State: ${state.toUpperCase()}` : "National",
                period: `${from_year}-${to_year}`,
                yearly,
                citations,
                source: "FBI Crime Data Explorer (api.usa.gov/crime/fbi/cde, UCR/NIBRS)",
                jurisdiction: "United States",
            });
        } catch (err: any) {
            return JSON.stringify({ error: err.message, source: "api.usa.gov/crime/fbi/cde" });
        }
    },
});
