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

describe("tasks — delete (Phase 12)", () => {
  let app: Express;
  let ownerToken: string;
  let otherToken: string;

  async function register(email: string) {
    const res = await request(app).post("/api/auth/register").send({
      email,
      password: "correct-horse-battery",
    });
    return res.body.data.token;
  }

  async function createTask(token: string, body: Record<string, unknown> = {}) {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "deletable task", ...body });
    return res.body.data;
  }

  async function del(id: string, token: string) {
    return request(app)
      .delete(`/api/tasks/${id}`)
      .set("Authorization", `Bearer ${token}`);
  }

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    ownerToken = await register(`delete-owner-${stamp}@example.com`);
    otherToken = await register(`delete-other-${stamp}@example.com`);
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("deletes an existing task with 204 and no body", async () => {
    const task = await createTask(ownerToken);
    const res = await del(task.id, ownerToken);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("returns 404 when retrieving a deleted task", async () => {
    const task = await createTask(ownerToken);
    await del(task.id, ownerToken);

    const get = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(get.status).toBe(404);
  });

  it("returns 404 for a nonexistent task", async () => {
    const res = await del("00000000-0000-4000-8000-000000000001", ownerToken);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid id", async () => {
    const res = await del("not-a-uuid", ownerToken);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when unauthenticated", async () => {
    const task = await createTask(ownerToken);
    const res = await request(app).delete(`/api/tasks/${task.id}`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for another client's private task without leaking existence", async () => {
    const task = await createTask(ownerToken);
    const res = await del(task.id, otherToken);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");

    const stillThere = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(stillThere.status).toBe(200);
  });

  it("lets any authenticated client delete a shared task", async () => {
    const task = await createTask(ownerToken, { isShared: true });
    const res = await del(task.id, otherToken);
    expect(res.status).toBe(204);

    const get = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(get.status).toBe(404);
  });
});