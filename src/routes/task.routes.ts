import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import {
  createTaskHandler,
  listTasksHandler,
  getTaskHandler,
  updateTaskHandler,
  deleteTaskHandler,
} from "../controllers/task.controller";

export const taskRouter = Router();

taskRouter.use(requireAuth);

taskRouter.post("/", createTaskHandler);
taskRouter.get("/", listTasksHandler);
taskRouter.get("/:id", getTaskHandler);
taskRouter.patch("/:id", updateTaskHandler);
taskRouter.delete("/:id", deleteTaskHandler);