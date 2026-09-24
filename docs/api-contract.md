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
