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

describe("tasks — combined filter + sort + pagination (Phase 15)", () => {
  let app: Express;
  let token: string;

  const todoFixture = [
    { title: "todo-1", dueDate: "2026-01-15T00:00:00.000Z" },
    { title: "todo-2", dueDate: "2026-02-15T00:00:00.000Z" },
    { title: "todo-3", dueDate: "2026-03-15T00:00:00.000Z" },
  ];

  async function createTask(body: Record<string, unknown>) {
    await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  async function list(query: Record<string, unknown>) {
    return request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .query(query);
  }

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now() + Math.floor(Math.random() * 100000);
    const reg = await request(app).post("/api/auth/register").send({
      email: `combined-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    token = reg.body.data.token;

    for (const t of todoFixture) await createTask({ ...t, status: "todo" });
    await createTask({ title: "holiday", dueDate: "2026-08-01T00:00:00.000Z", status: "done" });
    await createTask({ title: "planning", dueDate: "2026-04-01T00:00:00.000Z", status: "in-progress" });
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("filters, sorts and paginates together (page 1)", async () => {
    const res = await list({ status: "todo", sortBy: "dueDate", sortOrder: "asc", page: 1, limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["todo-1", "todo-2"]);
    expect(res.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it("returns the filtered remainder on page 2", async () => {
    const res = await list({ status: "todo", sortBy: "dueDate", sortOrder: "asc", page: 2, limit: 2 });
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["todo-3"]);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it("applies a different sort to the same filter", async () => {
    const res = await list({ status: "todo", sortBy: "dueDate", sortOrder: "desc", page: 1, limit: 10 });
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["todo-3", "todo-2", "todo-1"]);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
  });

  it("keeps total scoped to the filter, unaffected by pagination", async () => {
    const all = await list({});
    const filtered = await list({ status: "done" });
    expect(all.body.pagination.total).toBe(5);
    expect(filtered.body.pagination.total).toBe(1);
    expect(filtered.body.data.map((t: { title: string }) => t.title)).toEqual(["holiday"]);
  });

  it("is deterministic for a combined query (round-trip)", async () => {
    const first = await list({ status: "todo", sortBy: "dueDate", sortOrder: "asc", page: 1, limit: 3 });
    const second = await list({ status: "todo", sortBy: "dueDate", sortOrder: "asc", page: 1, limit: 3 });
    expect(first.body.data.map((t: { title: string }) => t.title)).toEqual(
      second.body.data.map((t: { title: string }) => t.title),
    );
    expect(first.body.data.map((t: { title: string }) => t.title)).toEqual(["todo-1", "todo-2", "todo-3"]);
  });
});