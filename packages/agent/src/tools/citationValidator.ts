import { Citation } from "@mark43/shared";

const REACHABILITY_TIMEOUT_MS = 5000;
const USER_AGENT = "Mozilla/5.0 (compatible; Mark43IntelligenceAgent/1.0)";

/**
 * Resolves a citation to a clickable URL, mirroring the frontend logic:
 * absolute URLs pass through, bare hosts/paths get https://, otherwise a URL is
 * pulled from the snippet. Returns null when no URL can be formed.
 */
function resolveCitationUrl(citation: Citation): string | null {
    const source = (citation.source ?? "").trim();
    if (/^https?:\/\//i.test(source)) return source;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(source)) return `https://${source}`;
    const match = citation.snippet?.match(/https?:\/\/\S+/);
    return match ? match[0] : null;
}

/** Returns true if the URL responds with a non-error status within the timeout. */
async function isReachable(url: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);

    try {
        const headers = { "User-Agent": USER_AGENT };
        const res = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            signal: controller.signal,
            headers,
        });

        if (res.ok) return true;

        // Many servers mishandle HEAD (returning 403/404/405). Confirm with a GET
        // before treating the URL as broken.
        const getRes = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers,
        });

        return getRes.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Drops citations whose resolved URL is unreachable (404, network error, timeout).
 * Citations without any URL are kept as plain data references. URLs are checked
 * once each, in parallel, and cached within the call to avoid duplicate requests.
 */
export async function filterValidCitations(citations: Citation[]): Promise<Citation[]> {
    if (citations.length === 0) return citations;

    const urlByCitation = new Map<Citation, string | null>();
    const uniqueUrls = new Set<string>();

    for (const citation of citations) {
        const url = resolveCitationUrl(citation);
        urlByCitation.set(citation, url);
        if (url) uniqueUrls.add(url);
    }

    const reachability = new Map<string, boolean>();
    await Promise.all(
        Array.from(uniqueUrls).map(async (url) => {
            reachability.set(url, await isReachable(url));
        })
    );

    return citations.filter((citation) => {
        const url = urlByCitation.get(citation);
        if (!url) return true; // no link to break, keep as a data reference
        return reachability.get(url) === true;
    });
}
