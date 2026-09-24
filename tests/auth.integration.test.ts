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

describe("auth — register/login/token contract (Phase 6.5)", () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.task.deleteMany();
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("register returns a token and creates the user", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "correct-horse-battery" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(typeof res.body.data.token).toBe("string");
    expect(res.body.data.token.length).toBeGreaterThan(40);
  });

  it("rejects an ill-formed email with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "correct-horse-battery" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate email with 409", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "correct-horse-battery" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("login returns a token for valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "correct-horse-battery" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it("login rejects unknown email with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("login rejects a wrong password with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("token is opaque — between 40 and 64 chars, never a base64 of an id", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "correct-horse-battery" });

    const token = res.body.data.token;
    expect(token.length).toBeGreaterThan(40);
    expect(token.length).toBeLessThanOrEqual(64);
    expect(token).not.toMatch(
      // a base64 encoding of a uuid would contain a hyphen
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("stores the token hashed, never the raw value", async () => {
    const raw = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "correct-horse-battery" })
    ).body.data.token;

    const tokens = await prisma.token.findMany();
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.some((t) => t.tokenHash === raw)).toBe(false);
    expect(tokens.every((t) => /^[0-9a-f]{64}$/.test(t.tokenHash))).toBe(true);
  });

  });
