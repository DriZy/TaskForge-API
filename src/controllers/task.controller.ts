import type { RequestHandler } from "express";
import { createTaskSchema } from "../schemas/task.schemas";
import { taskService } from "../services/task.service";

export const createTaskHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createTaskSchema.parse(req.body);
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const task = await taskService.create({
      ...parsed,
      ownerId: user.id,
    });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};