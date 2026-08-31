import { ExternalLink, FileText } from "lucide-react";
import { Citation } from "@mark43/shared";

interface CitationListProps {
    citations: Citation[];
}

/** Builds a clickable URL from a citation source or snippet, or null if none. */
function resolveCitationUrl(citation: Citation): string | null {
    const source = citation.source?.trim() ?? "";

    if (/^https?:\/\//i.test(source)) return source;

    // Many sources are bare hosts/paths, e.g. "www.gov.uk/government/publications/...".
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(source)) return `https://${source}`;

    // Gov.uk RAG chunks embed a "URL: https://..." line in the snippet.
    const urlInSnippet = citation.snippet?.match(/https?:\/\/\S+/);
    return urlInSnippet ? urlInSnippet[0] : null;
}

export function CitationList({ citations }: CitationListProps) {
    if (!citations || citations.length === 0) return null;

    // De-duplicate by title so the same document is not listed twice.
    const seen = new Set<string>();
    const unique = citations.filter((c) => {
        const key = c.title || c.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return (
        <div className="pt-3 mt-2 border-t border-slate-700/50">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-cyan-400" />
                Sources ({unique.length})
            </p>
            <ol className="space-y-1.5">
                {unique.map((citation, index) => {
                    const url = resolveCitationUrl(citation);
                    return (
                        <li key={citation.id} className="flex gap-2 text-xs">
                            <span className="text-slate-500 shrink-0">[{index + 1}]</span>
                            {url ? (
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-cyan-400 hover:text-cyan-300 hover:underline decoration-cyan-500/40 inline-flex items-start gap-1 group"
                                    title={url}
                                >
                                    <span>{citation.title}</span>
                                    <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 opacity-60 group-hover:opacity-100" />
                                </a>
                            ) : (
                                <span className="text-slate-300">{citation.title}</span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
