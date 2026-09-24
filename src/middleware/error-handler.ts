import type { ErrorRequestHandler } from "express";
import type { ZodError } from "zod";
import { AppError } from "./app-error";

function isZodError(error: unknown): error is ZodError {
  return error instanceof Error && "issues" in error;
}

function isEntityTooLarge(error: unknown): error is { type: string; status: number; statusCode: number } {
  return (
    error instanceof Error &&
    "type" in error &&
    (error as { type?: string }).type === "entity.too.large"
  );
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (isZodError(error)) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (isEntityTooLarge(error)) {
    res.status(413).json({
      success: false,
      error: {
        code: "REQUEST_TOO_LARGE",
        message: "Request body exceeds the allowed size",
      },
    });
    return;
  }

  console.error("[error-handler] unexpected error", error);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
};
