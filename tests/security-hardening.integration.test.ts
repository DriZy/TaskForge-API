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

describe("security hardening (Phase 17)", () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe("security headers", () => {
    it("sets security headers and hides the framework fingerprint", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("enforces a content security policy", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    });
  });

  describe("request body limit", () => {
    it("rejects oversized JSON bodies with 413", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "oversize@example.com", password: "x".repeat(200_000) });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("REQUEST_TOO_LARGE");
    });

    it("does not expose internals on the 413 response", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "oversize@example.com", password: "x".repeat(200_000) });
      expect(JSON.stringify(res.body)).not.toContain("PayloadTooLargeError");
      expect(JSON.stringify(res.body)).not.toContain("limit");
    });
  });

  describe("auth rate limiting", () => {
    it("limits abusive auth attempts with 429", async () => {
      const limiterApp = createApp({ authRateLimit: { limit: 3, windowMs: 60_000 } });
      const stamp = Date.now();
      const attempt = (i: number) =>
        request(limiterApp)
          .post("/api/auth/register")
          .send({ email: `flood-${i}-${stamp}@example.com`, password: "correct-horse-battery" });

      expect((await attempt(0)).status).toBe(201);

      const statuses: number[] = [];
      for (let i = 1; i <= 6; i++) statuses.push((await attempt(i)).status);

      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBe(201);
      expect(statuses.slice(2)).toEqual([429, 429, 429, 429]);
      expect((await attempt(7)).body.error.code).toBe("RATE_LIMITED");
    });
  });
});