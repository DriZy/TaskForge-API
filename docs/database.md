# TaskForge-API — Database Design

**Source of truth:** `prisma/schema.prisma` and the migrations in `prisma/migrations/`.
**ORM/CLI:** Prisma 6 (stable LTS). **Database:** PostgreSQL 16.

---

## 1. Overview

```text
API (Prisma Client)
    ↓  DATABASE_URL
PostgreSQL 16 (docker-compose `postgres` service, taskforge DB)
```

PostgreSQL runs in **PostgreSQL 16 — `postgres:16-alpine`** via Docker (Phase 3). No host
PostgreSQL is required. Schema changes are managed exclusively through Prisma migrations.

---

## 2. Task Model

| Field         | Type                     | Nullable | Default             | Notes                                        |
| ------------- | ------------------------ | -------- | ------------------- | -------------------------------------------- |
| `id`          | UUID (string)            | No       | `uuid()`            | Primary key. Client-side generated UUID.     |
| `title`       | String                   | No       | —                   | Free text; ≥1 char, validated by the API.    |
| `description` | String                   | Yes      | `null`              | Nullable by contract.                        |
| `status`      | `enum TaskStatus`        | No       | `todo`              | One of `todo`/`in_progress`/`done`.          |
| `dueDate`     | Timestamp with time zone | Yes      | `null`              | Nullable by contract. Stored as timestamptz. |
| `createdAt`   | Timestamp with time zone | No       | `CURRENT_TIMESTAMP` | Managed by Prisma.                           |
| `updatedAt`   | Timestamp with time zone | No       | —                   | Auto-updated by Prisma on every write.       |

UTC is used consistently: `createdAt`, `updatedAt` and `dueDate` are stored with time zone
(`timestamptz`) and Prisma returns them as UTC instants.

---

## 3. Status Enum

Prisma enums cannot contain hyphens, so the database value for the API's `in-progress` is
stored as `in_progress`:

| API value     | Stored enum value |
| ------------- | ----------------- |
| `todo`        | `todo`            |
| `in-progress` | `in_progress`     |
| `done`        | `done`            |

The mapping lives in the API schema/validation layer (`src/schemas/`), never in SQL.

---

## 4. Constraints

Enforced **at the database level** (in addition to application/Zod validation):

- `PRIMARY KEY (id)` — every task has a unique id.
- `title IS NOT NULL` — a task always has a title.
- `status IS NOT NULL` — a task always has a status (defaults to `todo`).
- `description` — nullable (may be `NULL`).
- `dueDate` — nullable (may be `NULL`).
- `createdAt`/`updatedAt` — non-null, Prisma-managed.
- A helper **check constraint** `description IS NULL → title IS NOT NULL`** is not needed:** the
  schema already guarantees non-null `title` and `status`; nullable fields are only `description`
  and `dueDate`.

No constraints on value ranges that would impose config changes are used; allowed statuses are
enforced by the `TaskStatus` enum, so a raw SQL insert with an unknown status is rejected.

---

## 5. Indexes

Indexes were chosen to **match the exact query shapes** the API exposes, not added speculatively.

| Query (API)                        | Supporting index      | Why                                    |
| ---------------------------------- | --------------------- | -------------------------------------- |
| Filter by `status`                 | `(status)`            | `WHERE status = $1`                    |
| Sort by `dueDate`                  | `(dueDate)`           | `ORDER BY dueDate`                     |
| Default sort `createdAt` desc      | `(createdAt)`         | `ORDER BY createdAt DESC`              |
| Filter `status` + sort `createdAt` | `(status, createdAt)` | Composite filter+sort (combined query) |
| Filter `status` + sort `dueDate`   | `(status, dueDate)`   | Composite filter+sort (combined query) |

Rationale:

- The two composite indexes cover the **combined filter + sort** path, which is the most common
  read workload after plain CRUD.
- Single-column indexes remain cheap for standalone `status`/`dueDate`/`createdAt` filters.
- `title` and `description` are **not** indexed: the sort allowlist includes `title`, but
  `ORDER BY title` is served fine without an index at expected scale, and there is no
  title-based lookup query to justify one yet.
- `updatedAt` is not indexed (no query sorts/exists on it today; revisit if a "recently updated"
  feed is added).

---

## 6. Migration Strategy

```text
prisma migrate dev   → local development (creates + applies, resets if needed)
prisma migrate deploy → production / CI (applies committed migrations, read-only; no drift)
prisma generate      → regenerate the typed Prisma Client
```

- Every schema change gets **one migration** under `prisma/migrations/` via `prisma migrate dev
--name <name>`, in TDD order (tests first).
- Migrations are committed to the repository. Production applies them with `migrate deploy`
  (never `migrate dev`).
- Reverse migrations are not automatic; a corrective forward migration is the standard rollback
  strategy for this codebase.
- The dev database is disposable — `docker compose down -v` removes data; migrations recreate it.

Commands:

```bash
docker compose exec api npx prisma migrate dev   # apply latest as the CLI writes it
```

`db:migrate`, `db:generate`, `db:studio` scripts are in `package.json`.

---

## 7. Environment / Connection

- `DATABASE_URL` is read from the environment — **never hard-coded**.
- Inside compose, the API uses the in-network URL (`postgres:5432`); the host CLI uses
  `127.0.0.1:5432` (compose publishes it).
- No connection-string is committed; `.env.example` has placeholders only.
- The test suite uses a separate isolated database (see `docs/testing.md`), never production.

---

## 8. Nullable-Field Contract (prisma level)

Prisma is the final gate that enforces the Phase 11 contract:

- `description: null` and `dueDate: null` are writable — they clear the value.
- Omitting a field on update means Prisma's field is simply not in the `update` payload.
- The repository must preserve this: it must **not** drop explicit `null`s when building the
  `update` object (this is validated in Phase 11 tests).
