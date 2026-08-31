/**
 * RAG Ingestion Pipeline â€” Real public data sources.
 *
 * Sources:
 *  1. Gov.uk Search API  â€” UK policing policy, AI legislation, Home Office guidance (free, no auth)
 *  2. College of Policing RSS â€” UK policing research, practice guidance, news (free RSS)
 *  3. Police UK /crime-categories â€” canonical UK crime taxonomy for entity graph seeding
 *
 * Run with:  pnpm --filter @mark43/agent seed:chroma
 */

import { chunkDocumentByLines, DocumentMetadata } from "./ingestion";
import { addChunksToChroma, getOrCreateShardedCollection } from "./chromaCloud";
import { getGraphStore, EntityType } from "./graphStore";
import { ChromaCollectionName } from "@mark43/shared";
import { ChunkedDocument } from "./ingestion";

// ============================================================
// RSS helpers
// ============================================================

interface RssItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

function parseRssItems(xml: string, max = 20): RssItem[] {
  const items: RssItem[] = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && items.length < max) {
    const b = m[1];
    items.push({
      title: xmlTag(b, "title"),
      description: xmlTag(b, "description"),
      link: xmlTag(b, "link"),
      pubDate: xmlTag(b, "pubDate"),
    });
  }
  return items;
}

function xmlTag(xml: string, tag: string): string {
  const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m = xml.match(r);
  if (!m) return "";
  return m[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .trim();
}

// ============================================================
// Source fetchers
// ============================================================

interface IngestedDocument {
  content: string;
  metadata: DocumentMetadata;
}

async function fetchGovUkDocuments(keywords: string, count = 15): Promise<IngestedDocument[]> {
  const url = `https://www.gov.uk/api/search.json?q=${encodeURIComponent(keywords)}&count=${count}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Gov.uk API ${res.status}`);
  const json: any = await res.json();
  const results: any[] = json.results ?? [];

  return results
    .filter((r: any) => r.title && r.description)
    .map((r: any, i: number) => ({
      content: `# ${r.title}\n\n${r.description ?? ""}\n\nDocument type: ${r.content_store_document_type ?? "unknown"}\nOrganisations: ${(r.organisations ?? []).map((o: any) => o.title).join(", ")}\nURL: https://www.gov.uk${r.link ?? ""}`,
      metadata: {
        documentId: `govuk-${i}-${(r.link ?? String(i)).replace(/\//g, "-")}`,
        source: `https://www.gov.uk${r.link ?? ""}`,
        title: r.title,
        collection: "mark43_rms_policies" as ChromaCollectionName,
        category: r.content_store_document_type ?? "guidance",
        jurisdiction: "UK",
        keywords,
        fetchedAt: new Date().toISOString(),
      },
    }));
}

async function fetchCollegeOfPolicingRss(max = 20): Promise<IngestedDocument[]> {
  const res = await fetch("https://www.college.police.uk/rss/news", {
    headers: {
      Accept: "application/rss+xml, text/xml",
      "User-Agent": "Mozilla/5.0 (compatible; Mark43IntelligenceAgent/1.0)",
    },
  });
  if (!res.ok) throw new Error(`College of Policing RSS ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml, max);

  return items
    .filter((item) => item.title && item.description)
    .map((item, i) => ({
      content: `# ${item.title}\n\n${item.description}\n\nPublished: ${item.pubDate}\nSource: ${item.link}`,
      metadata: {
        documentId: `cop-rss-${i}-${Date.now()}`,
        source: item.link || "college.police.uk",
        title: item.title,
        collection: "mark43_rms_policies" as ChromaCollectionName,
        category: "research",
        jurisdiction: "UK",
        publishedAt: item.pubDate,
        fetchedAt: new Date().toISOString(),
      },
    }));
}

async function fetchPoliceUkCrimeCategories(): Promise<IngestedDocument[]> {
  const res = await fetch("https://data.police.uk/api/crime-categories");
  if (!res.ok) throw new Error(`Police UK categories ${res.status}`);
  const categories = (await res.json()) as Array<{ url: string; name: string }>;

  const content = `# UK Police Crime Category Taxonomy\n\nOfficial crime categories used by police forces across England, Wales, and Northern Ireland:\n\n${categories.map((c) => `- **${c.name}** (api_id: ${c.url})`).join("\n")}`;

  return [
    {
      content,
      metadata: {
        documentId: "police-uk-crime-categories",
        source: "data.police.uk/api/crime-categories",
        title: "UK Police Crime Category Taxonomy",
        collection: "incident_intelligence" as ChromaCollectionName,
        category: "taxonomy",
        jurisdiction: "UK",
        fetchedAt: new Date().toISOString(),
      },
    },
  ];
}

// ============================================================
// Entity extraction for Graph RAG
// ============================================================

const ENTITY_PATTERNS: Array<{ terms: string[]; type: EntityType }> = [
  {
    terms: ["london", "manchester", "birmingham", "leeds", "liverpool", "bristol", "glasgow", "edinburgh", "cardiff", "england", "wales", "scotland", "northern ireland", "uk", "united kingdom"],
    type: "location",
  },
  {
    terms: ["home office", "college of policing", "npcc", "met police", "metropolitan police", "police scotland", "hmicfrs", "crown prosecution service", "national crime agency", "nca"],
    type: "organization",
  },
  {
    terms: ["body worn camera", "facial recognition", "predictive policing", "ai", "machine learning", "algorithm", "data analytics", "cctv", "anpr", "automatic number plate recognition", "dispatch", "cad", "rms"],
    type: "technology",
  },
  {
    terms: ["stop and search", "use of force", "neighbourhood policing", "community policing", "policing bill", "police reform", "crime prevention", "public order", "counter terrorism", "safeguarding"],
    type: "policy",
  },
  {
    terms: ["us", "united states", "new york", "california", "chicago", "fbi", "doj", "dhs", "department of justice"],
    type: "jurisdiction",
  },
];

function extractEntitiesFromChunk(text: string, chunkId: string): void {
  const graph = getGraphStore();
  const lower = text.toLowerCase();
  for (const { terms, type } of ENTITY_PATTERNS) {
    for (const term of terms) {
      if (lower.includes(term)) {
        graph.addEntity(term, type, chunkId);
      }
    }
  }
}

// ============================================================
// Migration runner
// ============================================================

export async function runChromaMigration(): Promise<void> {
  console.log("ðŸš€ Starting Mark43 RAG Ingestion from real public sources...\n");

  const graph = getGraphStore();
  const allDocs: IngestedDocument[] = [];

  const fetchTasks: Array<{ name: string; fn: () => Promise<IngestedDocument[]> }> = [
    { name: "Gov.uk â€” AI policing & technology", fn: () => fetchGovUkDocuments("police AI technology surveillance facial recognition") },
    { name: "Gov.uk â€” Crime & policing policy", fn: () => fetchGovUkDocuments("policing reform stop search crime prevention policy") },
    { name: "Gov.uk â€” Emergency services", fn: () => fetchGovUkDocuments("emergency services 999 dispatch ambulance fire police") },
    { name: "College of Policing RSS", fn: () => fetchCollegeOfPolicingRss(20) },
    { name: "Police UK crime taxonomy", fn: () => fetchPoliceUkCrimeCategories() },
  ];

  for (const task of fetchTasks) {
    try {
      console.log(`ðŸ“¡ Fetching: ${task.name}`);
      const docs = await task.fn();
      allDocs.push(...docs);
      console.log(`   âœ… ${docs.length} documents`);
    } catch (err: any) {
      console.warn(`   âš ï¸  ${task.name}: ${err.message}`);
    }
  }

  console.log(`\nðŸ“¦ Total documents: ${allDocs.length}`);

  const byCollection = new Map<ChromaCollectionName, IngestedDocument[]>();
  for (const doc of allDocs) {
    const col = doc.metadata.collection;
    if (!byCollection.has(col)) byCollection.set(col, []);
    byCollection.get(col)!.push(doc);
  }

  for (const [colName, docs] of byCollection) {
    console.log(`\nðŸ“ Collection: "${colName}" (${docs.length} docs)`);
    const col = await getOrCreateShardedCollection(colName);
    if (!col) { console.error(`   âŒ Failed to init "${colName}"`); continue; }

    const allChunks: ChunkedDocument[] = [];
    for (const doc of docs) {
      const chunks = chunkDocumentByLines(doc.content, doc.metadata, {
        targetLinesPerChunk: 20,
        overlapLines: 4,
        maxBytesPerChunk: 6000,
      });
      allChunks.push(...chunks);
      for (const chunk of chunks) extractEntitiesFromChunk(chunk.text, chunk.id);
    }

    console.log(`   ðŸ”— ${allChunks.length} chunks (4-line overlap)`);
    const ok = await addChunksToChroma(colName, allChunks);
    console.log(ok ? `   âœ… Ingested (OpenAI text-embedding-3-small + Splade sparse)` : `   âš ï¸  Chroma skipped â€” local fallback active`);
  }

  graph.save();
  const stats = graph.getStats();
  console.log(`\nðŸ•¸ï¸  Entity graph: ${stats.entityCount} entities, ${stats.edgeCount} edges, ${stats.totalChunkLinks} chunk-links`);
  console.log("ðŸ Ingestion complete.\n");
}

if (require.main === module) {
  runChromaMigration()
    .then(() => process.exit(0))
    .catch((err) => { console.error("Migration error:", err); process.exit(1); });
}
