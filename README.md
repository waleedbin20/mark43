# Mark43 Public Safety Intelligence Agent

A production-grade agentic system that synthesises publicly available law enforcement intelligence from real UK and US data sources into structured briefings.

> **Full architecture guide, data sources, setup steps, and presentation Q&A:**
> [`.github/docs/ARCHITECTURE.md`](.github/docs/ARCHITECTURE.md)

---

## Quick start

```bash
cp .env.example .env          # fill in OPENROUTER_API_KEY and OPENAI_API_KEY
pnpm install
pnpm --filter @mark43/agent seed:chroma   # optional: seed RAG knowledge base
pnpm dev                      # API :4000 · Web :5173
```

---

## Data sources

| Source | What | Auth |
|--------|------|------|
| [data.police.uk](https://data.police.uk/docs/) | UK crimes, outcomes, forces, neighbourhoods, stop & search | None |
| [www.gov.uk/api](https://docs.publishing.service.gov.uk/api/content-api) | UK government policy & guidance | None |
| [college.police.uk/rss](https://college.police.uk/) | College of Policing research news | None |
| [api.usa.gov/crime/fbi/sapi](https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/docApi) | FBI Crime Data Explorer (UCR/NIBRS) | Free key |

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
- **Live public data** — UK Police API (full endpoint coverage), Gov.uk, College of Policing, and the FBI Crime Data Explorer.
- **Hybrid RAG** — Chroma Cloud dense + sparse search with RRF fusion, plus entity-graph expansion over the ingested corpus.
- **Session memory** — remembers earlier turns via LangGraph checkpointing and compresses long histories with LLM summarisation.
- **Rate limiting & security** — token-bucket limiter for the Police UK API, helmet headers, CORS, per-IP request limits, and prompt-injection screening.
- **Streaming UI** — Express Server-Sent Events into a React chat interface.

---

## Documentation

Design detail, diagrams, and the presentation Q&A live in **[`.github/docs/ARCHITECTURE.md`](.github/docs/ARCHITECTURE.md)**:

- Architecture overview, component responsibilities, and the request lifecycle
- Full Police UK API endpoint coverage
- RAG pipeline and the chunking strategy
- LangGraph orchestration and session memory
- LLM choice, trade-offs, and setup reference

A 4-turn example conversation demonstrating multi-step reasoning, tool use, and memory is in **[`TRANSCRIPT.md`](TRANSCRIPT.md)**.

