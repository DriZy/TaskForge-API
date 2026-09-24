import request from "supertest";
import type { Express } from "express";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { errorHandler } from "../src/middleware/error-handler";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://taskforge:taskforge@127.0.0.1:5432/taskforge_test?schema=public";

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

describe("comprehensive coverage — critical paths (Phase 16)", () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe("health endpoint", () => {
    it("reports ok with success true", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { status: "ok" } });
    });

    it("does not require authentication", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
    });

    it("is reachable at the mounted root path", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
    });
  });

  describe("authentication failure paths", () => {
    it("returns 401 when the Authorization header is missing", async () => {
      const res = await request(app).get("/api/tasks");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when the header lacks the Bearer scheme", async () => {
      const res = await request(app)
        .get("/api/tasks")
        .set("Authorization", "Basic abc123");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 for an unknown or expired token", async () => {
      const res = await request(app)
        .get("/api/tasks")
        .set("Authorization", "Bearer deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when the token's owner is deleted (token cascaded away)", async () => {
      const stamp = Date.now();
      const reg = await request(app).post("/api/auth/register").send({
        email: `ghost-token-${stamp}@example.com`,
        password: "correct-horse-battery",
      });
      const token = reg.body.data.token;

      await prisma.user.deleteMany({
        where: { email: `ghost-token-${stamp}@example.com` },
      });

      const res = await request(app)
        .get("/api/tasks")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("unexpected error handling", () => {
    it("responds 500 INTERNAL_ERROR and does not leak error internals", () => {
      const status = jest.fn();
      const json = jest.fn();
      const res = { status: status.mockReturnValue({ json }), json };

      const secret = new Error("psql: FATAL: password authentication failed for user");
      (secret as Error & { sql?: string }).sql =
        "SELECT * FROM users WHERE password_hash = 'hunter2'";

      errorHandler(secret, {} as never, res as never, jest.fn() as never);

      expect(status).toHaveBeenCalledWith(500);
      const payload = json.mock.calls[0][0];
      expect(payload).toEqual({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
      });
    });

    it("masks stack traces and foreign keys from AppError responses when not present", () => {
      const status = jest.fn();
      const json = jest.fn();
      const res = { status: status.mockReturnValue({ json }), json };

      const plain = new Error("root cause: connection string leaked");

      errorHandler(plain, {} as never, res as never, jest.fn() as never);

      const payload = json.mock.calls[0][0];
      expect(JSON.stringify(payload)).not.toContain(plain.message);
      expect(JSON.stringify(payload)).not.toContain("connection string");
    });
  });
});