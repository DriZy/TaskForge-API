import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  registerSchema,
  loginSchema,
} from "../schemas/auth.schemas";
import {
  createTaskSchema,
  updateTaskSchema,
} from "../schemas/task.schemas";
import {
  taskListQuerySchema,
  taskIdParamsSchema,
} from "../schemas/task-query.schemas";

extendZodWithOpenApi(z);

const taskStatus = z
  .enum(["todo", "in-progress", "done"])
  .openapi({
    example: "in-progress",
    description: "Task status. Stored as the DB enum (in_progress internally).",
  });

const task = z
  .object({
    id: z.string().uuid().openapi({ description: "Task UUID" }),
    title: z.string().openapi({ description: "Task title" }),
    description: z.string().nullable().openapi({ description: "Task description or null" }),
    status: taskStatus,
    dueDate: z.string().datetime({ offset: true }).nullable().openapi({
      description: "Due date ISO-8601 or null",
    }),
    ownerId: z.string().uuid().openapi({ description: "Owner user UUID" }),
    owner: z
      .object({
        id: z.string().uuid(),
        email: z.string().email(),
      })
      .openapi({ description: "Task owner summary" }),
    isShared: z.boolean().openapi({ description: "true = shared list, false = private list" }),
    version: z.number().int().openapi({
      description: "Optimistic concurrency token; required on PATCH",
      example: 1,
    }),
    createdAt: z.string().datetime().openapi({ description: "ISO-8601 creation time" }),
    updatedAt: z.string().datetime().openapi({ description: "ISO-8601 last modification time" }),
  })
  .openapi("Task");

const pagination = z
  .object({
    page: z.number().int().openapi({ example: 1 }),
    limit: z.number().int().openapi({ example: 20 }),
    total: z.number().int().openapi({ example: 45 }),
    totalPages: z.number().int().openapi({ example: 3 }),
  })
  .openapi("Pagination");

const taskListResult = z
  .object({
    success: z.literal(true),
    data: z.array(task).openapi({ description: "Paginated task slice" }),
    pagination,
  })
  .openapi("TaskListResult");

const errorDetail = z
  .object({
    field: z.string().openapi({ description: "Field path that failed validation" }),
    message: z.string().openapi({ description: "Human-readable failure reason" }),
  })
  .openapi("ErrorDetail");

const errorEnvelope = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: z.string().openapi({
          description:
            "Machine code: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, INVALID_REQUEST, DATABASE_ERROR, INTERNAL_ERROR",
        }),
        message: z.string(),
        details: z.array(errorDetail).optional(),
      })
      .openapi("Error"),
  })
  .openapi("ErrorEnvelope");

const authResult = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        token: z.string().openapi({ description: "Opaque bearer API token" }),
        user: z.object({
          id: z.string().uuid(),
          email: z.string().email(),
        }),
      })
      .openapi("AuthData"),
  })
  .openapi("AuthResult");

const healthResult = z
  .object({
    success: z.literal(true),
    data: z.object({ status: z.literal("ok") }),
  })
  .openapi("HealthResult");

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "opaque-token",
  description: "Opaque API token issued by POST /api/auth/register or /login",
});

// Reusable component schemas.
registry.register("Task", task);
registry.register("Pagination", pagination);
registry.register("TaskListResult", taskListResult);
registry.register("ErrorEnvelope", errorEnvelope);
registry.register("AuthResult", authResult);
registry.register("HealthResult", healthResult);

// Paths.
registry.registerPath({
  method: "get",
  path: "/api/health",
  summary: "Service health",
  tags: ["Health"],
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: healthResult } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/register",
  summary: "Register a new account",
  description: "Creates a user and returns an opaque bearer token.",
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: registerSchema } },
    },
  },
  responses: {
    201: {
      description: "Account created",
      content: { "application/json": { schema: authResult } },
    },
    400: {
      description: "Validation failed",
      content: { "application/json": { schema: errorEnvelope } },
    },
    409: {
      description: "Email already registered",
      content: { "application/json": { schema: errorEnvelope } },
    },
    413: {
      description: "Request body exceeds the 100kb limit",
      content: { "application/json": { schema: errorEnvelope } },
    },
    429: {
      description: "Auth rate limit exceeded (100 req / 15 min / IP)",
      content: { "application/json": { schema: errorEnvelope } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  summary: "Log in",
  description: "Returns an opaque bearer token for valid credentials.",
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: loginSchema } },
    },
  },
  responses: {
    200: {
      description: "Token issued",
      content: { "application/json": { schema: authResult } },
    },
    400: {
      description: "Validation failed",
      content: { "application/json": { schema: errorEnvelope } },
    },
    401: {
      description: "Invalid credentials",
      content: { "application/json": { schema: errorEnvelope } },
    },
    429: {
      description: "Auth rate limit exceeded (100 req / 15 min / IP)",
      content: { "application/json": { schema: errorEnvelope } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks",
  summary: "List tasks",
  description:
    "Lists the caller's private tasks (default) or the shared list, with optional status filter, sorting and pagination.",
  tags: ["Tasks"],
  security: [{ bearerAuth: [] }],
  request: {
    query: taskListQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated, filtered, sorted task list",
      content: { "application/json": { schema: taskListResult } },
    },
    400: {
      description: "Invalid query parameters",
      content: { "application/json": { schema: errorEnvelope } },
    },
    401: {
      description: "Missing or invalid token",
      content: { "application/json": { schema: errorEnvelope } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks",
  summary: "Create a task",
  tags: ["Tasks"],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: createTaskSchema } },
    },
  },
  responses: {
    201: {
      description: "Task created",
      content: { "application/json": { schema: z.object({ success: z.literal(true), data: task }) } },
    },
    400: {
      description: "Validation failed",
      content: { "application/json": { schema: errorEnvelope } },
    },
    401: {
      description: "Missing or invalid token",
      content: { "application/json": { schema: errorEnvelope } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}",
  summary: "Get a task",
  tags: ["Tasks"],
  security: [{ bearerAuth: [] }],
  request: {
    params: taskIdParamsSchema,
  },
  responses: {
    200: {
      description: "The requested task",
      content: { "application/json": { schema: z.object({ success: z.literal(true), data: task }) } },
    },
    400: {
      description: "Invalid id",
      content: { "application/json": { schema: errorEnvelope } },
    },
    401: {
      description: "Missing or invalid token",
      content: { "application/json": { schema: errorEnvelope } },
    },
    404: {
      description: "Not found or not visible to caller",
      content: { "application/json": { schema: errorEnvelope } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/tasks/{id}",
  summary: "Update a task",
  description:
    "Partial update. Resend the version you last read; a stale version returns 409. Protected fields (id, ownerId, isShared, createdAt, updatedAt) in the body return 403.",
  tags: ["Tasks"],
  security: [{ bearerAuth: [] }],
  request: {
    params: taskIdParamsSchema,
    body: {
      content: { "application/json": { schema: updateTaskSchema } },
    },
  },
  responses: {
    200: {
      description: "Task updated; version incremented",
      content: { "application/json": { schema: z.object({ success: z.literal(true), data: task }) } },
    },
    400: {
      description: "Validation failed or missing version",
      content: { "application/json": { schema: errorEnvelope } },
    },
    401: {
      description: "Missing or invalid token",
      content: { "application/json": { schema: errorEnvelope } },
    },
    403: {
      description: "Protected field in body",
      content: { "application/json": { schema: errorEnvelope } },
    },
    404: {
      description: "Not found or not visible to caller",
      content: { "application/json": { schema: errorEnvelope } },
    },
    409: {
      description: "Version conflict",
      content: { "application/json": { schema: errorEnvelope } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/tasks/{id}",
  summary: "Delete a task",
  tags: ["Tasks"],
  security: [{ bearerAuth: [] }],
  request: {
    params: taskIdParamsSchema,
  },
  responses: {
    204: { description: "Task deleted (no body)" },
    400: {
      description: "Invalid id",
      content: { "application/json": { schema: errorEnvelope } },
    },
    401: {
      description: "Missing or invalid token",
      content: { "application/json": { schema: errorEnvelope } },
    },
    404: {
      description: "Not found or not visible to caller",
      content: { "application/json": { schema: errorEnvelope } },
    },
  },
});

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "TaskForge API",
      version: "1.0.0",
      description:
        "Production-quality REST API for task management.\n\nAuthentication uses an opaque bearer token issued at register/login (see /api/auth).",
    },
    servers: [{ url: "/", description: "Local API" }],
    tags: [
      { name: "Health", description: "Service health" },
      { name: "Auth", description: "Authentication" },
      { name: "Tasks", description: "Task CRUD" },
    ],
  });
}