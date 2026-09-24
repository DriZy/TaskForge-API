import { TaskStatus } from "@prisma/client";
import { taskRepository } from "../repositories/task.repository";

const statusApiToDb: Record<"todo" | "in-progress" | "done", TaskStatus> = {
  todo: TaskStatus.todo,
  "in-progress": TaskStatus.in_progress,
  done: TaskStatus.done,
};

const statusDbToApi: Record<TaskStatus, "todo" | "in-progress" | "done"> = {
  [TaskStatus.todo]: "todo",
  [TaskStatus.in_progress]: "in-progress",
  [TaskStatus.done]: "done",
};

export type TaskStatusApi = keyof typeof statusApiToDb;

type TaskRow = Awaited<ReturnType<typeof taskRepository.create>>;

function serialize(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: statusDbToApi[task.status],
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    ownerId: task.ownerId,
    owner: task.owner,
    isShared: task.isShared,
    version: task.version,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export interface CreateTaskParams {
  title: string;
  description?: string | null;
  status?: "todo" | "in-progress" | "done";
  dueDate?: string | null;
  isShared?: boolean;
  ownerId: string;
}

export type TaskList = "private" | "shared";

export const taskService = {
  async create(params: CreateTaskParams) {
    const status: TaskStatus = params.status
      ? statusApiToDb[params.status]
      : TaskStatus.todo;

    const task = await taskRepository.create({
      title: params.title,
      description: params.description ?? null,
      status,
      dueDate: params.dueDate ? new Date(params.dueDate) : null,
      ownerId: params.ownerId,
      isShared: params.isShared ?? false,
    });

    return serialize(task);
  },

  async list({ list, ownerId }: { list: TaskList; ownerId: string }) {
    const rows = list === "shared"
      ? await taskRepository.findShared()
      : await taskRepository.findPrivate({ ownerId });

    return rows.map(serialize);
  },

  async getById({ id, ownerId }: { id: string; ownerId: string }) {
    const task = await taskRepository.findVisible({ id, ownerId });
    return task ? serialize(task) : null;
  },
};