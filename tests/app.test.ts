import type { Express } from "express";
import request from "supertest";
import { createApp } from "../src/app";

const app: Express = createApp();

describe("Express application skeleton", () => {
  describe("GET /api/health", () => {
    it("returns 200 with the health envelope", async () => {
      const res = await request(app).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { status: "ok" },
      });
    });

    it("sets the JSON content type", async () => {
      const res = await request(app).get("/api/health");

      expect(res.headers["content-type"]).toMatch(/application\/json/);
    });
  });

  describe("unknown routes", () => {
    it("returns 404 with the standard error envelope", async () => {
      const res = await request(app).get("/api/does-not-exist");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      });
    });

    // Phase 6.5: /api/tasks is gated by requireAuth. An unauthenticated caller
    // gets 401 (never a 404 that would reveal which task routes exist).
    it("rejects an unauthenticated caller to a task route with 401", async () => {
      const res = await request(app).get("/api/tasks/not-a-task");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("error response envelope", () => {
    it("always returns success: false for unknown routes", async () => {
      const res = await request(app).get("/api/nope");

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBeDefined();
      expect(res.body.error.message).toBeDefined();
    });
  });
});
