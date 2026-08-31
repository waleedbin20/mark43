import {
  CloudClient,
  Schema,
  VectorIndexConfig,
  SparseVectorIndexConfig,
  K,
  Search,
  Knn,
  Rrf,
  GroupBy,
  MinK,
} from "chromadb";
import { ChromaCloudSpladeEmbeddingFunction } from "@chroma-core/chroma-cloud-splade";
import { OpenAIEmbeddingFunction } from "@chroma-core/openai";
import { getConfig } from "../core/config";
import { Citation, ChromaCollectionName } from "@mark43/shared";
import { ChunkedDocument } from "./ingestion";

export interface ChromaSearchResult {
  id: string;
  document: string;
  metadata: Record<string, any>;
  score?: number;
}

let _cloudClient: CloudClient | null = null;

/**
 * Returns a configured Chroma Cloud Client
 */
export function getChromaCloudClient(): CloudClient | null {
  const config = getConfig();

  if (!config.CHROMA_API_KEY) {
    console.warn(
      "⚠️ CHROMA_API_KEY is not set. Chroma Cloud operations will run in local simulation fallback."
    );
    return null;
  }

  if (!_cloudClient) {
    _cloudClient = new CloudClient({
      apiKey: config.CHROMA_API_KEY,
      tenant: config.CHROMA_TENANT,
      database: config.CHROMA_DATABASE,
    });
  }

  return _cloudClient;
}

/**
 * Creates or retrieves a sharded collection configured with Dense (Qwen) + Sparse (Splade) Hybrid Search schema.
 */
export async function getOrCreateShardedCollection(collectionName: ChromaCollectionName) {
  const client = getChromaCloudClient();
  if (!client) return null;

  try {
    const config = getConfig();

    // Dense: OpenAI text-embedding-3-small via Chroma's registered embedding
    // function, so Chroma persists it and reconstructs it at search time.
    const denseEf = new OpenAIEmbeddingFunction({
      apiKey: config.OPENAI_API_KEY || "missing-key",
      modelName: config.OPENAI_EMBEDDING_MODEL,
    });

    // Sparse: Chroma Cloud Splade (server-side BM25-style lexical retrieval)
    const sparseEf = new ChromaCloudSpladeEmbeddingFunction({
      apiKeyEnvVar: "CHROMA_API_KEY",
    });

    // Schema holds both the dense and sparse indexes. The dense vector index is
    // set globally (no key); the sparse index lives on the "sparse_embedding" key.
    const schema = new Schema();

    schema.createIndex(
      new VectorIndexConfig({
        sourceKey: K.DOCUMENT,
        embeddingFunction: denseEf,
      })
    );

    schema.createIndex(
      new SparseVectorIndexConfig({
        sourceKey: K.DOCUMENT,
        embeddingFunction: sparseEf,
      }),
      "sparse_embedding"
    );

    // Pass only the schema. Passing embeddingFunction here too would conflict
    // ("Cannot set both collection config and schema simultaneously").
    const collection = await client.getOrCreateCollection({
      name: collectionName,
      schema,
    });

    return collection;
  } catch (err: any) {
    console.error(`Failed to get/create collection "${collectionName}":`, err.message);
    return null;
  }
}

/**
 * Executes Hybrid Search (Dense + Sparse via RRF) with GroupBy document-level deduplication.
 */
export async function searchChromaCloudHybrid(options: {
  query: string;
  collectionName: ChromaCollectionName;
  topK?: number;
  enableRrf?: boolean;
  deduplicateByDocumentId?: boolean;
  chunkIdFilter?: string[];
}): Promise<{
  success: boolean;
  results: ChromaSearchResult[];
  citations: Citation[];
  summary: string;
}> {
  const {
    query,
    collectionName,
    topK = 3,
    enableRrf = true,
    deduplicateByDocumentId = true,
  } = options;

  const client = getChromaCloudClient();

  if (!client) {
    return {
      success: false,
      results: [],
      citations: [],
      summary: "CHROMA_API_KEY not configured. Falling back to local knowledge base.",
    };
  }

  try {
    const collection = await getOrCreateShardedCollection(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} could not be initialized`);
    }

    // Build Search Expression with RRF Hybrid ranking & GroupBy
    let search = new Search();

    if (enableRrf) {
      // Reciprocal Rank Fusion combining Dense (Qwen) and Sparse (Splade)
      search = search.rank(
        Rrf({
          ranks: [
            Knn({ query, returnRank: true }),
            Knn({ query, key: "sparse_embedding", returnRank: true }),
          ],
          k: 60,
        })
      );
    } else {
      search = search.rank(Knn({ query, returnRank: true }));
    }

    // Deduplicate multiple chunks from the same source document using GroupBy
    if (deduplicateByDocumentId) {
      search = search.groupBy(
        new GroupBy([K("documentId")], new MinK([K.SCORE], 1))
      );
    }

    search = search.limit(topK).select([K.DOCUMENT, K.SCORE, "documentId", "title", "source"]);

    const searchResponse = await collection.search(search);

    const results: ChromaSearchResult[] = [];
    const citations: Citation[] = [];

    // Extract returned rows
    if (searchResponse && Array.isArray(searchResponse)) {
      for (const row of searchResponse) {
        const item: ChromaSearchResult = {
          id: (row as any).id || `chroma-${Math.random()}`,
          document: (row as any).document || "",
          metadata: (row as any).metadata || {},
          score: (row as any).score,
        };
        results.push(item);

        citations.push({
          id: item.id,
          source: item.metadata.source || collectionName,
          title: item.metadata.title || "Chroma Cloud Document",
          documentId: item.metadata.documentId,
          collection: collectionName,
          score: item.score,
          snippet: item.document.slice(0, 300) + (item.document.length > 300 ? "..." : ""),
        });
      }
    }

    return {
      success: true,
      results,
      citations,
      summary: `Chroma Cloud Hybrid Search matched ${citations.length} document(s) in collection "${collectionName}".`,
    };
  } catch (err: any) {
    console.error("Chroma Cloud Search failed:", err.message);
    return {
      success: false,
      results: [],
      citations: [],
      summary: `Chroma Cloud search error: ${err.message}`,
    };
  }
}

/**
 * Ingests chunked documents into a Chroma Cloud collection.
 */
export async function addChunksToChroma(
  collectionName: ChromaCollectionName,
  chunks: ChunkedDocument[]
): Promise<boolean> {
  const collection = await getOrCreateShardedCollection(collectionName);
  if (!collection) return false;

  try {
    const ids = chunks.map((c) => c.id);
    const documents = chunks.map((c) => c.text);
    const metadatas = chunks.map((c) => c.metadata);

    await collection.add({
      ids,
      documents,
      metadatas,
    });

    return true;
  } catch (err: any) {
    console.error(`Failed to add chunks to Chroma collection "${collectionName}":`, err.message);
    return false;
  }
}
