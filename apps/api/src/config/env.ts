import { loadRootEnv } from "@mark43/agent";

loadRootEnv();

/**
 * Centralised, typed access to server environment variables.
 * Reading env in one place keeps the rest of the app free of process.env lookups.
 */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
} as const;
