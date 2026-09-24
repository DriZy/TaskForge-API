import { TaskStatus } from "@prisma/client";
import { prisma } from "./prisma";

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

  async findPrivate({
    ownerId,
    status,
    skip = 0,
    take = 20,
    orderBy,
  }: {
    ownerId: string;
    status?: TaskStatus;
    skip?: number;
    take?: number;
    orderBy?: Record<string, unknown>;
  }) {
    return prisma.task.findMany({
      where: { ownerId, isShared: false, ...(status ? { status } : {}) },
      skip,
      take,
      orderBy,
      select: taskSelect,
    });
  },

  async countPrivate({ ownerId, status }: { ownerId: string; status?: TaskStatus }) {
    return prisma.task.count({
      where: { ownerId, isShared: false, ...(status ? { status } : {}) },
    });
  },

  async findShared({
    status,
    skip = 0,
    take = 20,
    orderBy,
  }: {
    status?: TaskStatus;
    skip?: number;
    take?: number;
    orderBy?: Record<string, unknown>;
  }) {
    return prisma.task.findMany({
      where: { isShared: true, ...(status ? { status } : {}) },
      skip,
      take,
      orderBy,
      select: taskSelect,
    });
  },

  async countShared({ status }: { status?: TaskStatus }) {
    return prisma.task.count({
      where: { isShared: true, ...(status ? { status } : {}) },
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

  async deleteScoped({ id, ownerId }: { id: string; ownerId: string }) {
    const result = await prisma.task.deleteMany({
      where: {
        id,
        OR: [{ ownerId, isShared: false }, { isShared: true }],
      },
    });
    return { deleted: result.count === 1 };
  },
};