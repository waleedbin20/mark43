import cors from "cors";
import helmet from "helmet";
import express, { RequestHandler } from "express";
import { env } from "../config/env";

const JSON_BODY_LIMIT = "1mb";

/**
 * Baseline security middleware applied to every request:
 *  - helmet sets hardened HTTP response headers
 *  - cors restricts which origins may call the API
 *  - json body parser caps payload size to blunt oversized-body attacks
 */
export function securityMiddleware(): RequestHandler[] {
  return [
    helmet(),
    cors({ origin: env.corsOrigin, credentials: true }),
    express.json({ limit: JSON_BODY_LIMIT }),
  ];
}
