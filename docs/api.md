# TaskForge-API — API Reference

This is the **quick reference** for interacting with the TaskForge-API. The
**single source of truth** for every request/response schema, status code, and
validation rule is:

* the frozen contract — [`docs/api-contract.md`](docs/api-contract.md)
* the live, generated OpenAPI 3.1 spec — **Swagger UI** at `/api-docs`
  (JSON: `/api-docs.json`)

Only endpoints that are actually implemented are documented below. If a shape
is not shown here or in the contract, it does not exist.

---

## Conventions

### Base URL

```text
http://localhost:3000       (local dev)
https://<vercel-project>    (deployed)
```

### Response envelope

Every success response is:

```json
{ "success": true, "data": <payload> }
```

Every error response is:

```json
{
  "success": false,
  "error": { "code": "<MACHINE_CODE>", "message": "<human text>" }
}
```

Many endpoints extend the error with a `"details"` array for per-field
validation failures.

### Authentication

The API uses **opaque bearer tokens** (no JWTs). Register or log in to obtain
one, then send it on **every** task request:

```http
Authorization: Bearer <token>
```

| Code | When |
| ---- | ---- |
| `401 UNAUTHORIZED` | Missing/malformed header, unknown/expired token, or token owner no longer exists |

### Rate limiting & body limit

Applies to `/api/auth/*`:

| Code | When |
| ---- | ---- |
| `429 RATE_LIMITED` | More than 100 requests per 15 minutes per IP |
| `413 REQUEST_TOO_LARGE` | Body larger than 100 KB |

---

## Endpoints

### `GET /api/health`

Liveness probe. No auth.

**200**

```json
{ "success": true, "data": { "status": "ok" } }
```

---

### `POST /api/auth/register`

No auth. Fields:

| Field | Type | Rules |
| ----- | ---- | ----- |
| `email` | string | trimmed, lowercased, valid email, ≤ 254 chars |
| `password` | string | 12–128 chars |

**201** — returns `{ data: { token, user: { id, email } } }`
**400** — validation failed (`details` per field)
**409** — email already registered
**429** — rate limited

---

### `POST /api/auth/login`

No auth. Fields:

| Field | Type | Rules |
| ----- | ---- | ----- |
| `email` | string | trimmed, lowercased |
| `password` | string | required |

**200** — returns `{ data: { token, user: { id, email } } }`
**400** — validation failed
**401** — invalid credentials
**429** — rate limited

---

### `POST /api/tasks` — Create task

Bearer token required. Fields:

| Field | Type | Rules |
| ----- | ---- | ----- |
| `title` | string | required, 1–255 chars |
| `description` | string \| null | optional |
| `status` | enum | `todo` \| `in-progress` \| `done` (default `todo`) |
| `dueDate` | string \| null | optional, ISO-8601 with offset |
| `isShared` | boolean | optional (default `false`) |

**201** — returns the created task (see [Task object](#task-object))
**400** — validation failed
**401** — auth required

---

### `GET /api/tasks` — List tasks

Bearer token required. Supports filtering, sorting, pagination (all optional).

| Query | Values | Default |
| ----- | ------ | ------- |
| `list` | `private` \| `shared` | `private` |
| `status` | `todo` \| `in-progress` \| `done` | — |
| `sortBy` | `createdAt` \| `updatedAt` \| `dueDate` \| `title` \| `status` | `createdAt` |
| `sortOrder` | `asc` \| `desc` | `desc` |
| `page` | int ≥ 1 | `1` |
| `limit` | int 1–100 | `20` |

**200** — returns `{ data: { tasks: [...], pagination: { page, limit, total, totalPages } } }`
**400** — invalid query (e.g. `limit > 100`)
**401** — auth required

---

### `GET /api/tasks/:id` — Get one task

Bearer token required. Returns tasks you own **or** shared tasks.

**200** — the task
**400** — invalid `id` (must be a UUID)
**401** — auth required
**404** — `NOT_FOUND` (your private list or a task not visible to you)

---

### `PATCH /api/tasks/:id` — Update task

Bearer token required. **Optimistic concurrency** — the body **must** include
`version` (the value you last read).

| Field | Type | Rules |
| ----- | ---- | ----- |
| `version` | int ≥ 1 | **required** — the version you read |
| `title` | string | optional, 1–255 |
| `description` | string \| null | optional |
| `status` | enum | optional |
| `dueDate` | string \| null | optional |

**200** — returns the updated task
**400** — validation failed or missing `version`
**401** — auth required
**403** — a protected field was in the body
**404** — not found / not visible to you
**409** — `version` is stale — read again and retry; task was updated elsewhere

---

### `DELETE /api/tasks/:id` — Delete task

Bearer token required.

**204** — deleted (no body)
**400** — invalid `id`
**401** — auth required
**404** — not found / not visible to you

---

## Task object

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string | null",
  "status": "todo | in-progress | done",
  "dueDate": "ISO-8601 | null",
  "ownerId": "uuid",
  "owner": { "id": "uuid", "email": "string" },
  "isShared": false,
  "version": 1,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

---

## SDK-less quick start

```bash
# 1. register
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"correct-horse-battery"}' \
  | jq -r .data.token)

# 2. create a task
TASK=$(curl -s -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Ship TaskForge","status":"in-progress"}')

# 3. update with the version you read (optimistic concurrency)
VERSION=$(echo "$TASK" | jq -r .data.version)
curl -s -X PATCH "http://localhost:3000/api/tasks/$(echo "$TASK" | jq -r .data.id)" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"version\":$VERSION,\"status\":\"done\"}"
```
