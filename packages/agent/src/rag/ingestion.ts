import { ChromaCollectionName } from "@mark43/shared";

export interface DocumentMetadata {
  documentId: string;
  source: string;
  title: string;
  collection: ChromaCollectionName;
  category?: string;
  [key: string]: any;
}

export interface ChunkedDocument {
  id: string;
  text: string;
  metadata: DocumentMetadata & {
    chunkIndex: number;
    totalChunks: number;
    byteSize: number;
    createdAt: string;
  };
}

export interface LineChunkingOptions {
  maxBytesPerChunk?: number; // Chroma hard limit is 16 KiB (16384 bytes); we target 1000-2000 chars
  targetLinesPerChunk?: number;
  overlapLines?: number;
}

/**
 * Line-based chunking strategy respecting Chroma Cloud's 16 KiB limit.
 * Preserves structural paragraph breaks and attaches document IDs for GroupBy deduplication.
 */
export function chunkDocumentByLines(
  content: string,
  docMetadata: DocumentMetadata,
  options: LineChunkingOptions = {}
): ChunkedDocument[] {
  const {
    maxBytesPerChunk = 8192, // Safe margin well below 16 KiB
    targetLinesPerChunk = 20,
    overlapLines = 4,
  } = options;

  const rawLines = content.replace(/\r\n/g, "\n").split("\n");
  const lines = rawLines.map((l) => l.trimEnd());
  
  if (lines.length === 0 || !content.trim()) return [];

  const chunks: { text: string; linesCount: number }[] = [];
  let currentLines: string[] = [];
  let currentBytes = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, "utf-8") + 1; // +1 for newline

    // Check if adding this line would exceed max bytes or target lines count
    if (
      currentLines.length >= targetLinesPerChunk ||
      (currentBytes + lineBytes > maxBytesPerChunk && currentLines.length > 0)
    ) {
      const chunkText = currentLines.join("\n").trim();
      if (chunkText.length > 0) {
        chunks.push({ text: chunkText, linesCount: currentLines.length });
      }

      // Step back for overlap
      const keepCount = Math.min(overlapLines, currentLines.length);
      const overlap = currentLines.slice(currentLines.length - keepCount);
      currentLines = [...overlap, line];
      currentBytes = Buffer.byteLength(currentLines.join("\n"), "utf-8");
    } else {
      currentLines.push(line);
      currentBytes += lineBytes;
    }
  }

  // Push remainder
  if (currentLines.length > 0) {
    const remainingText = currentLines.join("\n").trim();
    if (remainingText.length > 0) {
      chunks.push({ text: remainingText, linesCount: currentLines.length });
    }
  }

  const totalChunks = chunks.length;
  const createdAt = new Date().toISOString();

  return chunks.map((chunk, idx) => {
    const byteSize = Buffer.byteLength(chunk.text, "utf-8");
    return {
      id: `${docMetadata.documentId}_chunk_${idx}`,
      text: chunk.text,
      metadata: {
        ...docMetadata,
        chunkIndex: idx,
        totalChunks,
        byteSize,
        createdAt,
      },
    };
  });
}
