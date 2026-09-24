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

describe("tasks — create task contract (Phase 7)", () => {
  let app: Express;
  let token: string;
  let ownerId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();

    const stamp = Date.now();
    const res = await request(app).post("/api/auth/register").send({
      email: `create-owner-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    token = res.body.data.token;
    ownerId = res.body.data.user.id;

    const other = await request(app).post("/api/auth/register").send({
      email: `create-other-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    void other;
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("creates a valid private task with title only", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Write weekly report" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Write weekly report");
    expect(res.body.data.id).toBeDefined();
  });

  it("creates a valid shared task", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Shared onboarding doc", isShared: true });

    expect(res.status).toBe(201);
    expect(res.body.data.isShared).toBe(true);
  });

  it("creates a valid private task with isShared false", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Private planning notes", isShared: false });

    expect(res.status).toBe(201);
    expect(res.body.data.isShared).toBe(false);
  });

  it("rejects a missing title with 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty title with 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a whitespace-only title with 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid status with 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Bad status", status: "in_progress" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid due date with 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Bad date", dueDate: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("defaults status to todo", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Default status task" });

    expect(res.body.data.status).toBe("todo");
  });

  it("defaults isShared to false", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Default privacy task" });

    expect(res.body.data.isShared).toBe(false);
  });

  it("stores null description when omitted", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "No description task" });

    expect(res.status).toBe(201);
    expect(res.body.data.description).toBeNull();
  });

  it("stores null dueDate when omitted", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "No due date task" });

    expect(res.status).toBe(201);
    expect(res.body.data.dueDate).toBeNull();
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "No token task" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects ownerId in the body with 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Spoofed owner", ownerId: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("keys the task to the authenticated owner", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Owned task" });

    expect(res.body.data.ownerId).toBe(ownerId);
    const persisted = await prisma.task.findUnique({
      where: { id: res.body.data.id },
    });
    expect(persisted?.ownerId).toBe(ownerId);
  });

  it("initializes version to 1", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Versioned task" });

    expect(res.body.data.version).toBe(1);
  });
});