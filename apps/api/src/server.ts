import express, { Express } from "express";
import { env } from "./config/env";
import { securityMiddleware } from "./middleware/security";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { agentRouter } from "./routes/agent";
import { healthRouter } from "./routes/health";

const app: Express = express();

// Security + parsing middleware (helmet, cors, json body limit)
app.use(securityMiddleware());

// Routes
app.use(healthRouter);
app.use("/api/agent", agentRouter);

// Fallbacks
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`🚀 Mark43 API Server running at http://localhost:${env.port}`);
  console.log(`📡 SSE Stream available at http://localhost:${env.port}/api/agent/stream`);
});

export default app;
