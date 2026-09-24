import type { RequestHandler } from "express";
import { createTaskSchema } from "../schemas/task.schemas";
import { taskListQuerySchema, taskIdParamsSchema } from "../schemas/task-query.schemas";
import { taskService } from "../services/task.service";

function requireUser(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return false;
  }
  return true;
}

export const createTaskHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createTaskSchema.parse(req.body);
    if (!requireUser(req, res)) return;

    const task = await taskService.create({
      ...parsed,
      ownerId: req.user!.id,
    });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

export const listTasksHandler: RequestHandler = async (req, res, next) => {
  try {
    const query = taskListQuerySchema.parse(req.query);
    if (!requireUser(req, res)) return;

    const tasks = await taskService.list({
      list: query.list ?? "private",
      ownerId: req.user!.id,
    });

    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
};

export const getTaskHandler: RequestHandler = async (req, res, next) => {
  try {
    const { id } = taskIdParamsSchema.parse(req.params);
    if (!requireUser(req, res)) return;

    const task = await taskService.getById({ id, ownerId: req.user!.id });

    if (!task) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Task not found" },
      });
      return;
    }

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};