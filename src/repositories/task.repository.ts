import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface TaskCreateInput {
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  dueDate: Date | null;
  ownerId: string;
  isShared: boolean;
}

export const taskRepository = {
  async create(input: TaskCreateInput) {
    return prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        dueDate: input.dueDate,
        ownerId: input.ownerId,
        isShared: input.isShared,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        ownerId: true,
        owner: { select: { id: true, email: true } },
        isShared: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },
};