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
500  Unexpected server error
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
