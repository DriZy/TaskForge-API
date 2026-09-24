import request from "supertest";
import type { Express } from "express";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://taskforge:taskforge@127.0.0.1:5432/taskforge_test?schema=public";

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

describe("tasks — update task contract (Phase 10)", () => {
  let app: Express;
  let token: string;
  let otherToken: string;

  async function createTask(body: Record<string, unknown>, useOther = false) {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${useOther ? otherToken : token}`)
      .send(body);
    return res.body.data;
  }

  async function patch(id: string, body: Record<string, unknown>, bearer = token) {
    return request(app)
      .patch(`/api/tasks/${id}`)
      .set("Authorization", `Bearer ${bearer}`)
      .send(body);
  }

  beforeAll(async () => {
    app = createApp();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();

    const stamp = Date.now();
    const owner = await request(app).post("/api/auth/register").send({
      email: `patch-owner-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    token = owner.body.data.token;

    const other = await request(app).post("/api/auth/register").send({
      email: `patch-other-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    otherToken = other.body.data.token;
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("updates the title", async () => {
    const task = await createTask({ title: "old title" });
    const res = await patch(task.id, { title: "new title", version: task.version });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("new title");
    expect(res.body.data.version).toBe(task.version + 1);
  });

  it("updates the description", async () => {
    const task = await createTask({ title: "desc update", description: "old" });
    const res = await patch(task.id, { description: "new", version: task.version });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe("new");
  });

  it("updates the status", async () => {
    const task = await createTask({ title: "status update" });
    const res = await patch(task.id, { status: "done", version: task.version });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("done");
  });

  it("updates the due date", async () => {
    const task = await createTask({ title: "due update" });
    const res = await patch(task.id, {
      dueDate: "2026-11-01T12:00:00.000Z",
      version: task.version,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.dueDate).toBe("2026-11-01T12:00:00.000Z");
  });

  it("applies a partial update leaving other fields intact", async () => {
    const task = await createTask({
      title: "partial",
      description: "keep me",
      status: "in-progress",
      dueDate: "2026-10-01T00:00:00.000Z",
    });
    const res = await patch(task.id, { title: "partial v2", version: task.version });

    expect(res.body.data.title).toBe("partial v2");
    expect(res.body.data.description).toBe("keep me");
    expect(res.body.data.status).toBe("in-progress");
    expect(res.body.data.dueDate).toBe("2026-10-01T00:00:00.000Z");
  });

  it("rejects an empty title with 400", async () => {
    const task = await createTask({ title: "t" });
    const res = await patch(task.id, { title: "   ", version: task.version });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid status with 400", async () => {
    const task = await createTask({ title: "t" });
    const res = await patch(task.id, { status: "in_progress", version: task.version });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid due date with 400", async () => {
    const task = await createTask({ title: "t" });
    const res = await patch(task.id, { dueDate: "not-a-date", version: task.version });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a nonexistent task", async () => {
    const res = await patch("00000000-0000-4000-8000-000000000001", {
      title: "x",
      version: 1,
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid task id", async () => {
    const res = await patch("not-a-uuid", { title: "x", version: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("clears and restores nullable fields", async () => {
    const task = await createTask({ title: "nullable", description: "here", dueDate: "2026-10-01T00:00:00.000Z" });
    const cleared = await patch(task.id, { description: null, dueDate: null, version: task.version });

    expect(cleared.status).toBe(200);
    expect(cleared.body.data.description).toBeNull();
    expect(cleared.body.data.dueDate).toBeNull();

    const restored = await patch(task.id, {
      description: "back",
      dueDate: "2026-12-01T00:00:00.000Z",
      version: cleared.body.data.version,
    });
    expect(restored.body.data.description).toBe("back");
    expect(restored.body.data.dueDate).toBe("2026-12-01T00:00:00.000Z");
  });

  it("rejects a missing version with 400", async () => {
    const task = await createTask({ title: "no version" });
    const res = await patch(task.id, { title: "still no version" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a stale version with 409", async () => {
    const task = await createTask({ title: "stale" });
    await patch(task.id, { title: "bumped", version: task.version });

    const res = await patch(task.id, { title: "stale again", version: task.version });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns 404 updating another client's private task", async () => {
    const otherTask = await createTask({ title: "not mine" }, true);
    const res = await patch(otherTask.id, { title: "hijack", version: otherTask.version });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects patching protected fields with 403", async () => {
    const task = await createTask({ title: "protected" });
    const res = await patch(task.id, { isShared: true, version: task.version });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const task = await createTask({ title: "gate" });
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ title: "x", version: task.version });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});