# Mark43 Public Safety Intelligence Agent

A production-grade agentic system that synthesises publicly available law enforcement intelligence from real UK and US data sources into structured briefings.

> **Full architecture guide, data sources, setup steps, and presentation Q&A:**
> [`.github/docs/ARCHITECTURE.md`](.github/docs/ARCHITECTURE.md)

---


## Demo
<video src="[https://your-domain.com/path-to-video.mp](https://streamable.com/zvp9je)4" controls="controls" width="100%">
</video>


## Quick start

All commands run from the **repo root** (`mark43/`). pnpm workspaces handle the sub-packages, so you do not need to `cd` into `apps/api` or `apps/web`.

**Prerequisites:** Node.js 20+ and pnpm 9+. If `pnpm` is not recognised, enable it with `corepack enable` or install it via `npm install -g pnpm`.

```bash
# 1. Enter the project and install everything (root + all workspaces)
cd mark43
pnpm install

# 2. Configure environment (repo root)
cp .env.example .env.local
# fill in OPENROUTER_API_KEY + OPENAI_API_KEY (CHROMA_* and FBI_API_KEY optional)

# 3. (Optional) Seed the RAG knowledge base into Chroma Cloud
pnpm seed:chroma

# 4. Run BOTH backend + frontend together (Turborepo)
pnpm dev
```

- **Backend (API)** → http://localhost:4000  (Express + SSE)
- **Frontend (Web)** → http://localhost:5173  (React + Vite) — open this in your browser

### Run the backend and frontend separately

If you prefer two terminals (from the repo root):

```bash
pnpm --filter api dev    # backend only  → :4000
pnpm --filter web dev    # frontend only → :5173
```

> Env is loaded from the repo-root `.env.local` (falling back to `.env`) regardless of which
> workspace the command runs in. Live tools work without Chroma; the RAG tool just returns no
> citations until you seed.

---

## Data sources

| Source | What | Auth |
|--------|------|------|
| [data.police.uk](https://data.police.uk/docs/) | UK crimes, outcomes, forces, neighbourhoods, stop & search | None |
| [www.gov.uk/api](https://docs.publishing.service.gov.uk/api/content-api) | UK government policy & guidance | None |
| [college.police.uk/rss](https://college.police.uk/) | College of Policing research news | None |
| [api.usa.gov/crime/fbi/cde](https://cde.ucr.cjis.gov/) | FBI Crime Data Explorer, CDE API (UCR/NIBRS) | Free key |

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Orchestration | LangGraph `StateGraph` (ReAct loop) | Stateful tool-calling with built-in checkpointing |
| Chat LLM | OpenRouter → `openai/gpt-4o-mini` | Reliable tool-calls, 15× cheaper than GPT-4o, model swappable via env var |
| Embeddings | OpenAI `text-embedding-3-small` | Best cost/quality for semantic search at 1536-dim |
| Vector store | Chroma Cloud (hybrid: OpenAI dense + Splade sparse + RRF) | Hybrid search beats pure semantic for domain-specific queries |
| Graph RAG | Custom `EntityGraphStore` (JSON-persisted) | Entity-aware expansion without Neo4j infrastructure |
| Session memory | LangGraph `MemorySaver` + LLM summarisation | Zero-infrastructure per-session context |
| API | Express + Server-Sent Events | Streaming tokens to React frontend |
| Frontend | React 18 + Vite + Tailwind | Fast dev iteration |
| Monorepo | Turborepo + pnpm workspaces | Shared types, parallel builds |

---

## Key capabilities

- **Agentic ReAct loop** — the LLM picks which of 7 tools to call, evaluates the results, and iterates. No keyword routing.
- **Live public data** — UK Police API (full endpoint coverage), Gov.uk, College of Policing, and the FBI Crime Data Explorer CDE API.
- **Hybrid RAG** — Chroma Cloud dense + sparse search with RRF fusion, plus entity-graph expansion over the ingested corpus.
- **Session memory** — remembers earlier turns via LangGraph checkpointing and compresses long histories with LLM summarisation.
- **Real-time date awareness** — today's date is injected into the prompts so "recent" and "last N years" resolve correctly.
- **Citation validation** — unreachable source links are checked and dropped, so the UI never shows a dead citation.
- **Security** — token-bucket limiter for the Police UK API, helmet headers, CORS, per-IP request limits, and prompt-injection screening.
- **Introspection endpoints** — `GET /api/agent/graph`, `/memory/:sessionId`, and `/graph-store` expose the graph, session memory, and entity store.
- **Streaming UI** — Express Server-Sent Events into a React chat that renders markdown with clickable, deep-linked source citations.

---


## Documentation

Design detail, diagrams, and the presentation Q&A live in **[`.github/docs/ARCHITECTURE.md`](.github/docs/ARCHITECTURE.md)**:

- Architecture overview, component responsibilities, and the request lifecycle
- Full Police UK API endpoint coverage
- RAG pipeline and the chunking strategy
- LangGraph orchestration and session memory
- Security, citation validation, and introspection endpoints
- LLM choice, trade-offs, and setup reference

A 4-turn example conversation demonstrating multi-step reasoning, tool use, and memory is in **[`TRANSCRIPT.md`](TRANSCRIPT.md)**.

