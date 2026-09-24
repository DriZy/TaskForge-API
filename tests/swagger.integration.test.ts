import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";

describe("swagger/openapi docs (Phase 16 add-on)", () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it("serves the OpenAPI spec as JSON at /api-docs.json", async () => {
    const res = await request(app).get("/api-docs.json");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.openapi).toBe("3.1.0");
    expect(res.body.info.title).toBe("TaskForge API");
  });

  it("exposes every real endpoint in the spec", async () => {
    const res = await request(app).get("/api-docs.json");
    const paths = Object.keys(res.body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/health",
        "/api/auth/register",
        "/api/auth/login",
        "/api/tasks",
        "/api/tasks/{id}",
      ]),
    );
  });

  it("documents the bearer security scheme on task operations", async () => {
    const res = await request(app).get("/api-docs.json");
    expect(res.body.components.securitySchemes.bearerAuth.type).toBe("http");
    expect(res.body.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
    expect(res.body.paths["/api/tasks"].get.security).toEqual([{ bearerAuth: [] }]);
  });

  it("documents the full task lifecycle methods", async () => {
    const res = await request(app).get("/api-docs.json");
    const methods = Object.keys(res.body.paths["/api/tasks/{id}"]);
    expect(methods).toEqual(expect.arrayContaining(["get", "patch", "delete"]));
  });

  it("serves the swagger UI at /api-docs", async () => {
    const res = await request(app).get("/api-docs/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("swagger-ui");
  });

  it("redirects /api-docs to the trailing-slash UI", async () => {
    const res = await request(app).get("/api-docs");
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe("/api-docs/");
  });

  it("uses 3.1.0 response schema refs consistently", async () => {
    const res = await request(app).get("/api-docs.json");
    const create = res.body.paths["/api/tasks"].post.responses["201"].content["application/json"].schema;
    expect(create).toHaveProperty("properties.data");
    expect(create.properties.data).toEqual({ $ref: "#/components/schemas/Task" });
  });
});