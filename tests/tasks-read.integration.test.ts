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

describe("tasks — read tasks contract (Phase 8)", () => {
  let app: Express;
  let ownerToken: string;
  let ownerId: string;
  let otherToken: string;

  async function createTask(token: string, body: Record<string, unknown>) {
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
    const owner = await request(app).post("/api/auth/register").send({
      email: `read-owner-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    ownerToken = owner.body.data.token;
    ownerId = owner.body.data.user.id;

    const other = await request(app).post("/api/auth/register").send({
      email: `read-other-${stamp}@example.com`,
      password: "correct-horse-battery",
    });
    otherToken = other.body.data.token;

    // owner: two private + one shared
    await createTask(ownerToken, { title: "owner private one" });
    await createTask(ownerToken, { title: "owner private two" });
    await createTask(ownerToken, { title: "owner shared", isShared: true });

    // other: one private (not visible to owner) + one shared
    await createTask(otherToken, { title: "other private" });
    await createTask(otherToken, { title: "other shared", isShared: true });
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("returns an empty list for a user with no tasks", async () => {
    const fresh = await request(app).post("/api/auth/register").send({
      email: `read-fresh-${Date.now()}@example.com`,
      password: "correct-horse-battery",
    });
    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${fresh.body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it("returns the caller's private tasks in the private list", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const titles = res.body.data.map((t: { title: string }) => t.title);
    expect(titles).toEqual(expect.arrayContaining(["owner private one", "owner private two"]));
  });

  it("private list excludes other owners' tasks", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${ownerToken}`);

    const titles = res.body.data.map((t: { title: string }) => t.title);
    expect(titles).not.toContain("other private");
  });

  it("shared list returns isShared tasks regardless of owner", async () => {
    const res = await request(app)
      .get("/api/tasks?list=shared")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const titles = res.body.data.map((t: { title: string }) => t.title);
    expect(titles).toEqual(expect.arrayContaining(["owner shared", "other shared"]));
    expect(res.body.data.every((t: { isShared: boolean }) => t.isShared)).toBe(true);
  });

  it("does not mix shared tasks into the private list", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${ownerToken}`);

    const titles = res.body.data.map((t: { title: string }) => t.title);
    expect(titles).not.toContain("owner shared");
    expect(titles).not.toContain("other shared");
  });

  it("retrieves an existing owned task by id", async () => {
    const created = await createTask(ownerToken, { title: "retrieve me" });
    const res = await request(app)
      .get(`/api/tasks/${created.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(created.id);
    expect(res.body.data.title).toBe("retrieve me");
  });

  it("returns 404 for a nonexistent task", async () => {
    const res = await request(app)
      .get("/api/tasks/00000000-0000-4000-8000-000000000001")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid task id", async () => {
    const res = await request(app)
      .get("/api/tasks/not-a-uuid")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unauthenticated read with 401", async () => {
    const res = await request(app).get("/api/tasks");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 for another client's private task (no existence leak)", async () => {
    const otherPrivate = await createTask(otherToken, { title: "hidden from owner" });
    const res = await request(app)
      .get(`/api/tasks/${otherPrivate.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns a shared task to any authenticated client", async () => {
    const shared = await createTask(otherToken, { title: "public shared task", isShared: true });
    const res = await request(app)
      .get(`/api/tasks/${shared.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("public shared task");
    expect(res.body.data.isShared).toBe(true);
  });

  it("returns the full contract shape for a single task", async () => {
    const created = await createTask(ownerToken, {
      title: "shape check",
      description: "desc",
      status: "in-progress",
      isShared: false,
    });
    const res = await request(app)
      .get(`/api/tasks/${created.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.body.data.id).toBe(created.id);
    expect(res.body.data.title).toBe("shape check");
    expect(res.body.data.description).toBe("desc");
    expect(res.body.data.status).toBe("in-progress");
    expect(res.body.data.dueDate).toBeNull();
    expect(res.body.data.isShared).toBe(false);
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.ownerId).toBe(ownerId);
    expect(res.body.data.owner).toEqual({
      id: ownerId,
      email: expect.stringMatching(/read-owner-.*@example\.com/),
    });
    expect(res.body.data.createdAt).toBeDefined();
    expect(res.body.data.updatedAt).toBeDefined();
  });

  it("presents nullable fields explicitly in list responses", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((t: { description: unknown; dueDate: unknown }) => {
      return "description" in t && "dueDate" in t;
    })).toBe(true);
  });

  it("rejects an invalid list value with 400", async () => {
    const res = await request(app)
      .get("/api/tasks?list=bogus")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});