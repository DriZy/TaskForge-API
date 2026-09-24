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

describe("tasks — pagination (Phase 13)", () => {
  let app: Express;
  let token: string;

  async function createTask(title: string) {
    await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title });
  }

  async function list(query: Record<string, unknown> = {}) {
    return request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .query(query);
  }

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    const reg = await request(app).post("/api/auth/register").send({
      email: `pagination-owner-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    token = reg.body.data.token;

    await prisma.task.deleteMany();
    for (let i = 0; i < 25; i++) {
      await createTask(`task-${i}`);
    }
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("applies default pagination of page=1 limit=20", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
  });

  it("returns page 2 with the remaining tasks", async () => {
    const res = await list({ page: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination).toEqual({ page: 2, limit: 20, total: 25, totalPages: 2 });
  });

  it("honors a custom limit", async () => {
    const res = await list({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
  });

  it("rejects an invalid page", async () => {
    const res = await list({ page: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects page below 1", async () => {
    const res = await list({ page: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid limit", async () => {
    const res = await list({ limit: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a limit above the maximum of 100", async () => {
    const res = await list({ limit: 101 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("allows the maximum limit of 100", async () => {
    const res = await list({ limit: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(25);
    expect(res.body.pagination.limit).toBe(100);
  });

  it("returns accurate total and empty page for out-of-range pages", async () => {
    const res = await list({ page: 99 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination).toEqual({ page: 99, limit: 20, total: 25, totalPages: 2 });
  });

  it("reports accurate totalPages when total divides evenly", async () => {
    const res = await list({ limit: 5 });
    expect(res.body.pagination).toEqual({ page: 1, limit: 5, total: 25, totalPages: 5 });
  });
});