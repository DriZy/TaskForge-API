# TaskForge-API — Architecture

## 1. Overview

TaskForge-API is a production-quality REST API for task management. This document defines the
application architecture that governs every later implementation phase.

The primary architectural goal is **clarity and maintainability over cleverness**. Complexity is
introduced only when a concrete requirement justifies it.

---

## 2. Architectural Style

The default architecture is a **modular monolith**:

```text
Modular Monolith
+ Managed PostgreSQL
+ Stateless API
```

Explanations:

- An API serves one bounded product: task management. There is no reason to split it into
  microservices at this stage.
- No message brokers, event sourcing, CQRS, or Kubernetes plans exist for the current scope.
- The API is **stateless** (no in-memory session state), which keeps every server instance
  interchangeable and enables horizontal scaling later (see Section 9).

### Explicitly Rejected (for now)

| Pattern / Technology     | Reason                                        | When to reconsider        |
| ------------------------ | --------------------------------------------- | ------------------------- |
| Microservices            | No independent scaling/deployment requirement | Independent teams/deploys |
| CQRS / Event sourcing    | No write/read imbalance in the task domain    | Complex write paths       |
| Message brokers / queues | No asynchronous workloads in scope            | Notifications, imports    |
| Redis / cache            | Not yet justified by load or latency          | Measurable cache hits     |
| Kubernetes               | Vercel + managed PostgreSQL cover current ops | Own infrastructure        |

---

## 3. Layered Architecture

Every HTTP request follows a strict layer chain. Layers depend in one direction only —
**downward**. No layer calls a layer above it.

```text
HTTP Request
    ↓
Route
    ↓
Validation
    ↓
Controller
    ↓
Service
    ↓
Repository
    ↓
Prisma
    ↓
PostgreSQL
```

### 3.1 Request Lifecycle

| Step         | Responsible For                                     |
| ------------ | --------------------------------------------------- |
| HTTP Request | Express receives the request                        |
| Route        | Registers method + URL + middleware + controller    |
| Validation   | Validates body / params / query against Zod schemas |
| Controller   | Reads validated input, calls service, maps response |
| Service      | Applies business logic, coordinates repositories    |
| Repository   | Executes Prisma data-access operations              |
| Prisma       | ORM query generation and database driver            |
| PostgreSQL   | Persistent storage                                  |

---

## 4. Layer Responsibilities

### 4.1 Routes (`src/routes/`)

Responsible for:

- HTTP method
- URL path
- Middleware registration (validation, etc.)
- Controller registration

A route file wires a path to a controller. It contains **no business logic**.

### 4.2 Validation (`src/schemas/` + `src/middleware/`)

Responsible for:

- Request body validation
- Route parameter validation
- Query parameter validation

Zod schemas live in `src/schemas/`. A reusable validation middleware applies the schema before the
controller runs. Invalid input never reaches the controller or service.

### 4.3 Controllers (`src/controllers/`)

Responsible for:

- Reading validated HTTP input
- Calling services
- Mapping results to HTTP responses
- Selecting HTTP status codes

**Controllers must not contain:**

- Database queries
- Business logic
- Direct Prisma access

Controllers translate service outcomes into the response envelope (Section 6.2).

### 4.4 Services (`src/services/`)

Responsible for:

- Application / business logic
- Coordinating repositories
- Applying business rules (e.g., nullable-field semantics, status transitions)

**Services must not:**

- Depend on Express `req` / `res` objects
- Import HTTP middleware or route concerns
- Touch the database directly (they call repositories)

This keeps services testable with plain function arguments.

### 4.5 Repositories (`src/repositories/`)

Responsible for:

- Database persistence
- Prisma queries
- Database-specific operations (filtering, sorting, pagination at the DB level)

Repositories are the **only** layer that constructs Prisma calls. Services depend on repository
interfaces, not on Prisma directly.

### 4.6 Prisma

Responsible for:

- ORM / database access
- Migrations
- Schema representation (`prisma/schema.prisma`)

### 4.7 Configuration (`src/config/`)

Responsible for:

- Loading environment variables
- Validating them once at startup (with Zod)
- Exposing a typed, readonly config object

---

## 5. Dependency Direction Rules

```text
routes        → middleware, controllers
controllers   → services
services      → repositories
repositories  → prisma client
prisma        → PostgreSQL
```

Enforced rules:

1. A layer may depend only on layers strictly below it.
2. `services/` must never import from `express` types (`Request`, `Response`).
3. `controllers/` must never construct Prisma queries.
4. `repositories/` holds all data-access code.
5. Cross-layer data travels in plain typed objects (DTOs), not Express objects.
6. No layer reaches into another layer's implementation details beyond its public interface.

---

## 6. Error-Handling Strategy

### 6.1 Error Model

A single `AppError` hierarchy produces the consistent error envelope.

| Error              | HTTP Status | Code               | Notes                    |
| ------------------ | ----------- | ------------------ | ------------------------ |
| Zod validation     | 400         | `VALIDATION_ERROR` | Field-level details      |
| Invalid request    | 400         | `INVALID_REQUEST`  | Malformed body/params    |
| Resource not found | 404         | `NOT_FOUND`        | Unknown task id          |
| Database failure   | 500         | `DATABASE_ERROR`   | Mapped Prisma exceptions |
| Unexpected error   | 500         | `INTERNAL_ERROR`   | Catch-all                |

### 6.2 Response Envelopes

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "field": "title", "message": "Title is required" }]
  }
}
```

### 6.3 Centralized Error Middleware

All errors funnel into a single error-handling middleware registered last in the Express app
(`src/middleware/error.ts`). It:

1. Identifies the error type (validation / not-found / database / unknown).
2. Maps it to the envelope above.
3. In production, strips stack traces, SQL statements, filenames and env details from the response.
4. Logs full details server-side only.

### 6.4 Unknown Routes

A catch-all handler returns `404 NOT_FOUND` for unregistered paths, wrapped in the error envelope.

---

## 7. Configuration Strategy

- All configuration comes from environment variables (see `.env.example`).
- Minimum set: `DATABASE_URL`, `PORT`, `NODE_ENV`.
- `src/config/env.ts` validates the environment once at startup with a Zod schema and **fails fast**
  on missing or invalid values.
- The typed config object is the single access point; code never reads `process.env` directly.
- `.env` is never committed; `.env.example` contains placeholders only.
- No secrets (credentials, connection strings with passwords) exist in source code.

---

## 8. Validation Strategy

- **Zod** is the only validation library.
- Input surface covered: request **body**, route **params** (`:id`), query **params**
  (`status`, `page`, `limit`, `sortBy`, `sortOrder`).
- Schemas are centralized in `src/schemas/` and reused by both runtime validation and tests.
- A small `validate` middleware applies the appropriate schema to the correct input channel
  (`body` / `params` / `query`) and short-circuits with `400 VALIDATION_ERROR` on failure.
- Query safety:
  - Filtering by status validates against the enum `todo | in-progress | done`.
  - Sorting uses an **explicit allowlist** mapping public field names to real Prisma fields.
    Arbitrary user input is never interpolated into a `orderBy` key.
  - Pagination bounds `limit` to `1..100` and defaults `page=1`, `limit=20`.

---

## 9. Testing Strategy

### 9.1 TDD

Every feature phase follows RED → GREEN → REFACTOR:

```text
Write failing test
    ↓
Run test → RED
    ↓
Implement minimum solution
    ↓
Run test → GREEN
    ↓
Refactor and re-run regression
```

Tests are written before implementation, never after.

### 9.2 Test Pyramid

- **Primary:** API integration tests using `supertest` against the Express `app` (imported without a
  listening socket) and a real, isolated PostgreSQL test database.
- **Secondary:** unit tests for pure service / repository logic where they add value.
- **Not used:** snapshot-heavy or tautological tests.

### 9.3 Isolation Rules

- Dedicated test database, never the production or development database.
- Deterministic, order-independent tests.
- Test state cleaned up between tests.
- No production data ever touched by tests.

### 9.4 Coverage

Target is approximately 20–30 meaningful behavior tests (a guideline, not a number fetish).
Coverage reports are generated with `npm run test:coverage`; the target is behavioral coverage of
critical paths, not an artificial 100%.

---

## 10. Database Access Strategy

- **Prisma** is the ORM. No raw SQL unless a justified requirement appears (currently none).
- The schema (`prisma/schema.prisma`) is the single source of truth, with migrations versioned in
  `prisma/migrations/`.
- Task model: `id` (UUID, PK), `title`, `description`, `status`, `dueDate`, `createdAt`,
  `updatedAt` — nullability per the contract in `tasks.md` Phase 11.
- Indexes are added only where justified by expected queries:
  - `status` (filtering)
  - `dueDate` (sorting)
  - `createdAt` (default sort, pagination)
- Filtering, sorting, and pagination execute **in PostgreSQL** (Prisma `where` / `orderBy` /
  `skip` / `take` + count). The application never loads the full table to filter or paginate
  in JavaScript.
- Sort fields come from an allowlist, preventing arbitrary `orderBy` injection.
- The repository layer keeps Prisma usage out of services and controllers.

---

## 11. Scalability Principles

These principles guide future growth without adding complexity today.

1. **Stateless API** — no server-side session state; any instance can serve any request.
2. **Horizontal scaling** — add API instances behind the platform load balancer; no code change.
3. **Database scaling** — use a managed PostgreSQL; future options are connection pooling, query
   optimization, targeted indexes, read replicas, and partitioning only when justified.
4. **Caching** — Redis may be introduced only when measured workload justifies it, and only with a
   clear cache-invalidation/consistency strategy.
5. **Background work** — queue/worker infrastructure only for genuinely asynchronous workloads
   (notifications, reports, imports).
6. **Observability** — structured logging, health endpoints, and error monitoring are first-class
   from the start (`GET /api/health`).
7. **Keep it simple** — every scaling option above is deferred until a concrete requirement exists.
   The default remains a modular monolith.

---

## 12. Directory Map

```text
src/
├── app.ts            # builds & configures the Express app (no listening socket)
├── server.ts         # starts the HTTP server (imports app.ts)
├── config/           # typed env config, validated at startup
├── controllers/      # HTTP concerns only
├── middleware/       # validation, error handling, catch-all
├── repositories/     # Prisma data access
├── routes/           # method + URL + middleware + controller wiring
├── schemas/          # Zod schemas (body / params / query)
└── services/         # business logic

prisma/
├── schema.prisma
└── migrations/

tests/                # API integration tests (supertest)
docs/                 # architecture, database, api, scalability
```

---

## 13. Open / Unresolved Decisions

| Topic                 | Decision                                          | Status |
| --------------------- | ------------------------------------------------- | ------ |
| Error middleware      | Single centralized handler + `AppError` hierarchy | Fixed  |
| Validation framework  | Zod, centralized schemas + middleware             | Fixed  |
| ORM                   | Prisma with repository layer                      | Fixed  |
| Test strategy         | supertest integration tests on isolated test DB   | Fixed  |
| Sort safety           | Explicit allowlist mapping                        | Fixed  |
| Pagination bounds     | `page>=1`, `limit 1..100`, default `20`           | Fixed  |
| Dev runner            | `tsx watch` for `npm run dev`                     | Fixed  |
| Prisma client version | v7 (CLI pinned to match `@prisma/client`)         | Fixed  |

No unresolved architectural decisions remain that block feature implementation. Final approval:
**Main Agent.**
