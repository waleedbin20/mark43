import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Citation } from "@mark43/shared";
import { searchUnifiedRAG } from "../rag/vectorStore";
import { getGraphStore } from "../rag/graphStore";

/**
 * Extracts candidate entity terms from a query for graph expansion.
 * Uses simple heuristics (noun phrases, known domain keywords) to avoid an extra LLM call.
 */
function extractQueryTerms(query: string): string[] {
    const lower = query.toLowerCase();

    // Domain-specific entity patterns
    const domainPatterns = [
        /\b(?:london|manchester|birmingham|leeds|liverpool|bristol|glasgow|edinburgh|cardiff)\b/gi,
        /\b(?:new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego)\b/gi,
        /\b(?:burglary|robbery|assault|homicide|theft|drug|arson|fraud|cybercrime|terrorism)\b/gi,
        /\b(?:police|officer|dispatch|cad|rms|body cam(?:era)?|taser|facial recognition)\b/gi,
        /\b(?:home office|college of policing|npcc|iacp|fbi|doj|dhs|interpol|europol)\b/gi,
        /\b(?:ai|machine learning|predictive policing|nlp|computer vision|surveillance)\b/gi,
        /\b(?:legislation|policy|statute|act|bill|regulation|guideline|protocol)\b/gi,
        /\b(?:use of force|stop and search|body worn|evidence|custody|custody suite)\b/gi,
    ];

    const terms = new Set<string>();
    terms.add(lower.trim());

    for (const pattern of domainPatterns) {
        let m: RegExpExecArray | null;
        pattern.lastIndex = 0;
        while ((m = pattern.exec(lower)) !== null) {
            terms.add(m[0].trim());
        }
    }

    // Also tokenise multi-word phrases (bigrams + trigrams)
    const words = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
    for (let i = 0; i < words.length - 1; i++) {
        terms.add(`${words[i]} ${words[i + 1]}`);
        if (i < words.length - 2) terms.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }

    return Array.from(terms).slice(0, 20);
}

/**
 * Tool: search_public_safety_knowledge
 *
 * Combines semantic vector search (OpenAI text-embedding-3-small → Chroma) with
 * graph-traversal entity expansion (EntityGraphStore).
 *
 * Graph RAG flow:
 *  1. Semantic search → top-5 vector-similar chunks
 *  2. Extract entity terms from query
 *  3. Look up those terms in the entity graph → related chunk IDs (one-hop expansion)
 *  4. Fetch graph-expanded chunks from Chroma by ID
 *  5. Merge, deduplicate, re-rank by combined score
 */
export const graphRagTool = new DynamicStructuredTool({
    name: "search_public_safety_knowledge",
    description:
        "Search the public safety knowledge base using Graph RAG (semantic vector search + entity graph expansion). Use for questions about UK/US policing policies, technology, legislation, crime analytics, officer welfare, or research. This tool retrieves from ingested College of Policing and Gov.uk content.",
    schema: z.object({
        query: z.string().describe("The question or topic to search for in the knowledge base"),
        top_k: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .default(5)
            .describe("Number of results to return (default 5)"),
    }),
    func: async ({ query, top_k }): Promise<string> => {
        const topK = top_k ?? 5;
        const graphStore = getGraphStore();

        // Step 1: Standard semantic retrieval
        const semanticResult = await searchUnifiedRAG({ query, topK });
        const semanticCitations = semanticResult.citations;

        // Step 2: Graph entity expansion
        const queryTerms = extractQueryTerms(query);
        const graphChunkIds = graphStore.getRelatedChunkIds(queryTerms, topK);

        // Step 3: Fetch graph-expanded chunks that weren't in semantic results
        const semanticIds = new Set(semanticCitations.map((c) => c.id));
        const expansionIds = graphChunkIds.filter((id) => !semanticIds.has(id));

        let expansionCitations: Citation[] = [];
        if (expansionIds.length > 0) {
            const expansionResult = await searchUnifiedRAG({
                query,
                topK: Math.min(expansionIds.length, 3),
                chunkIdFilter: expansionIds,
            });
            expansionCitations = expansionResult.citations;
        }

        // Step 4: Merge — semantic results first, then graph expansions (de-duped)
        const merged = [...semanticCitations, ...expansionCitations].slice(0, topK + 2);

        const stats = graphStore.getStats();

        return JSON.stringify({
            query,
            citations: merged,
            semanticCount: semanticCitations.length,
            graphExpansionCount: expansionCitations.length,
            graphStats: stats,
            retrievalMethod: "GraphRAG: OpenAI text-embedding-3-small (dense) + entity graph expansion",
        });
    },
});
