import { Citation, ChromaCollectionName } from "@mark43/shared";
import { searchChromaCloudHybrid } from "./chromaCloud";

export interface UnifiedSearchResult {
  citations: Citation[];
  summary: string;
  source: "chroma_cloud" | "unavailable";
}

/**
 * Unified RAG search: Queries Chroma Cloud with Hybrid Search (OpenAI dense + Splade sparse + RRF).
 * Returns empty citations if Chroma Cloud is not configured — no fake fallback data.
 */
export async function searchUnifiedRAG(options: {
  query: string;
  collection?: ChromaCollectionName;
  topK?: number;
  enableHybrid?: boolean;
  chunkIdFilter?: string[];
}): Promise<UnifiedSearchResult> {
  const {
    query,
    collection = "mark43_rms_policies",
    topK = 3,
    enableHybrid = true,
    chunkIdFilter,
  } = options;

  const cloudResult = await searchChromaCloudHybrid({
    query,
    collectionName: collection,
    topK,
    enableRrf: enableHybrid,
    deduplicateByDocumentId: true,
    chunkIdFilter,
  });

  if (cloudResult.success && cloudResult.citations.length > 0) {
    return {
      citations: cloudResult.citations,
      summary: cloudResult.summary,
      source: "chroma_cloud",
    };
  }

  return {
    citations: [],
    summary: cloudResult.success
      ? `No documents found in collection "${collection}" for this query. Run \`pnpm --filter @mark43/agent seed:chroma\` to ingest data.`
      : `Chroma Cloud unavailable — set CHROMA_API_KEY and seed the knowledge base.`,
    source: "unavailable",
  };
}

