import express from "express";
import { notFound } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";
import { requireAuth } from "./middleware/require-auth";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);

  app.use("/api/tasks", requireAuth);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
