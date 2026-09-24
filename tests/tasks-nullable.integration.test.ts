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

describe("tasks — nullable field contract (Phase 11)", () => {
  let app: Express;
  let token: string;

  async function create(body: Record<string, unknown>) {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    return { res, task: res.body.data };
  }

  async function patch(id: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/tasks/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  beforeAll(async () => {
    app = createApp();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();

    const stamp = Date.now();
    const reg = await request(app).post("/api/auth/register").send({
      email: `nullable-owner-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    token = reg.body.data.token;
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe("create", () => {
    it("stores null when description is omitted", async () => {
      const { task } = await create({ title: "no desc" });
      expect(task.description).toBeNull();
    });

    it("stores null when description is null", async () => {
      const { task } = await create({ title: "null desc", description: null });
      expect(task.description).toBeNull();
    });

    it("distinguishes an empty string from null", async () => {
      const { task } = await create({ title: "empty desc", description: "" });
      expect(task.description).toBe("");
    });

    it("preserves a description value", async () => {
      const { task } = await create({ title: "real desc", description: "hello" });
      expect(task.description).toBe("hello");
    });

    it("stores null when dueDate is omitted", async () => {
      const { task } = await create({ title: "no due" });
      expect(task.dueDate).toBeNull();
    });

    it("stores null when dueDate is null", async () => {
      const { task } = await create({ title: "null due", dueDate: null });
      expect(task.dueDate).toBeNull();
    });

    it("preserves a dueDate value", async () => {
      const { task } = await create({ title: "real due", dueDate: "2026-11-01T12:00:00.000Z" });
      expect(task.dueDate).toBe("2026-11-01T12:00:00.000Z");
    });
  });

  describe("update", () => {
    it("preserves description when omitted", async () => {
      const { task } = await create({ title: "keep desc", description: "keep" });
      const res = await patch(task.id, { title: "renamed", version: task.version });
      expect(res.body.data.description).toBe("keep");
    });

    it("clears description with an explicit null", async () => {
      const { task } = await create({ title: "clear desc", description: "bye" });
      const res = await patch(task.id, { description: null, version: task.version });
      expect(res.body.data.description).toBeNull();
    });

    it("replaces a description value", async () => {
      const { task } = await create({ title: "replace desc", description: "old" });
      const res = await patch(task.id, { description: "new", version: task.version });
      expect(res.body.data.description).toBe("new");
    });

    it("preserves dueDate when omitted", async () => {
      const { task } = await create({ title: "keep due", dueDate: "2026-10-01T00:00:00.000Z" });
      const res = await patch(task.id, { title: "renamed", version: task.version });
      expect(res.body.data.dueDate).toBe("2026-10-01T00:00:00.000Z");
    });

    it("clears dueDate with an explicit null", async () => {
      const { task } = await create({ title: "clear due", dueDate: "2026-10-01T00:00:00.000Z" });
      const res = await patch(task.id, { dueDate: null, version: task.version });
      expect(res.body.data.dueDate).toBeNull();
    });

    it("replaces a dueDate value", async () => {
      const { task } = await create({ title: "replace due" });
      const res = await patch(task.id, {
        dueDate: "2026-12-01T12:00:00.000Z",
        version: task.version,
      });
      expect(res.body.data.dueDate).toBe("2026-12-01T12:00:00.000Z");
    });

    it("rejects title: null with 400", async () => {
      const { task } = await create({ title: "no null title" });
      const res = await patch(task.id, { title: null, version: task.version });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects status: null with 400", async () => {
      const { task } = await create({ title: "no null status" });
      const res = await patch(task.id, { status: null, version: task.version });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("responses", () => {
    it("always includes description and dueDate in single-task responses", async () => {
      const { task } = await create({ title: "always keys" });
      const res = await request(app)
        .get(`/api/tasks/${task.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.body.data).toHaveProperty("description");
      expect(res.body.data).toHaveProperty("dueDate");
    });

    it("always includes description and dueDate in list responses", async () => {
      await create({ title: "list keys one" });
      await create({ title: "list keys two" });
      const res = await request(app)
        .get("/api/tasks")
        .set("Authorization", `Bearer ${token}`);
      for (const item of res.body.data) {
        expect(item).toHaveProperty("description");
        expect(item).toHaveProperty("dueDate");
      }
    });
  });
});