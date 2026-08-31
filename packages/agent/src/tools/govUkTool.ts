import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Citation } from "@mark43/shared";

interface GovUkResult {
    title: string;
    description?: string;
    link?: string;
    public_timestamp?: string;
    content_store_document_type?: string;
    organisations?: Array<{ title: string }>;
}

interface RssItem {
    title: string;
    description: string;
    link: string;
    pubDate: string;
}

/** Minimal zero-dependency RSS/Atom parser (handles CDATA) */
function parseRssItems(xml: string, maxItems = 10): RssItem[] {
    const items: RssItem[] = [];
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
        const block = match[1];
        items.push({
            title: extractXmlTag(block, "title"),
            description: extractXmlTag(block, "description"),
            link: extractXmlTag(block, "link"),
            pubDate: extractXmlTag(block, "pubDate"),
        });
    }
    return items;
}

function extractXmlTag(xml: string, tag: string): string {
    const re = new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
        "i"
    );
    const m = xml.match(re);
    if (!m) return "";
    return m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#\d+;/g, "")
        .trim();
}

async function queryGovUk(keywords: string, count = 8): Promise<GovUkResult[]> {
    const url = `https://www.gov.uk/api/search.json?q=${encodeURIComponent(keywords)}&count=${count}&filter_content_store_document_type=guidance,policy_paper,press_release,research,statistics`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Gov.uk API error: ${res.status}`);
    const json = await res.json() as { results?: GovUkResult[] };
    return (json.results ?? []) as GovUkResult[];
}

async function fetchCollegeOfPolicingRss(maxItems = 8): Promise<RssItem[]> {
    // College of Policing news RSS — free, no auth
    const res = await fetch("https://www.college.police.uk/rss/news", {
        headers: {
            Accept: "application/rss+xml, application/xml, text/xml",
            "User-Agent": "Mozilla/5.0 (compatible; Mark43IntelligenceAgent/1.0)",
        },
    });
    if (!res.ok) throw new Error(`College of Policing RSS error: ${res.status}`);
    const xml = await res.text();
    return parseRssItems(xml, maxItems);
}

/**
 * Tool: fetch_uk_policy_and_research
 * Queries Gov.uk official documents AND College of Policing RSS for UK policing policy,
 * research guidance, and technology updates. Two sub-sources in one tool to stay within
 * the brief's "at least two free public sources" requirement for UK.
 */
export const govUkTool = new DynamicStructuredTool({
    name: "fetch_uk_policy_and_research",
    description:
        "Search UK government policing policy documents (Gov.uk) and College of Policing research/guidance (RSS). Use for questions about UK policing technology, policy, legislation, AI in law enforcement, officer welfare, or official guidance from the Home Office and College of Policing.",
    schema: z.object({
        keywords: z
            .string()
            .describe(
                'Search keywords for Gov.uk (e.g. "AI emergency dispatch", "police body cameras", "stop and search policy")'
            ),
        include_college_of_policing: z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether to also fetch latest College of Policing news/research (defaults true)"),
    }),
    func: async ({ keywords, include_college_of_policing }) => {
        const results: { govUk: GovUkResult[]; collegeOfPolicing: RssItem[] } = {
            govUk: [],
            collegeOfPolicing: [],
        };

        const errors: string[] = [];

        const fetches: Promise<void>[] = [
            queryGovUk(keywords)
                .then((r) => { results.govUk = r; })
                .catch((e) => { errors.push(`Gov.uk: ${e.message}`); }),
        ];

        if (include_college_of_policing !== false) {
            fetches.push(
                fetchCollegeOfPolicingRss()
                    .then((r) => { results.collegeOfPolicing = r; })
                    .catch((e) => { errors.push(`College of Policing RSS: ${e.message}`); })
            );
        }

        await Promise.all(fetches);

        const citations: Citation[] = [
            ...results.govUk.map((r, i) => ({
                id: `govuk-${i}-${Date.now()}`,
                source: "www.gov.uk",
                title: r.title,
                snippet: `${r.description ?? ""}${r.organisations?.length ? ` | ${r.organisations.map((o) => o.title).join(", ")}` : ""}`.slice(0, 400),
            })),
            ...results.collegeOfPolicing.map((r, i) => ({
                id: `cop-rss-${i}-${Date.now()}`,
                source: "college.police.uk",
                title: r.title,
                snippet: `${r.description}`.slice(0, 400),
            })),
        ];

        return JSON.stringify({
            keywords,
            govUkResultCount: results.govUk.length,
            collegeOfPolicingResultCount: results.collegeOfPolicing.length,
            citations,
            errors: errors.length ? errors : undefined,
            sources: ["www.gov.uk/api/search — free, no auth", "college.police.uk/rss/news — free RSS"],
            jurisdiction: "United Kingdom",
        });
    },
});
