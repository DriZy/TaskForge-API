import { z } from "zod";

export const taskListQuerySchema = z.object({
  list: z.enum(["private", "shared"]).optional(),
});

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;