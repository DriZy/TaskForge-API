import { Router } from "express";
import rateLimit from "express-rate-limit";
import { registerController, loginController } from "../controllers/auth.controller";

export interface AuthRateLimitOptions {
  windowMs?: number;
  limit?: number;
}

export function createAuthRouter(options: AuthRateLimitOptions = {}): Router {
  const authRouter = Router();

  const authLimiter = rateLimit({
    windowMs: options.windowMs ?? 15 * 60 * 1000,
    limit: options.limit ?? 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many auth attempts; try again later" },
    },
  });

  authRouter.use(authLimiter);

  authRouter.post("/register", registerController);
  authRouter.post("/login", loginController);

  return authRouter;
}