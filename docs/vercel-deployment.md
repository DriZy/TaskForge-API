# TaskForge — Vercel Deployment Guide

This guide covers deploying TaskForge-API to **Vercel** with a **managed
PostgreSQL** databasecars (Phase 22). It is the source of truth for the
production/Vercel path; the Docker/compose path (Phase 18) remains for local
**development** and **testing** and is *not* used for Vercel.

> **Design decision:** Vercel hosts **serverless Node functions**, not
> long-running containers. The production architecture is:
>
> ```text
> GitHub → Vercel (Function) → managed PostgreSQL (Neon/Supabase/RDS)
> ```
>
> Because functions are stateless and may spin up many concurrent
> instances, the app is optimized for that runtime (single shared Prisma
> client, <100KB bodies, stateless rate limiting, serverless-friendly entry).

## Prerequisites

- A **Vercel account** (Hobby or Team).
- A **managed PostgreSQL** provider (Neon, Supabase, Vercel Marketplace
  Postgres, or RDS). The app does **not** provision or run PostgreSQL itself
  in production.
- For **preview/production** environment separation: at least two managed
  databases, or one provider account that supports multiple databases/environments.

## What's already in the repo (no code changes needed)

These were prepared in earlier phases so deployment is zero-config:

| Concern | Where handled |
| ------- | ------------- |
| Express entry point that Vercel auto-detects | `src/server.ts` exports the app and starts listening (`npm run dev`/`start`) |
| Single shared PrismaClient (serverless-friendly, avoids pool exhaustion) | `src/repositories/prisma.ts`, consumed by all repositories |
| JSON body limit (protects serverless functions) | `express.json({ limit: "100kb" })` in `src/app.ts` |
| Stateless rate limiting (per-function-instance, works serverlessly) | `src/routes/auth.routes.ts` |
| Security headers | `helmet()` in `src/app.ts` |
| `vercel-build` script | `package.json` → runs `prisma generate` + `npm run build` |
| Correct error propagation (never swallow/no unhandled state) | `src/middleware/error-handler.ts`, controllers pass errors via `next(error)` |

## Steps (require dashboard/CLI access — cannot be done from this repo alone)

### 1. Provision managed PostgreSQL

Create two managed databases (or two schemas on one provider, but prefer two
separate DBs for full isolation), e.g.:

- **Preview/Test** — used by pull-request previews
- **Production** — the live database

Capture the **direct connection string** for each. The host will be e.g.
`...pooler` (Neon sibling/pgbouncer) or `...compute.amazonaws.com` (RDS).

### 2. Create the Vercel project

1. In Vercel, **Add New → Project**, select the GitHub repo, **Import**.
2. Vercel auto-detects the **Node.js/Express** preset — no framework config
   needed.
3. Set `Root Directory` to `backend` if the repo root is the monorepo; here the
   root *is* the backend, so leave it at `/`.

### 3. Configure Vercel → GitHub integration

- Vercel automatically registers a deploy webhook on the GitHub repo.
- **Preview deployments** are created for every pull request (from `feature/*`
  and `fix/*` branches).
- **Production** is deployed from the `main` branch on merge.

### 4. Configure environment variables in Vercel

Add these in **Project → Settings → Environment Variables**:

| Variable | Production | Preview |
| -------- | ---------- | ------- |
| `DATABASE_URL` | Production managed DB URL | Preview managed DB URL |
| `NODE_ENV` | `production` | `production` |
| `PORT` | *(Vercel provides the port internally; omit)* | *(omit)* |

> ⚠️ **Never** set `DATABASE_URL` on Vercel to the local Docker Postgres
> (`taskforge` at `127.0.0.1:5432`) — that database only exists inside the
> development container and is unreachable from Vercel.

### 5. Apply schema migrations

Vercel does **not** auto-run `prisma migrate deploy` as part of its build (the
`vercel-build` script only runs `prisma generate` + `npm run build`). Apply
migrations to the managed database once, before first deployment and on every
schema change:

```bash
# from backend/
DATABASE_URL="<production-managed-url>" npx prisma migrate deploy
```

For previews, run the same against the preview DB URL when the preview branch
introduces schema changes.

> Migration is intentionally not part of the Vercel build so that deployments
> never carry implicit, unreviewed DDL to production. CI (Phase 20) runs
> `prisma migrate deploy` against the CI test DB to validate migrations before
> merge.

### 6. Verify

- Open the project URL → `GET /api/health` returns
  `{"success":True,"data":{"status":"ok"}}`.
- Register a user → token returned.
- Create/list/update/delete tasks against the managed DB (pagination,
  filtering, optimistic concurrency `version` 409).
- `GET /api-docs` serves the interactive Swagger UI.
- Confirm `POST /api/auth/*` responds `429` after exceeding the 15-min rate
  limit, and oversized bodies return `413`.

## Environment Separation (never cross them)

| Environment | PostgreSQL | Used by |
| ----------- | ---------- | ------- |
| **Development** | Docker compose `taskforge` DB | Local dev |
| **Test** | Docker compose `taskforge_test` DB | Jest suite (guard-locked to `*_test`) |
| **Preview** | Preview managed DB | Vercel PR previews |
| **Production** | Production managed DB | `main` deployments |

The Jest `test-env.ts` guard refuses any non-`*_test` `DATABASE_URL`, so the
suite can never be pointed at the preview or production database.
