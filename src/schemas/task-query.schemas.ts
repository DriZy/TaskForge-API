import { z } from "zod";

export const taskStatusQuery = z.enum(["todo", "in-progress", "done"]);

export const taskListQuerySchema = z.object({
  list: z.enum(["private", "shared"]).optional(),
  status: taskStatusQuery.optional(),
  page: z.coerce.number().int().min(1, "page must be at least 1").default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, "limit must be at least 1")
    .max(100, "limit must be at most 100")
    .default(20),
});

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;