# Scalability — TaskForge-API

How the system stays fast, predictable, and deployable as the user base grows
(mid-term target: ~1M users), **without** prematurely splitting into
microservices or adding infrastructure that the current code does not use.

The default remains a **modular monolith → managed PostgreSQL** on the Vercel
platform. Every item below is split into two groups:

* **Current** — what is implemented and verified today (never invent more).
* **Future options** — concrete, gated growth levers. Nothing in this section
  is live; each has a trigger and an owner.

---

## Current state (verified)

* **Stateless API** — no in-memory session state, no sticky sessions, no
  per-process cache. Any instance can serve any request, so horizontal scaling
  is a *deployment* concern, not a *code* one.
* **Stateless auth** — opaque bearer tokens (bcrypt-hashed at rest), not
  server sessions. Tokens survive instance restarts because they are not held
  in memory.
* **Single Postgres writer** — one managed `DATABASE_URL` (Neon/Supabase/RDS);
  Prisma is the data layer, idle-connection killed per process.
* **Rate limiting state** — `express-rate-limit` defaults to an **in-memory**
  counter per process instance (documented behavior; a per-process window is
  accepted at this scale — see `docs/security-review.md`).
* **Optimistic concurrency** — `version` column on `Task`; conflict → `409
  CONFLICT`. No table locks, no blocking transactions on the write path.
* **Predictable queries** — a fixed allowlist for sorting; pagination is
  `page`/`limit` (max 100) with a `LIMIT/OFFSET` query + a `count`. No
  arbitrary client ordering.
* **Input sizing** — JSON bodies capped at 100 KB; auth endpoint rate-limited
  (100 req / 15 min / IP).
* **Health + documentation** — `/api/health` liveness probe; OpenAPI served
  live at `/api-docs`.

Growth strategy therefore leans on **stateless code + managed Postgres first**;
the API itself is not the bottleneck at 1M users — the DB and the token store
are.

---

## Current non-goals (deliberate)

| Not doing today | Why |
| --------------- | --- |
| Microservices | They over-route, cost QPS, and add ops burden before there are 10+ teams. |
| Redis cache | No hot read path yet that justifies consistency risk. |
| Message queue | No async batch workload exists yet. |
| Multi-region DB | Single region writer with replicas is enough to start. |

---

## Future options (gated — do NOT implement before the trigger)

Each row: **trigger** → **what to do** → **who owns** → **knock-on effect**.

### 1. Connection pooling

* **Trigger** — Prisma shows pooled-connection pressure under concurrent
  serverless invocations, or latency degrades in load tests.
* **Do** — move to a **pooled** `DATABASE_URL` (e.g. Neon `-pooler`,
  Supabase transaction pooler, or PgBouncer/`pgbouncer` container) and point
  Prisma at it. Prisma's default `DATABASE_URL` stays the direct one.
* **Owner** — Main Agent + DevOps.
* **Effect** — removes per-invocation connection creation; the single shared
  PrismaClient stays.

### 2. Read replicas

* **Trigger** — `GET /api/tasks` read latency or `SELECT COUNT(*)`
  pagination cost becomes measurable under load.
* **Do** — configure a read replica; add a second datasource for read-only
  queries *only* (Prisma supports multiple datasources).
* **Owner** — Database Agent.
* **Effect** — reduces load on the single writer; requires careful
  read-after-write consistency handling for `GET /api/tasks/:id`.

### 3. Redis cache

* **Trigger** — a specific read pattern shows high hit-rate opportunity and
  the cache can be invalidated deterministically (owned task lists are the
  candidate).
* **Do** — introduce Redis *only* with a defined eviction/invalidation key
  plan. Prefer Vercel-hosted KV / Upstash.
* **Owner** — Architecture Agent.
* **Effect** — must keep optimistic `version` semantics, so write-through or
  invalidation must be provably correct.
* **⚠ Gate** — an in-memory cache violates cross-instance consistency; never
  implement without a cross-instance invalidation key.

### 4. Background jobs / queue

* **Trigger** — any async operation appears (e.g. notifications, reports,
  bulk import).
* **Do** — use a queue (e.g. Vercel `waitUntil`-style or Upstash QStash /
  Celery on a worker). Push work off the request path; keep the API handler
  synchronous.
* **Owner** — Main Agent.
* **Effect** — needs a job table + retry semantics; out of current scope.

### 5. Rate limiting degradation

* **Trigger** — per-process rate windows prove insufficient under
  distribution.
* **Do** — move the counter to a shared store (Redis) or Vercel edge
  middleware limit.
* **Owner** — Security Agent.
* **Effect** — semantically identical to current behavior, just shared across
  instances.

### 6. Multi-region / CDN

* **Trigger** — sustained cross-region latency complaints or a clear geography.
* **Do** — replicate to a second region behind the platform L7 edge; keep a
  single logical writer.
* **Owner** — DevOps.
* **Effect** — primarily a platform configuration concern, not an app change.

---

## The scaling decision tree

Ask in order; only proceed when the branch is justified:

1. Is the bottleneck app code? → keep modular monolith; optimize queries.
2. Is it DB? → pooling → indexes → replicas → partitioning.
3. Is it cross-instance shared state? → shared store (Redis) — never in-memory.
4. Is it async work? → background queue.
5. Only then: consider splitting a service.

---

## Load-test assumptions (design targets, not guarantees)

* Target: support ~1M registered users with modest per-user task volume and
  normal distribution of `GET /api/tasks` pagination traffic.
* The above implies the read path and the auth path must be cheap; the frozen
  API contract forces a bounded result set (max `limit=100`), which keeps
  `LIMIT/OFFSET + count` cheap.
* No benchmark numbers are claimed here because no load generator has been run
  against the codebase yet. Numbers will be recorded in
  `docs/performance-notes.md` once a load test exists.

---

## Keep it simple checklist

* Keep the modular monolith until a concrete service boundary exists.
* Never add async/queue infra for work that is not implemented.
* Never introduce a cache branch without an invalidation proof.
* Keep every endpoint response complexity bounded by the contract.
* Every capacity claim must be backed by a real measurement, not an estimate.
