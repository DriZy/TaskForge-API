import request from "supertest";
import type { Express } from "express";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://taskforge:taskforge@127.0.0.1:5432/taskforge_test?schema=public";

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

describe("tasks — sorting (Phase 14)", () => {
  let app: Express;

  async function freshUser() {
    const stamp = Date.now() + Math.floor(Math.random() * 100000);
    const reg = await request(app).post("/api/auth/register").send({
      email: `sort-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    return reg.body.data.token;
  }

  async function createTask(token: string, body: Record<string, unknown>) {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    return res.body.data;
  }

  async function list(token: string, query: Record<string, unknown> = {}) {
    return request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .query(query);
  }

  async function patch(token: string, id: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/tasks/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ version: 1, ...body });
  }

  beforeAll(async () => {
    app = createApp();
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("sorts by createdAt ascending", async () => {
    const token = await freshUser();
    const first = await createTask(token, { title: "A" });
    await new Promise((r) => setTimeout(r, 10));
    const second = await createTask(token, { title: "B" });

    const res = await list(token, { sortBy: "createdAt", sortOrder: "asc" });
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([first.id, second.id]);
  });

  it("sorts by createdAt descending", async () => {
    const token = await freshUser();
    const first = await createTask(token, { title: "A" });
    await new Promise((r) => setTimeout(r, 10));
    const second = await createTask(token, { title: "B" });

    const res = await list(token, { sortBy: "createdAt", sortOrder: "desc" });
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([second.id, first.id]);
  });

  it("sorts by title alphabetically", async () => {
    const token = await freshUser();
    await createTask(token, { title: "orange" });
    await createTask(token, { title: "apple" });
    await createTask(token, { title: "banana" });

    const res = await list(token, { sortBy: "title", sortOrder: "asc" });
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["apple", "banana", "orange"]);
  });

  it("sorts by status in enum order", async () => {
    const token = await freshUser();
    await createTask(token, { title: "done", status: "done" });
    await createTask(token, { title: "todo", status: "todo" });
    await createTask(token, { title: "progress", status: "in-progress" });

    const res = await list(token, { sortBy: "status", sortOrder: "asc" });
    expect(res.body.data.map((t: { status: string }) => t.status)).toEqual([
      "todo",
      "in-progress",
      "done",
    ]);
  });

  it("sorts by status descending", async () => {
    const token = await freshUser();
    await createTask(token, { title: "done", status: "done" });
    await createTask(token, { title: "todo", status: "todo" });

    const res = await list(token, { sortBy: "status", sortOrder: "desc" });
    expect(res.body.data.map((t: { status: string }) => t.status)).toEqual(["done", "todo"]);
  });

  it("sorts by dueDate with null due dates after valued ones", async () => {
    const token = await freshUser();
    await createTask(token, { title: "no due" });
    await createTask(token, { title: "later", dueDate: "2026-12-01T00:00:00.000Z" });
    await createTask(token, { title: "earlier", dueDate: "2026-01-01T00:00:00.000Z" });

    const res = await list(token, { sortBy: "dueDate", sortOrder: "asc" });
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual([
      "earlier",
      "later",
      "no due",
    ]);
  });

  it("sorts by updatedAt reflecting latest modification", async () => {
    const token = await freshUser();
    const first = await createTask(token, { title: "touched" });
    const untouched = await createTask(token, { title: "untouched" });
    await patch(token, first.id, { title: "touched again" });

    const res = await list(token, { sortBy: "updatedAt", sortOrder: "desc" });
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([first.id, untouched.id]);
  });

  it("rejects an invalid sort field", async () => {
    const token = await freshUser();
    const res = await list(token, { sortBy: "passwordHash", sortOrder: "asc" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid sort direction", async () => {
    const token = await freshUser();
    const res = await list(token, { sortBy: "createdAt", sortOrder: "sideways" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("defaults to createdAt descending with no sort params", async () => {
    const token = await freshUser();
    const first = await createTask(token, { title: "A" });
    await new Promise((r) => setTimeout(r, 10));
    const second = await createTask(token, { title: "B" });

    const res = await list(token);
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([second.id, first.id]);
  });
});