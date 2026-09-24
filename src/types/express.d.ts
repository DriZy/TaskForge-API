import type { Express } from "express";
import type { User } from "@prisma/client";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export type AuthenticatedRequest = Express.Request & { user: User };
