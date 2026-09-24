# TaskForge API — Public Contract (v1.0)

> Status: **FROZEN**
> Freeze phase: Phase 6 (tasks.md)
> This document is the single source of truth for the public HTTP API. Any
> change requires Main Agent approval (see Contract Change Rule).

---

## Base Path

```text
/api
```

## Endpoints

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
GET    /api/health
```

---

## Authentication

Every protected endpoint requires the authenticated client's identity.

Client identity is obtained from the `Authorization` header:

```http
Authorization: Bearer <token>
```

The token is a unique, opaque API token issued at registration/login and is
stored server-side (hashed). It is not a signed claim (no JWT is claimed).

The resolved user becomes the request owner:

```text
user (owner)
   ↓
every query/mutation
```

---

## Owner Scoping

The API exposes two kinds of lists:

```text
Private list   → tasks where isShared = false AND ownerId = current user
Shared list    → tasks where isShared = true (visible to all authenticated users)
```

The client selects the list with the `list` query parameter on `GET /api/tasks`:

```http
GET /api/tasks            # private list (default)
GET /api/tasks?list=shared
```

Invalid `list` values are rejected with `400 VALIDATION_ERROR`.

`GET /api/tasks` also accepts a `status` filter, applied at the database level
against the selected list:

```http
GET /api/tasks?status=todo
GET /api/tasks?list=shared&status=done
```

Allowed status values are `todo`, `in-progress`, `done`. Invalid status values
are rejected with `400 VALIDATION_ERROR`. Omitting `status` returns all tasks in
the selected list.

`GET /api/tasks` supports database-level pagination through `page` and `limit`:

```http
GET /api/tasks?page=2&limit=10
```

* Defaults: `page = 1`, `limit = 20`.
* `limit` maximum is `100`; values above it (and invalid/non-integer values, or
  `page < 1`) are rejected with `400 VALIDATION_ERROR`.
* Pagination is applied with `skip`/`take` at the database level — the server
  never loads all records to paginate in JavaScript.
* Every list response includes a `pagination` object:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

`total` is the total number of tasks in the selected list (after the `status`
filter), `totalPages` is `ceil(total / limit)` (at least 1), and an
out-of-range page returns an empty `data` array with the requested `page`.

`GET /api/tasks` supports server-side sorting via `sortBy` and `sortOrder`:

```http
GET /api/tasks?sortBy=dueDate&sortOrder=asc
```

* Allowed `sortBy` values (allowlisted at server level): `createdAt`,
  `updatedAt`, `dueDate`, `title`, `status`. Anything else →
  `400 VALIDATION_ERROR`. The value is mapped through an explicit allowlist —
  arbitrary input is never used as a database field.
* Allowed `sortOrder` values: `asc`, `desc`. Anything else →
  `400 VALIDATION_ERROR`.
* Defaults: `sortBy=createdAt`, `sortOrder=desc`.
* `status` sorts in database enum order (`todo` < `in-progress` < `done`);
  `dueDate` sorts with null due dates last in both directions; `title` sorts
  alphabetically; `createdAt`/`updatedAt` chronologically.

The parameters combine: `list`, `status`, `sortBy`, `sortOrder`, `page`,
`limit` all work together on one request (see Sorting/Pagination sections).

## Combined Query Processing Order

One request may combine every query capability. Processing order is fixed:

```text
Validate
    ↓
Filter (list + status)
    ↓
Sort (sortBy + sortOrder)
    ↓
Count (total after filter)
    ↓
Paginate (skip/take from page + limit)
    ↓
Respond (data + pagination metadata)
```

The equivalent SQL shape is:

```sql
WHERE isShared = ... AND status = ...
ORDER BY ... ASC|DESC
LIMIT <limit> OFFSET <(page-1) * limit>
```

`total` and `totalPages` always reflect the filtered dataset; pagination does
not affect them. Sorting by `dueDate` uses distinct fixture dates to keep
combined queries deterministic.

Rules:

* A client only reads/writes tasks it can see.
* `isShared = false` tasks are visible only to their `ownerId`.
* `isShared = true` tasks are part of the shared list.
* Writes to a task require the client to see that task.
* Every response that includes a task includes `isShared` and `ownerId`.

---

## Task Object

```json
{
  "id": "UUID",
  "title": "Complete assignment",
  "description": "Finish the implementation",
  "status": "todo",
  "dueDate": "2026-10-01T12:00:00.000Z",
  "owner": {
    "id": "UUID",
    "email": "person@example.com"
  },
  "isShared": false,
  "version": 3,
  "createdAt": "2026-09-24T09:00:00.000Z",
  "updatedAt": "2026-09-24T09:00:00.000Z"
}
```

`isShared` tells a client where the task lives:

* `false` → **private** task on the owner's list.
* `true`  → **shared** task on the shared list.

`version` enables optimistic concurrency so many people can update the same
record safely without clobbering each other (see `PATCH`).

---

## Success Response

Single resource:

```json
{
  "success": true,
  "data": {}
}
```

Collection:

```json
{
  "success": true,
  "data": []
}
```

Paginated collection:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

## Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "title",
        "message": "Title is required"
      }
    ]
  }
}
```

Allowed error codes:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
INVALID_REQUEST
DATABASE_ERROR
INTERNAL_ERROR
REQUEST_TOO_LARGE
RATE_LIMITED
```

---

## Update Task — `PATCH /api/tasks/:id`

Performs a **partial update** of a task visible to the caller. The caller must
resend the `version` it last read; optimistic concurrency rejects stale writes.

Body (all writable fields optional):

```json
{
  "title": "New title",
  "description": "Optional or null",
  "status": "done",
  "dueDate": "2026-11-01T12:00:00.000Z",
  "version": 3
}
```

Rules:

* `version` is a **required** concurrency token: missing → `400
  VALIDATION_ERROR`; stale (drifted since the caller read it) → `409 CONFLICT`.
* A successful update increments `version` by 1.
* Protected fields cannot be sent in the body (`id`, `ownerId`, `isShared`,
  `createdAt`, `updatedAt`) → `403 FORBIDDEN`.
* Updating a task the caller cannot see (another client's private task) →
  `404 NOT_FOUND` (no existence leak).
* Unauthenticated → `401`.

---

## Delete Task — `DELETE /api/tasks/:id`

Deletes a task the caller can see (same owner/visibility scope as read/update).

Rules:

* Success → `204 No Content`, no body.
* A task the caller cannot see — another client's private task, or a
  nonexistent task — → `404 NOT_FOUND` (no existence leak).
* Shared tasks are deletable by any authenticated client.
* Invalid `id` → `400 VALIDATION_ERROR`; unauthenticated → `401`.
* A deleted task is no longer retrievable (`404`).

---

## Nullable Field Contract

Single source of truth for how `description` and `dueDate` behave across
create/update/response.

**Create** (`POST /api/tasks`):

| Request                | Result            |
| ---------------------- | ----------------- |
| Field omitted          | Store `null`      |
| Explicit `null`        | Store `null`      |
| Valid value / `""`     | Store value       |
| Invalid value          | `400`             |

**Update** (`PATCH /api/tasks/:id`):

| Request                | Result                       |
| ---------------------- | ---------------------------- |
| Field omitted          | Preserve existing value      |
| Explicit `null`        | Clear value (set `null`)     |
| Valid value / `""`     | Replace value                |
| Invalid value          | `400`                        |

**Non-nullable:** `title` and `status` cannot be set to `null` on create or
update → `400 VALIDATION_ERROR`.

**Empty string vs null:** `""` is an empty description and is distinct from
`null` (no description). Empty descriptions are never normalized to `null`.

**Responses:** `description` and `dueDate` are always present in single-task and
list responses — `null` when unset. They must never disappear from a payload.

---

## HTTP Status Codes

```text
200  Successful GET/PATCH
201  Successful POST
204  Successful DELETE
400  Validation/invalid request
401  Missing or invalid credentials
403  Authenticated but not permitted to act on this task
404  Resource not found
409  Version conflict (resource changed by another client)
413  Request body exceeds the allowed size (100kb)
429  Auth rate limit exceeded (100 requests / 15 min / IP)
500  Unexpected server error
```

## Request Limits & Rate Limiting

The API applies the following protections to all requests:

```text
JSON body limit:      100kb  → 413 REQUEST_TOO_LARGE on exceed
Security headers:     Set by helmet() on every response
```

Auth endpoints (`POST /api/auth/register`, `POST /api/auth/login`) are throttled
per client IP:

```text
Window:   15 minutes
Limit:    100 requests
Exceed:   429 RATE_LIMITED
```

---

## Contract Change Rule

Any API contract change requires Main Agent approval. Document:

```text
Current Contract
Proposed Contract
Reason
Affected Tests
Affected Files
Backward Compatibility
```
