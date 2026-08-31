import { z } from "zod";
import { loadRootEnv } from "./loadEnv";

loadRootEnv();

const ConfigSchema = z.object({
  // OpenRouter — primary LLM provider (supports OpenAI, Anthropic, Llama, etc.)
  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o-mini"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  OPENROUTER_TEMPERATURE: z.coerce.number().default(0.2),

  // OpenAI — used only for text-embedding-3-small (OpenRouter does not support embeddings)
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  // Chroma Cloud
  CHROMA_HOST: z.string().default("api.trychroma.com"),
  CHROMA_API_KEY: z.string().optional().default(""),
  CHROMA_TENANT: z.string().optional().default(""),
  CHROMA_DATABASE: z.string().default("mark43-rag"),

  // FBI Crime Data Explorer API (free key at https://api.data.gov/signup)
  FBI_API_KEY: z.string().optional().default(""),

  // Session memory: summarise after this many messages to avoid context blowout
  SESSION_SUMMARIZE_THRESHOLD: z.coerce.number().default(10),
  // Safety cap on ReAct tool-call loops per turn
  AGENT_MAX_ITERATIONS: z.coerce.number().default(5),

  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    const result = ConfigSchema.safeParse(process.env);
    if (!result.success) {
      console.warn("⚠️ Configuration warning:", result.error.format());
      _config = ConfigSchema.parse({});
    } else {
      _config = result.data;
    }
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
