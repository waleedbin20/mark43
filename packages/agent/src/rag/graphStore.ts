import * as fs from "fs";
import * as path from "path";

export type EntityType = "location" | "organization" | "crime_type" | "policy" | "technology" | "jurisdiction" | "person";

export interface EntityNode {
    name: string;
    type: EntityType;
    chunkIds: Set<string>;
    aliases: string[];
}

export interface GraphEdge {
    source: string;
    target: string;
    relation: string;
}

/**
 * Lightweight in-memory entity-relationship graph for Graph RAG.
 *
 * Design: We rejected a full graph database (Neo4j, Memgraph) because:
 * - The ingestion corpus is small (<1000 chunks)
 * - Query latency matters more than graph scale
 * - Zero extra infrastructure for a take-home exercise
 *
 * The graph is persisted to graph_store.json for inspection and reloaded on startup.
 * Entity extraction happens at ingestion time (not query time) to keep retrieval fast.
 */
export class EntityGraphStore {
    private entities: Map<string, EntityNode> = new Map();
    private edges: GraphEdge[] = [];
    private persistPath: string;

    constructor(persistPath?: string) {
        this.persistPath = persistPath ?? path.join(process.cwd(), "graph_store.json");
        this.load();
    }

    /** Add or update an entity node and link it to a chunk */
    addEntity(name: string, type: EntityType, chunkId: string, aliases: string[] = []): void {
        const key = this.normalise(name);
        if (!key) return;

        const existing = this.entities.get(key);
        if (existing) {
            existing.chunkIds.add(chunkId);
            aliases.forEach((a) => {
                if (!existing.aliases.includes(this.normalise(a))) {
                    existing.aliases.push(this.normalise(a));
                }
            });
        } else {
            this.entities.set(key, {
                name,
                type,
                chunkIds: new Set([chunkId]),
                aliases: aliases.map((a) => this.normalise(a)).filter(Boolean),
            });
        }
    }

    /** Add a relationship edge between two entities */
    addEdge(sourceName: string, targetName: string, relation: string): void {
        const src = this.normalise(sourceName);
        const tgt = this.normalise(targetName);
        if (!src || !tgt || src === tgt) return;
        const exists = this.edges.some((e) => e.source === src && e.target === tgt && e.relation === relation);
        if (!exists) this.edges.push({ source: src, target: tgt, relation });
    }

    /**
     * Graph RAG retrieval expansion:
     * Given a list of query terms, find all chunk IDs that share entities with those terms.
     * Returns unique chunk IDs ordered by entity match count (most connected first).
     */
    getRelatedChunkIds(queryTerms: string[], limit = 10): string[] {
        const normTerms = queryTerms.map((t) => this.normalise(t)).filter(Boolean);
        if (normTerms.length === 0) return [];

        const chunkScores: Map<string, number> = new Map();

        for (const [key, node] of this.entities) {
            const matches = normTerms.filter(
                (t) => key.includes(t) || t.includes(key) || node.aliases.some((a) => a.includes(t) || t.includes(a))
            ).length;

            if (matches > 0) {
                for (const chunkId of node.chunkIds) {
                    chunkScores.set(chunkId, (chunkScores.get(chunkId) ?? 0) + matches);
                }

                // Follow edges one hop to expand coverage
                const connectedNames = this.edges
                    .filter((e) => e.source === key || e.target === key)
                    .map((e) => (e.source === key ? e.target : e.source));

                for (const connectedKey of connectedNames) {
                    const connNode = this.entities.get(connectedKey);
                    if (connNode) {
                        for (const chunkId of connNode.chunkIds) {
                            chunkScores.set(chunkId, (chunkScores.get(chunkId) ?? 0) + matches * 0.5);
                        }
                    }
                }
            }
        }

        return Array.from(chunkScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id]) => id);
    }

    /** Stats for transparency */
    getStats() {
        return {
            entityCount: this.entities.size,
            edgeCount: this.edges.length,
            totalChunkLinks: Array.from(this.entities.values()).reduce((s, e) => s + e.chunkIds.size, 0),
        };
    }

    /** Persist to disk for inspection and warm restarts */
    save(): void {
        try {
            const serialisable = {
                entities: Array.from(this.entities.entries()).map(([k, v]) => ({
                    key: k,
                    name: v.name,
                    type: v.type,
                    chunkIds: Array.from(v.chunkIds),
                    aliases: v.aliases,
                })),
                edges: this.edges,
            };
            fs.writeFileSync(this.persistPath, JSON.stringify(serialisable, null, 2), "utf-8");
        } catch {
            // Non-fatal — graph is still usable in memory
        }
    }

    private load(): void {
        try {
            if (!fs.existsSync(this.persistPath)) return;
            const data = JSON.parse(fs.readFileSync(this.persistPath, "utf-8"));
            for (const e of data.entities ?? []) {
                this.entities.set(e.key, {
                    name: e.name,
                    type: e.type as EntityType,
                    chunkIds: new Set(e.chunkIds),
                    aliases: e.aliases ?? [],
                });
            }
            this.edges = data.edges ?? [];
        } catch {
            // Start fresh on corrupt file
        }
    }

    private normalise(s: string): string {
        return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "_");
    }
}

let _graphStore: EntityGraphStore | null = null;

export function getGraphStore(): EntityGraphStore {
    if (!_graphStore) _graphStore = new EntityGraphStore();
    return _graphStore;
}
