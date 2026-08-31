import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { getConfig } from "./config";

/**
 * Chat LLM routed through OpenRouter.
 * Supports any model available on OpenRouter (openai/*, anthropic/*, meta-llama/*, etc.)
 * configured via OPENROUTER_MODEL env var.
 */
export function getChatLLM(streaming: boolean = true): ChatOpenAI {
  const config = getConfig();

  if (!config.OPENROUTER_API_KEY) {
    console.warn("⚠️  OPENROUTER_API_KEY not set — LLM calls will fail.");
  }

  return new ChatOpenAI({
    modelName: config.OPENROUTER_MODEL,
    temperature: config.OPENROUTER_TEMPERATURE,
    openAIApiKey: config.OPENROUTER_API_KEY || "missing-key",
    streaming,
    configuration: {
      baseURL: config.OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://mark43-agent.local",
        "X-Title": "Mark43 Public Safety Intelligence Agent",
      },
    },
  });
}

/**
 * LangChain OpenAIEmbeddings (text-embedding-3-small) — used for Chroma vector indexing.
 * OpenRouter does not proxy embedding endpoints, so the OpenAI endpoint is used via LangChain's @langchain/openai integration.
 */
export function getEmbeddingModel(): OpenAIEmbeddings {
  const config = getConfig();

  if (!config.OPENAI_API_KEY) {
    console.warn("⚠️  OPENAI_API_KEY not set — embedding calls will fail.");
  }

  return new OpenAIEmbeddings({
    openAIApiKey: config.OPENAI_API_KEY || "missing-key",
    modelName: config.OPENAI_EMBEDDING_MODEL,
  });
}

/** @deprecated use getChatLLM */
export const getLLM = getChatLLM;
