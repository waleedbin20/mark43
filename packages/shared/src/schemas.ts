import { z } from "zod";

// ==========================================
// Chroma Cloud Collection Types & Config
// ==========================================

export const ChromaCollectionNames = [
  "mark43_rms_policies",
  "legal_penal_codes",
  "incident_intelligence",
] as const;

export const ChromaCollectionNameSchema = z.enum(ChromaCollectionNames);
export type ChromaCollectionName = z.infer<typeof ChromaCollectionNameSchema>;

// ==========================================
// Agent Query & Response Schemas
// ==========================================

export const AgentQueryRequestSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  // sessionId drives LangGraph MemorySaver thread_id — must be stable across turns for memory to work
  sessionId: z.string().default("default-session"),
  collection: ChromaCollectionNameSchema.optional().default("mark43_rms_policies"),
  enableHybridSearch: z.boolean().default(true),
});

export type AgentQueryRequest = z.infer<typeof AgentQueryRequestSchema>;

// ==========================================
// Police UK API record type
// ==========================================
export const PoliceCrimeRecordSchema = z.object({
  category: z.string(),
  location_type: z.string().optional(),
  location: z
    .object({
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      street: z
        .object({
          id: z.number().optional(),
          name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  context: z.string().optional(),
  outcome_status: z
    .object({
      category: z.string().optional(),
      date: z.string().optional(),
    })
    .nullable()
    .optional(),
  persistent_id: z.string().optional(),
  id: z.number().optional(),
  location_subtype: z.string().optional(),
  month: z.string(),
});
export type PoliceCrimeRecord = z.infer<typeof PoliceCrimeRecordSchema>;

// Citation schema
export const CitationSchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  documentId: z.string().optional(),
  chunkIndex: z.number().optional(),
  collection: z.string().optional(),
  score: z.number().optional(),
  snippet: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

// Tool Call schema
export const ToolCallLogSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  input: z.record(z.any()),
  output: z.any().optional(),
  status: z.enum(["pending", "success", "error"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
  errorMessage: z.string().optional(),
});

export type ToolCallLog = z.infer<typeof ToolCallLogSchema>;

// Step execution log
export const StepLogSchema = z.object({
  id: z.string(),
  nodeName: z.string(),
  status: z.enum(["started", "completed", "error"]),
  timestamp: z.string(),
  details: z.string().optional(),
});

export type StepLog = z.infer<typeof StepLogSchema>;

// ==========================================
// Server-Sent Events (SSE) Protocol Schemas
// ==========================================

export const SSEEventTypes = [
  "token",
  "node_start",
  "node_end",
  "tool_start",
  "tool_end",
  "citation",
  "log",
  "done",
  "error",
] as const;

export const SSEEventTypeSchema = z.enum(SSEEventTypes);
export type SSEEventType = z.infer<typeof SSEEventTypeSchema>;

export const SSETokenPayloadSchema = z.object({
  token: z.string(),
});

export const SSENodeEventPayloadSchema = z.object({
  node: z.string(),
  step: z.number().optional(),
  description: z.string().optional(),
  timestamp: z.string(),
});

export const SSEToolEventPayloadSchema = z.object({
  toolCall: ToolCallLogSchema,
});

export const SSECitationPayloadSchema = z.object({
  citation: CitationSchema,
});

export const SSEDonePayloadSchema = z.object({
  totalDurationMs: z.number(),
  tokenCount: z.number().optional(),
  finalState: z.record(z.any()).optional(),
});

export const SSEErrorPayloadSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

export const SSEEventEnvelopeSchema = z.object({
  event: SSEEventTypeSchema,
  data: z.any(),
});

export type SSEEventEnvelope = z.infer<typeof SSEEventEnvelopeSchema>;

export const ChromaDocumentChunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  documentId: z.string(),
  chunkIndex: z.number(),
  totalChunks: z.number(),
  source: z.string(),
  title: z.string(),
  collection: ChromaCollectionNameSchema,
  createdAt: z.string(),
});

export type ChromaDocumentChunk = z.infer<typeof ChromaDocumentChunkSchema>;
