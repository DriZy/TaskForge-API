import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { createTaskHandler } from "../controllers/task.controller";

export const taskRouter = Router();

taskRouter.use(requireAuth);

taskRouter.post("/", createTaskHandler);