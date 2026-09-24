import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { notFound } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health.routes";
import { createAuthRouter, type AuthRateLimitOptions } from "./routes/auth.routes";
import { taskRouter } from "./routes/task.routes";
import { buildOpenApiDocument } from "./docs/openapi";

const apiSpec = buildOpenApiDocument();

export interface CreateAppOptions {
  authRateLimit?: AuthRateLimitOptions;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", createAuthRouter(options.authRateLimit));

  app.use("/api/tasks", taskRouter);

  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(apiSpec);
  });
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(apiSpec));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
