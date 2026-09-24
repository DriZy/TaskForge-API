import { PrismaClient, TaskStatus } from "@prisma/client";

const prisma = new PrismaClient();

const taskSelect = {
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
} as const;

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
      select: taskSelect,
    });
  },

  async findPrivate({ ownerId, status }: { ownerId: string; status?: TaskStatus }) {
    return prisma.task.findMany({
      where: { ownerId, isShared: false, ...(status ? { status } : {}) },
      select: taskSelect,
    });
  },

  async findShared({ status }: { status?: TaskStatus }) {
    return prisma.task.findMany({
      where: { isShared: true, ...(status ? { status } : {}) },
      select: taskSelect,
    });
  },

  async findVisible({ id, ownerId }: { id: string; ownerId: string }) {
    return prisma.task.findFirst({
      where: {
        id,
        OR: [{ ownerId, isShared: false }, { isShared: true }],
      },
      select: taskSelect,
    });
  },

  async updateWithVersion({
    id,
    version,
    data,
  }: {
    id: string;
    version: number;
    data: { title?: string; description?: string | null; status?: TaskStatus; dueDate?: Date | null };
  }) {
    const result = await prisma.task.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) return { outcome: "conflict" as const };

    const updated = await prisma.task.findUnique({ where: { id }, select: taskSelect });
    return { outcome: "updated" as const, task: updated! };
  },
};