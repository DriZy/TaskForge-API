import { z } from "zod";

export const taskStatusQuery = z.enum(["todo", "in-progress", "done"]);

export const taskListQuerySchema = z.object({
  list: z.enum(["private", "shared"]).optional(),
  status: taskStatusQuery.optional(),
});

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;