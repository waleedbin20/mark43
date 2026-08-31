# Mark43 Public Safety Intelligence Agent — Architecture Guide

> This document covers system design, data sources, LLM decisions, and answers the presentation Q&A.
> Keep this open during your live walkthrough.

---

## Table of Contents

1. [What the agent does](#1-what-the-agent-does)
2. [Architecture overview](#2-architecture-overview)
3. [Data sources](#3-data-sources)
4. [Orchestration — the LangGraph ReAct loop](#4-orchestration--the-langgraph-react-loop)
5. [RAG pipeline](#5-rag-pipeline)
6. [Session memory](#6-session-memory)
7. [Police UK API — full coverage & rate limiting](#7-police-uk-api--full-coverage--rate-limiting)
8. [Security, validation & real-time context](#8-security-validation--real-time-context)
9. [LLM choice & justification](#9-llm-choice--justification)
10. [Setup & running](#10-setup--running)
11. [Presentation Q&A](#11-presentation-qa)

---

## 1. What the agent does

The agent is a **public safety intelligence analyst** that autonomously gathers information from real public data sources — UK police data, Gov.uk policy, US FBI statistics — and synthesises it into structured briefings for law enforcement and public safety professionals.

**In scope:**
- Agentic tool-calling loop (ReAct via LangGraph)
- Hybrid RAG over ingested UK policing corpus (Graph RAG + semantic search)
- All Police UK API endpoints with proper rate limiting
- FBI Crime Data Explorer CDE API (US statistics)
- Session memory (MemorySaver + summarisation at 10-message threshold)
- Input sanitisation and prompt-injection screening
- Citation reachability validation (the UI never shows a dead link)
- Real-time date awareness for recency questions
- Read-only introspection endpoints (graph, session memory, entity store)
- SSE streaming from Express → React frontend with markdown + clickable citations

**Explicitly out of scope:**
- Authentication / multi-user auth (would add auth middleware in production)
- Persistent database (MemorySaver is in-process; would swap for PostgreSQL checkpointer)
- Production deployment / observability (LangSmith tracing ready to enable)

---

## 2. Architecture overview

The system has three layers, each with a single job:

- **Web (React + Vite).** A chat UI that opens one Server-Sent Events connection per query and renders events as they stream in: node steps, tool calls, citations, and the final briefing.
- **API (Express).** A thin transport layer. It validates the request, runs the agent graph, and maps each graph update to an SSE event. It owns no agent logic, only security middleware and the wire format.
- **Agent (LangGraph).** The brain. A `StateGraph` of three nodes (planner, dispatcher, synthesiser) runs the ReAct loop, calls tools, retrieves from RAG, and keeps per-session memory through a checkpointer.

State flows one way on each step: a node returns a partial state, LangGraph merges it through reducers, and the API streams the delta to the browser. The same `sessionId` is reused across turns so the checkpointer can restore prior context.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                             │
│                                                                     │
│  ChatPane ──► useAgentStream (SSE reader) ──► /api/agent/stream    │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │ Server-Sent Events (text/event-stream)
┌───────────────────────────────────▼─────────────────────────────────┐
│  Express API  (apps/api)                                            │
│                                                                     │
│  POST /api/agent/stream                                             │
│    ├── Validates body with Zod (AgentQueryRequestSchema)            │
│    └── graph.stream(state, { thread_id: sessionId })  ──────────┐  │
└──────────────────────────────────────────────────────────────────┼──┘
                                                                   │
┌──────────────────────────────────────────────────────────────────▼──┐
│  LangGraph StateGraph  (packages/agent/src/agent/)                  │
│                                                                     │
│  START                                                              │
│    │                                                                │
│    ▼                                                                │
│  ┌─────────────────────┐                                            │
│  │ intelligencePlanner │◄────────────────────────┐                 │
│  │  (LLM + bindTools)  │                         │                 │
│  └────────┬────────────┘                         │                 │
│           │                                      │                 │
│    has tool_calls?                               │                 │
│           │                                      │                 │
│     YES   │    NO                                │                 │
│           ▼     ▼                                │                 │
│  ┌────────────┐  ┌──────────────────────────┐    │                 │
│  │  tool      │  │ intelligenceSynthesiser   │    │                 │
│  │ Dispatcher │  │  (structured briefing)   │    │                 │
│  └─────┬──────┘  └──────────────────────────┘    │                 │
│        │                     │                   │                 │
│        │  ToolMessages       │                   │                 │
│        └─────────────────────┼───────────────────┘                 │
│                              ▼                                      │
│                             END                                     │
│                                                                     │
│  Checkpointer: MemorySaver (thread_id = sessionId)                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Monorepo structure

```
mark43/
├── apps/
│   ├── api/            Express + SSE streaming endpoint
│   │   └── src/
│   │       ├── middleware/  security (helmet/cors), rateLimiter, errorHandler
│   │       ├── routes/      agent (SSE stream), introspect (graph/memory/store), health
│   │       ├── mappers/     agentEventMapper (graph output -> SSE events)
│   │       ├── utils/       sse (writer + headers)
│   │       └── config/      env (typed env access)
│   └── web/            React 18 + Vite + Tailwind chat UI
├── packages/
│   ├── agent/          LangGraph agent, tools, RAG pipeline
│   │   └── src/
│   │       ├── agent/     graph.ts, state.ts, memory.ts
│   │       │   └── nodes/   plannerNode, toolDispatcherNode,
│   │       │                synthesiserNode, formatCitations
│   │       ├── prompts/   planner / synthesiser / summariser prompts,
│   │       │              humanizer output rules, real-time date context
│   │       ├── security/  inputSanitizer (prompt-injection guard)
│   │       ├── tools/     7 tools + shared rate limiter + citationValidator
│   │       ├── rag/       chromaCloud, vectorStore, graphStore,
│   │       │              ingestion (chunking), migrate (seeding)
│   │       └── core/      config.ts (Zod), llm.ts (LLM factory)
│   ├── shared/         Zod schemas shared across all packages
│   ├── typescript-config/
│   └── eslint-config/
├── turbo.json          Turborepo task pipeline
└── pnpm-workspace.yaml
```

### Component responsibilities

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| **Frontend** | `useAgentStream.ts` | Opens the SSE connection, holds a stable `sessionId`, renders streamed events |
| **API** | `routes/agent.ts` | Validates the request (Zod), streams the graph, delegates wire-format to the mapper |
| **API** | `mappers/agentEventMapper.ts` | Turns each graph node output into SSE events (citations, logs, tokens) |
| **API** | `middleware/` | helmet headers, CORS, per-IP rate limiting, central error handling |
| **Agent** | `agent/graph.ts` | Wires the three nodes into the ReAct loop, owns the checkpointer |
| **Agent** | `agent/nodes/` | Planner (reason), dispatcher (act), synthesiser (write) |
| **Agent** | `prompts/` | All system prompts in one place, including the humanizer output rules |
| **Agent** | `security/` | Sanitises and screens the user query before it reaches the LLM |
| **Agent** | `tools/` | 7 LLM-callable tools (RAG + live APIs) sharing a rate limiter |
| **Agent** | `tools/citationValidator.ts` | Drops citations whose links are unreachable before they reach the UI |
| **Agent** | `rag/` | Chunking, ingestion, hybrid vector search, entity graph |
| **API** | `routes/introspect.ts` | Read-only endpoints exposing the graph, session memory, and entity store |

### Request lifecycle (one query, end to end)

1. **Browser.** `useAgentStream` POSTs `{ query, sessionId, enableHybridSearch }` to `/api/agent/stream` and starts reading the SSE stream.
2. **Validate.** The route parses the body with `AgentQueryRequestSchema` (Zod). Invalid bodies get a 400 before any work runs. Rate limiting and helmet headers are already applied by middleware.
3. **Stream the graph.** The route calls `graph.stream(state, { thread_id: sessionId })`. The checkpointer loads any earlier state for that session.
4. **Sanitise.** The planner runs `sanitiseUserQuery` on the input, strips control characters, caps length, and flags injection patterns.
5. **Reason and act.** The planner calls tools, the dispatcher executes them, collects citations, and drops any whose links are unreachable. Control loops back until the planner stops (or the iteration cap is hit).
6. **Synthesise.** The synthesiser turns the gathered citations into a briefing, applying the humanizer output rules.
7. **Map to SSE.** For every node update, `agentEventMapper` emits `node_start`, `citation`, `tool_end`, `log`, `token`, and `node_end` events. The browser renders each as it arrives.
8. **Persist.** The checkpointer saves the final state under `sessionId`, ready for the next follow-up question.

---

## 3. Data sources

### Live API sources (called at query time)

| Source | Coverage | Auth | Rate limit | Links |
|--------|----------|------|-----------|-------|
| **data.police.uk** | England, Wales, Northern Ireland — crimes, outcomes, forces, neighbourhoods, stop & search | None required | **15 req/s avg, burst 30** (token bucket enforced) | [API docs](https://data.police.uk/docs/) |
| **www.gov.uk/api/search.json** | UK government policy papers, guidance, statistics, press releases | None required | Polite use | [Gov.uk Content API](https://docs.publishing.service.gov.uk/api/content-api) |
| **college.police.uk/rss/news** | College of Policing research news & publications | None required | Polite use | [College of Policing](https://college.police.uk/) |
| **api.usa.gov/crime/fbi/cde** | US national & state crime statistics (UCR / NIBRS), summarised by year | Free key ([api.data.gov/signup](https://api.data.gov/signup)) | Free tier | [FBI Crime Data Explorer](https://cde.ucr.cjis.gov/) |

> The FBI tool calls the current CDE `summarized/national/{offense}` and `summarized/state/{ST}/{offense}` endpoints (the older `sapi` API is deprecated and returns 404). It aggregates the monthly series the API returns into per-year totals and rates.

### Police UK API — full endpoint coverage

All endpoints are now implemented across 4 purpose-built tools, sharing one rate limiter:

#### `fetch_uk_crime_data` — crime endpoints
| Method | API endpoint | What it returns |
|--------|-------------|-----------------|
| `street_crimes` | `/api/crimes-street/{category}` | Crimes near a lat/lng point |
| `outcomes_at_location` | `/api/outcomes-at-location` | Case outcomes near a lat/lng |
| `crimes_at_location` | `/api/crimes-at-location` | Crimes snapped to nearest location |
| `crimes_no_location` | `/api/crimes-no-location` | Force-level crimes with no location |
| `crime_categories` | `/api/crime-categories` | Full crime category taxonomy |
| `last_updated` | `/api/crime-last-updated` | Date data was last refreshed |
| `outcomes_for_crime` | `/api/outcomes-for-crime/{id}` | All outcomes for a specific crime |
| `availability` | `/api/crimes-street-dates` | Which months have data |

#### `fetch_uk_force_info` — force endpoints
| Method | API endpoint | What it returns |
|--------|-------------|-----------------|
| `list` | `/api/forces` | All 43+ forces |
| `detail` | `/api/forces/{id}` | Full force profile |
| `senior_officers` | `/api/forces/{id}/people` | Leadership team |

#### `fetch_uk_neighbourhood_data` — neighbourhood endpoints
| Method | API endpoint | What it returns |
|--------|-------------|-----------------|
| `list` | `/api/{force}/neighbourhoods` | All neighbourhoods for a force |
| `detail` | `/api/{force}/{neighbourhood}` | Neighbourhood profile |
| `boundary` | `/api/{force}/{neighbourhood}/boundary` | Polygon boundary coords |
| `team` | `/api/{force}/{neighbourhood}/people` | Officer team |
| `events` | `/api/{force}/{neighbourhood}/events` | Community events |
| `priorities` | `/api/{force}/{neighbourhood}/priorities` | Current policing priorities |
| `locate` | `/api/locate-neighbourhood?q=lat,lng` | Find neighbourhood from GPS |

#### `fetch_uk_stop_search` — stop and search endpoints
| Method | API endpoint | What it returns |
|--------|-------------|-----------------|
| `by_area` | `/api/stops-street` | Stop & search near a point |
| `at_location` | `/api/stops-at-location` | Stops at a specific location_id |
| `no_location` | `/api/stops-no-location` | Force-level stops with no location |
| `by_force` | `/api/stops-force` | All stops for a force |

### Ingested corpus (RAG / offline)

Seeded at setup time via `pnpm --filter @mark43/agent seed:chroma`:

| Source | Collection | Content |
|--------|-----------|---------|
| Gov.uk Search API (3 queries) | `mark43_rms_policies`, `incident_intelligence` | AI policing, crime prevention policy, emergency services |
| College of Policing RSS (best-effort) | `mark43_rms_policies` | Research news, professional standards (the site sometimes returns 403 to bots; ingestion skips it gracefully) |
| data.police.uk crime categories | `incident_intelligence` | Official crime category taxonomy |

---

## 4. Orchestration — the LangGraph ReAct loop

The agent is **three nodes** wired into a graph. Each node is a pure function `(state) => partialState`, and LangGraph merges the returned partial into shared state through reducers (see `state.ts`).

| Node | File | Responsibility |
|------|------|----------------|
| `intelligencePlanner` | `agent/nodes/plannerNode.ts` | Reason about the query, decide which tools to call or when to stop |
| `toolDispatcher` | `agent/nodes/toolDispatcherNode.ts` | Execute the planner's tool calls, collect citations and logs |
| `intelligenceSynthesiser` | `agent/nodes/synthesiserNode.ts` | Turn the accumulated citations into the final briefing |

**The loop, step by step:**

1. **Plan.** The planner receives the system prompt, conversation history, and all 7 tool schemas (via `bindTools()`). The LLM decides what to do next.
2. **Route.** `shouldCallTools()` in `graph.ts` inspects the last message. If it holds `tool_calls`, control goes to the dispatcher; otherwise it goes to the synthesiser. This is the only routing logic, and it follows the LLM's output, not keywords.
3. **Act.** The dispatcher runs each tool, wraps results as `ToolMessage`s, and appends any `citations` to state.
4. **Observe.** Control returns to the planner with the tool results in context. It reasons again: call more tools, or stop.
5. **Synthesise.** Once the planner stops calling tools, the synthesiser composes the briefing from every citation gathered this turn, applying the humanizer output rules so the prose reads naturally.

**Why ReAct and not a fixed chain:** the number and choice of tools depends on the query. "Compare stop and search across two forces" needs two `fetch_uk_stop_search` calls; "what are Hackney's priorities" needs a `locate` call then a `priorities` call. A fixed chain cannot express that. The ReAct loop lets the LLM adapt per query.

**Safety cap:** `AGENT_MAX_ITERATIONS` (default 5) bounds the loop. When hit, the planner stops and the synthesiser runs with whatever was gathered.

**Input safety:** before the query becomes a `HumanMessage`, `security/inputSanitizer.ts` strips control characters, caps length, and flags prompt-injection patterns such as "ignore previous instructions". The planner prompt also states the query is data to research, not instructions. That is defence in depth.

---

## 5. RAG pipeline

RAG runs in two phases. **Ingestion** (offline, via `pnpm --filter @mark43/agent seed:chroma`) fetches real public documents, chunks them, embeds them, and writes them to Chroma Cloud plus the entity graph. **Retrieval** (at query time) happens only when the LLM calls the `search_public_safety_knowledge` tool, which combines semantic search with entity-graph expansion.

```
INGEST (migrate.ts)                         RETRIEVE (graphRagTool.ts)
─────────────────────                        ──────────────────────────
Gov.uk / College RSS / crime taxonomy        user query
        │                                          │
        ▼                                          ▼
chunkDocumentByLines (ingestion.ts)          semantic search (top-K)
        │                                          │
        ├──► embed + write to Chroma               ├──► extract entity terms
        └──► extract entities to graph_store        └──► one-hop graph lookup
                                                          │
                                                   merge + de-dupe + re-rank
                                                          │
                                                       citations
```

### 5.1 Chunking strategy (`ingestion.ts`)

We use **line-based chunking with overlap**, tuned to Chroma Cloud's hard 16 KiB per-document limit.

| Parameter | Value | Why |
|-----------|-------|-----|
| `maxBytesPerChunk` | 8192 bytes (8 KiB) | Half of Chroma's 16 KiB ceiling, leaving margin for metadata and multi-byte UTF-8 |
| `targetLinesPerChunk` | 20 lines | Keeps a chunk to a paragraph or two so it stays semantically coherent |
| `overlapLines` | 4 lines | Carries context across a boundary so a fact split mid-idea is still retrievable |

**Algorithm (`chunkDocumentByLines`):**
1. Normalise line endings (`\r\n` becomes `\n`) and trim trailing whitespace on each line.
2. Accumulate lines into the current chunk until **either** 20 lines is reached **or** adding the next line would push the chunk past 8192 bytes.
3. Flush the chunk, then seed the next one with the **last 4 lines** of the previous chunk (the overlap).
4. Give each chunk a stable id `{documentId}_chunk_{index}` and metadata: `chunkIndex`, `totalChunks`, `byteSize`, `createdAt`, plus the source metadata (source, title, collection, jurisdiction).

**Why line-based rather than fixed-character or token splitting:**
- The sources here (Gov.uk descriptions, College of Policing RSS items, the crime taxonomy) are **short, structured text**. Line boundaries already map to logical units: a policy point, a news item, a category.
- Fixed-character splitting would cut mid-word and mid-sentence. Token splitting would add a tokeniser dependency for no quality gain at this document size.
- The stable `{documentId}_chunk_N` id is what powers **GroupBy de-duplication** in hybrid search and **chunk-ID lookup** during Graph RAG expansion.

**Trade-off I would revisit:** for long documents (full PDFs, legal statutes) I would switch to LangChain's `RecursiveCharacterTextSplitter`, which falls back paragraph -> sentence -> word and handles deep prose better. For this corpus of short public-sector snippets, line-based chunking is simpler and loses nothing.

### Hybrid search (Chroma Cloud)
- **Dense:** OpenAI `text-embedding-3-small` (1536-dim) via `@langchain/openai`
- **Sparse:** Chroma Cloud Splade (BM25-style lexical matching)
- **Fusion:** Reciprocal Rank Fusion (RRF) merges both result lists
- **Dedup:** GroupBy `documentId` prevents duplicate source passages

### Graph RAG (entity expansion)
- During ingestion: entity patterns extracted per chunk → `EntityGraphStore` (JSON-persisted `graph_store.json`)
- At query time: semantic results → extract query terms → one-hop graph traversal → expand with related chunk IDs
- Effect: a query about "stop and search Metropolitan Police" also surfaces related chunks about "PACE", "use of force", "disproportionality"

### When Chroma Cloud is unavailable
`vectorStore.ts` returns an empty result set with a message telling the operator to set `CHROMA_API_KEY` and run the seed script. There is no mock or sample-data fallback, so the agent never fabricates knowledge-base content. If the vector store is down, the RAG tool simply contributes no citations, and the live API tools (Police UK, FBI, Gov.uk) still work.

---

## 6. Session memory

| Mechanism | Implementation |
|-----------|---------------|
| **Cross-turn persistence** | `MemorySaver` checkpointer keyed by `thread_id = sessionId` |
| **SessionId generation** | Frontend generates `sess-{timestamp}-{random}` once per browser session, stable across turns |
| **Conversation summarisation** | When `messages.length > SESSION_SUMMARIZE_THRESHOLD` (default 10), older messages are compressed by the LLM into a `conversationSummary` string; last 4 messages kept verbatim |
| **Graph singleton** | `getOrBuildGraph()` returns the same compiled graph instance per process — critical so `MemorySaver` state is not lost between HTTP requests |

---

## 7. Police UK API — full coverage & rate limiting

### Rate limiter design

The Police UK API uses a **leaky bucket** algorithm: 15 requests/second average, burst of 30.  
We implement an equivalent **token bucket** (mathematically equivalent for this use-case):

```
Capacity    = 30 tokens  (max burst)
Refill rate = 15 tokens/second
```

All four Police UK tools import `policeFetch()` from `policeUkRateLimiter.ts` which:
1. Calls `rateLimiter.acquire()` before every request — blocks if tokens are exhausted
2. On HTTP 429, backs off 2 seconds and retries once
3. The bucket refills continuously as time passes

The single `TokenBucket` instance is module-level (singleton), so concurrent tool calls from the same agent turn correctly share the limit.

---

## 8. Security, validation & real-time context

### Input sanitisation & prompt-injection guard (`security/inputSanitizer.ts`)
Every user query is untrusted input. Before it reaches the LLM, `sanitiseUserQuery()`:
- strips control characters and caps length (denial-of-service guard)
- flags known prompt-injection patterns ("ignore previous instructions", "you are now", "reveal your prompt", DAN, developer mode)

A flagged query is still processed, but the planner treats it strictly as data to research, reinforced by a rule in the planner prompt. This is defence in depth, not a single filter.

### Citation validation (`tools/citationValidator.ts`)
Public sources sometimes return links that 404 (Gov.uk finder slugs, deprecated pages). After the dispatcher collects citations, `filterValidCitations()`:
- resolves each citation's source to a URL (absolute, bare host, or a URL found in the snippet)
- checks reachability in parallel with a 5s timeout: HEAD first, then GET if HEAD is not OK (many servers, e.g. the FBI CDE viewer, return 404 to HEAD but 200 to GET)
- drops citations whose URL is unreachable; keeps citations that have no URL as plain-text references

The UI therefore never shows a dead link, and the dispatcher step log reports how many were dropped.

### Real-time date awareness (`prompts/dateContext.ts`)
`getCurrentDateContext()` injects today's date into the planner and synthesiser prompts on every request, so "recent", "latest", and "last N years" are interpreted against the real current date rather than the model's training cutoff.

### Humanizer output rules (`prompts/humanizerRules.ts`)
The synthesiser prompt includes a condensed "signs of AI writing" ruleset: no em dashes, no sales language, plain verbs, no invented facts, attribute every statistic. This keeps briefings readable and analyst-like.

### Transport security (`apps/api/src/middleware/`)
- **helmet** sets hardened HTTP response headers
- **CORS** restricts origins via `CORS_ORIGIN`
- **express-rate-limit** caps the agent endpoint at 30 requests/min per IP
- a central error handler hides internal detail in production

### Introspection endpoints (read-only)
For transparency and debugging, the API exposes the agent's internals:

| Endpoint | Shows |
|----------|-------|
| `GET /api/agent/graph` | LangGraph nodes, edges, and a Mermaid diagram |
| `GET /api/agent/memory/:sessionId` | The session checkpoint: messages, summary, citations |
| `GET /api/agent/graph-store` | The Graph RAG entity store: stats, entities, edges |

---

## 9. LLM choice & justification

### Chosen: OpenRouter → `openai/gpt-4o-mini`

| Requirement | Why this choice |
|-------------|----------------|
| Tool calling | GPT-4o-mini has first-class `tool_calls` support — reliable parallel tool invocation |
| Cost | ~15× cheaper than GPT-4o; adequate for structured tool orchestration |
| Flexibility | OpenRouter lets you swap the model via a single env var — no code change needed |
| Embeddings split | OpenRouter does not proxy embedding endpoints, so `text-embedding-3-small` runs through LangChain's `@langchain/openai` integration against the OpenAI endpoint. Swapping embedding providers means changing one factory function, not the pipeline |

### What was considered and rejected

| Option | Reason rejected |
|--------|----------------|
| **GPT-4o** | 15× more expensive; not needed for deterministic tool orchestration |
| **Llama 3.1 8B (free tier)** | Tool-call reliability degrades on complex multi-tool sequences |
| **Anthropic Claude** | Excellent but more expensive and slightly worse tool-call parallelism than GPT-4o-mini for short contexts |
| **Local Ollama** | No stable tool-calling on models that fit in reasonable VRAM |

### The key architectural decision I'd defend

**Using `MemorySaver` (in-process) rather than a persistent checkpointer (PostgreSQL/Redis).**

A reasonable engineer would immediately ask: *"What happens if the server restarts?"* — and the answer is session memory is lost.

I chose this deliberately for the scope of the assignment because:
- The brief asks for session memory within a conversation, not cross-session persistence
- MemorySaver requires zero infrastructure
- LangGraph's `PostgresSaver` is a one-line swap when you have a DB connection string
- The `SESSION_SUMMARIZE_THRESHOLD` env var gives operators a lever without any code change

If I had one more day, I'd swap to `PostgresSaver` and add `LangSmith` tracing.

---

## 10. Setup & running

### Prerequisites
- Node.js 20+
- pnpm 9+
- OpenRouter API key ([openrouter.ai](https://openrouter.ai/))
- OpenAI API key (embeddings only — [platform.openai.com](https://platform.openai.com/))
- Chroma Cloud credentials ([trychroma.com](https://www.trychroma.com/)) — *optional; the RAG tool returns no citations if unset, the live API tools still work*
- FBI API key — *optional; tool degrades gracefully* ([api.data.gov/signup](https://api.data.gov/signup))

### Steps

```bash
# 1. Clone and install
git clone <repo>
cd mark43
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Fill in OPENROUTER_API_KEY, OPENAI_API_KEY, and optionally CHROMA_* and FBI_API_KEY
# Env is read from the repo-root .env.local (falling back to .env) from any workspace.

# 3. (Optional) Seed the RAG knowledge base from real public sources
pnpm --filter @mark43/agent seed:chroma

# 4. Start dev servers (API on :4000, web on :5173)
pnpm dev
```

### Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `OPENROUTER_API_KEY` | **Yes** | — | Chat LLM (OpenRouter) |
| `OPENROUTER_MODEL` | No | `openai/gpt-4o-mini` | Model to use |
| `OPENAI_API_KEY` | **Yes** | — | Embeddings (text-embedding-3-small) |
| `CHROMA_API_KEY` | No | — | Chroma Cloud vector store; RAG returns no citations if unset |
| `CHROMA_TENANT` | No | — | Chroma Cloud tenant ID |
| `CHROMA_DATABASE` | No | `mark43-rag` | Chroma Cloud database name |
| `FBI_API_KEY` | No | — | FBI Crime Data Explorer; tool degrades gracefully |
| `SESSION_SUMMARIZE_THRESHOLD` | No | `10` | Messages before conversation is compressed |
| `AGENT_MAX_ITERATIONS` | No | `5` | Max ReAct tool-call rounds per turn |
| `PORT` | No | `4000` | Express API port |
| `VITE_API_URL` | No | `http://localhost:4000` | Frontend API base URL |

---

## 11. Presentation Q&A

### Part 1 — What you built & why (60-second framing)

> "I built a public safety intelligence agent that answers questions about UK and US crime and policing by autonomously choosing and calling real public APIs — the UK Police API, Gov.uk, College of Policing, and the FBI Crime Data Explorer. The core thesis is that LLM tool-calling is more robust than keyword routing for this kind of multi-jurisdictional research query. I focused on the agentic loop, real data ingestion, session memory, and covering the full Police UK API surface. I explicitly left out auth, persistent storage, and deployment infrastructure — those are one-line swaps once the agent logic is solid."

### Part 2 — Live demo query suggestions

1. *"What are the most common crime categories in Westminster, London?"*  
   → Calls `fetch_uk_crime_data` (street_crimes, lat/lng for Westminster)

2. *"Compare stop and search rates for the Metropolitan Police and Thames Valley"*  
   → Calls `fetch_uk_stop_search` (by_force) twice; synthesiser compares them

3. *"What are the current neighbourhood policing priorities in Hackney?"*  
   → Calls `fetch_uk_neighbourhood_data` (locate → priorities)

4. *"How do UK violent crime trends compare to the US over the last 5 years?"*  
   → Calls `fetch_uk_crime_data` + `fetch_us_crime_statistics` in parallel

5. *"What does the College of Policing say about facial recognition?"*  
   → Calls `fetch_uk_policy_and_research` + `search_public_safety_knowledge`

### Part 3 — Architecture walkthrough notes

Walk through these in order:
1. **Frontend → SSE** — `useAgentStream.ts` opens an SSE connection with a stable `sessionId`, renders streamed tokens as markdown with clickable source citations
2. **Express route** — validates with Zod, applies helmet + rate limiting, calls `getOrBuildGraph().stream()` — emphasise the singleton pattern (MemorySaver requires same graph instance)
3. **Graph topology** — draw the planner → dispatcher loop on the screen; show `shouldCallTools()` is the only routing decision (or open `GET /api/agent/graph` for the live Mermaid diagram)
4. **Tool selection** — open `tools/index.ts`, show the 7 tools; explain the LLM reads descriptions not keywords
5. **Rate limiter** — show `policeUkRateLimiter.ts`; explain token bucket vs leaky bucket equivalence
6. **RAG pipeline** — show `migrate.ts` fetching real Gov.uk + College of Policing; show `graphStore.ts` entity extraction (or `GET /api/agent/graph-store`)
7. **Memory** — show `memory.ts` summarisation threshold; explain `thread_id` → `MemorySaver` (or `GET /api/agent/memory/:sessionId`)
8. **Safety layers** — `inputSanitizer.ts` (prompt-injection guard) and `citationValidator.ts` (drops dead links); mention the humanizer output rules and real-time date injection

### Part 4 — LLM choice & key decision

**LLM choice:** OpenRouter routing to `openai/gpt-4o-mini` because it has the most reliable tool-calling at the lowest cost point. The split between OpenRouter (chat) and OpenAI embeddings via LangChain's `@langchain/openai` is intentional — OpenRouter doesn't proxy embedding endpoints.

**Key architectural decision to defend:**  
*"I used a flat JSON-persisted entity graph instead of Neo4j for Graph RAG."*

A reasonable engineer would say Neo4j gives you proper Cypher queries and multi-hop traversal. My argument: for an MVP with <10K documents, a JSON adjacency list with one-hop traversal in plain TypeScript has zero infrastructure overhead, is trivially testable, and produces measurably better retrieval than pure semantic search alone. Neo4j becomes the right answer when you need multi-hop, cross-document reasoning at scale — at which point you swap `EntityGraphStore` for a `Neo4jGraph` adapter, and the tool interface doesn't change.
