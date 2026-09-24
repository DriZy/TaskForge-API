# TaskForge-API

Production-quality REST API for team task management. Built to exercise a
clean, layered Node.js/Express discipline: **obviously correct, verifiably
tested, and read in five minutes.**

- **Auth** — register + login with opaque bearer tokens (bcrypt hashing;
  no JWTs).
- **Tasks** — create, list, get, update (optimistic-concurrency `version`),
  delete; owner-scoped with optional `isShared` visibility.
- **Filtering / sorting / pagination** — status and list filters, a fixed sort
  allowlist, page/limit pagination.
- **Docs** — generated, always-accurate OpenAPI 3.1 spec served as live
  Swagger UI at `/api-docs` plus a JSON contract at `/api-docs.json`.

## Team

This repo descends from the **FonX Lab** take-home prompt and is developed by a
multi-agent team. The **primary author** is the **Main Agent**. Work is broken
into 28 numbered phases driven by `tasks.md` → **Phase 24 is docs**; see
[Docs](#documentation).

## Tech stack

| Layer | Choice | Why |
| ----- | ------ | --- |
| Runtime | Node.js ≥ 24 (LTS line) | current platform, single VM |
| Language | TypeScript 5, strict mode | safety net over the whole graph |
| HTTP | Express 5 | the de-facto, boring, well-audited router |
| Validation | Zod 4 | schema-first shapes shared by routes + docs |
| Persistence | PostgreSQL 16 + Prisma 6 | real ACID, real migrations |
| Auth | bcryptjs + opaque tokens | HTTPS-only, no self-rolled crypto |
| Security | helmet + express-rate-limit + 100kb body cap | default-deny posture |
| Tests | Jest 30 + Supertest, isolated `*_test` Postgres | nobody touches prod data |
| CI/CD | GitHub Actions + Vercel | gates every push; deploys from `main` |

## Getting Started

### Prerequisites

* Node.js ≥ 24 (`node -v`)
* Docker Desktop / Engine + Compose v2 (`docker compose version`)
* A `.env` copied from `.env.example` (see [Environment](#environment))

### 1. Start Postgres (compose)

```bash
docker compose up -d postgres
```

This creates both databases the project needs: the **development** `taskforge`
DB and the isolated `taskforge_test` DB (via
`docker/postgres-init/01-create-test-db.sh`).

### 2. Run migrations

```bash
npm run db:migrate        # prisma migrate dev (dev DB)
npm run db:generate       # prisma generate
```

### 3. Start the API

```bash
npm run dev               # tsx watch — http://localhost:3000
npm run build && npm start  # production-style run
```

### 4. Try it

```bash
curl http://localhost:3000/api/health
# {"success":true,"data":{"status":"ok"}}

curl http://localhost:3000/api-docs
# interactive Swagger UI — try register → use the returned token → CRUD tasks
```

## Environment

Copy `.env.example` → `.env` and set `DATABASE_URL`:

```dotenv
DATABASE_URL="postgresql://taskforge:taskforge@127.0.0.1:5432/taskforge?schema=public"
```

| Variable | Required | Default | Purpose |
| -------- | -------- | ------- | ------- |
| `DATABASE_URL` | yes | — | Prisma `postgresql://` connection string |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `3000` | HTTP listen port |

Repositories (and rate-limit/body-limit settings) are read from `.env`; the
**test suite pins its own `*_test` DB and refuses anything else** — see
`docs/database.md` and the `test-env.ts` guard.

## Testing

```bash
npm test                 # all suites — run in-band
npm run test:coverage    # same, plus coverage via Istanbul
```

Coverage gate (CI-enforced):

| Metric | Threshold |
| ------ | --------- |
| Statements | ≥ 90% |
| Branches | ≥ 80% |
| Functions | ≥ 90% |
| Lines | ≥ 90% |

Latest measured: **99.06% statements, 88.11% branches, 100% functions,
99.33% lines** (143 tests, 16 suites). Tests never touch the dev/prod DB —
the Jest `test-env` guard hard-fails on any non-`*_test` `DATABASE_URL`.

## API Endpoints

The authoritative reference is the live Swagger UI (`/api-docs`) and
[`docs/api.md`](docs/api.md). Summary:

### Auth

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/auth/register` | Create account → token |
| `POST` | `/api/auth/login` | Log in → token |

Rate-limited: 100 requests / 15 min / IP → `429 RATE_LIMITED`.

### Tasks (bearer token required)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/tasks` | Create a task |
| `GET` | `/api/tasks` | List — filter/sort/paginate |
| `GET` | `/api/tasks/:id` | Get one owned/visible task |
| `PATCH` | `/api/tasks/:id` | Update (sends `version`) |
| `DELETE` | `/api/tasks/:id` | Delete |

### Misc

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api-docs` | Swagger UI |
| `GET` | `/api-docs.json` | OpenAPI JSON |

## Project Structure

```text
TaskForge-API/
├── src/
│   ├── app.ts              # Express assembly (helmet, body cap, routers)
│   ├── server.ts           # entrypoint — dev watch / built start
│   ├── config/             # env parsing + typing
│   ├── controllers/        # HTTP handlers
│   ├── middleware/         # require-auth, error handler, not-found, rate limit
│   ├── repositories/       # persistence — single shared Prisma client
│   ├── routes/             # Express routers + rate limiting
│   ├── schemas/            # Zod schema = single source of truth
│   ├── services/           # business logic + token hashing
│   └── docs/openapi.*      # OpenAPI 3.1 generator (one true spec)
├── prisma/
│   └── schema.prisma       # Prisma schema + migrations
├── tests/
│   ├── *.integration.test.ts
│   └── test-env.ts         # hard guard: tests only run against *_test DB
├── docs/                   # architecture, database, api, security, vercel
├── Dockerfile              # production image
├── Dockerfile.dev          # dev image (hot reload)
├── docker-compose.yml
└── package.json
```

## Deployment

See [`docs/vercel-deployment.md`](docs/vercel-deployment.md): deploy to the
**Vercel platform** with a **managed PostgreSQL** provider (Neon / Supabase /
RDS). The commit hook `vercel-build` runs `prisma generate && npm run build`
so the generated client is correct for the function build.

## Documentation

* [`docs/architecture.md`](docs/architecture.md) — the design, layers, decisions
* [`docs/database.md`](docs/database.md) — schema, migrations, test-DB isolation
* [`docs/api.md`](docs/api.md) — request/response contract per endpoint
* [`docs/security-review.md`](docs/security-review.md) — threat model + defenses
* [`docs/vercel-deployment.md`](docs/vercel-deployment.md) — deploy guide
* [`docs/scalability.md`](docs/scalability.md) — growth path to ~1M users

---

## License / Legal

Private-created project. Everything in this repository — code, docs, tests,
and this file — is produced for the exercise described in `tasks.md` and is
bound by the same terms. No material in this repository is copied from any
third party. Loyalty (credits) for the exercise belongs to **FonX Lab**.
