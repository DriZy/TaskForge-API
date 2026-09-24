import { z } from "zod";

export const taskStatusApi = z.enum(["todo", "in-progress", "done"]);

export const taskStatusDb = {
  todo: "todo",
  "in-progress": "in_progress",
  done: "done",
} as const;

export type TaskStatusApi = z.infer<typeof taskStatusApi>;

export const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "title must not be empty")
    .max(255, "title must be at most 255 characters"),
  description: z.string().max(10000, "description is too long").nullable().optional(),
  status: taskStatusApi.optional(),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  isShared: z.boolean().optional(),
}).strict();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;