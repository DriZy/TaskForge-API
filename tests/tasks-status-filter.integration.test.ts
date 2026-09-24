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

describe("tasks — status filtering (Phase 9)", () => {
  let app: Express;
  let token: string;

  async function createTask(body: Record<string, unknown>) {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    return res.body.data;
  }

  beforeAll(async () => {
    app = createApp();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();

    const stamp = Date.now();
    const reg = await request(app).post("/api/auth/register").send({
      email: `filter-owner-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    token = reg.body.data.token;

    await createTask({ title: "todo private" });
    await createTask({ title: "progress private", status: "in-progress" });
    await createTask({ title: "done private", status: "done" });
    await createTask({ title: "todo shared", isShared: true });
    await createTask({ title: "done shared", status: "done", isShared: true });
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  async function list(query: string) {
    const res = await request(app)
      .get(`/api/tasks${query}`)
      .set("Authorization", `Bearer ${token}`);
    return res.body.data.map((t: { title: string }) => t.title);
  }

  it("filters the private list by todo", async () => {
    const titles = await list("?status=todo");
    expect(titles).toEqual(["todo private"]);
  });

  it("filters the private list by in-progress", async () => {
    const titles = await list("?status=in-progress");
    expect(titles).toEqual(["progress private"]);
  });

  it("filters the private list by done", async () => {
    const titles = await list("?status=done");
    expect(titles).toEqual(["done private"]);
  });

  it("rejects an invalid status with 400", async () => {
    const res = await request(app)
      .get("/api/tasks?status=backlog")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns an empty list when nothing matches", async () => {
    const res = await request(app)
      .get("/api/tasks?list=shared&status=in-progress")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.data).toEqual([]);
  });

  it("returns all tasks when no status is given", async () => {
    const titles = (await list("")).sort();
    expect(titles).toEqual(["done private", "progress private", "todo private"]);
  });

  it("filters the shared list by status", async () => {
    const res = await request(app)
      .get("/api/tasks?list=shared&status=todo")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["todo shared"]);
  });

  it("filters the shared list by done", async () => {
    const res = await request(app)
      .get("/api/tasks?list=shared&status=done")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["done shared"]);
  });
});