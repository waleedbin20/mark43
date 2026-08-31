import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

/** 404 handler for unmatched routes. */
export function notFoundHandler(_req: Request, res: Response): void {
    res.status(404).json({ error: "Not found" });
}

/**
 * Centralised error handler. Logs the full error server-side but only returns a
 * detailed message in development, avoiding internal detail leakage in production.
 */
export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    console.error("Unhandled error:", err);

    if (res.headersSent) {
        res.end();
        return;
    }

    res.status(500).json({
        error: "Internal server error",
        ...(env.isProduction ? {} : { detail: err.message }),
    });
}
