import express from "express";
import swaggerUi from "swagger-ui-express";
import { notFound } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { taskRouter } from "./routes/task.routes";
import { buildOpenApiDocument } from "./docs/openapi";

const apiSpec = buildOpenApiDocument();

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);

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
