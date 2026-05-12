import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ErrorCode, ErrorCodeType, ApiErrorResponse } from "@tidebook/shared";
import { logger } from "../logger";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCodeType,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly fields?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
    },
  } satisfies ApiErrorResponse);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields && { fields: err.fields }),
      },
    } satisfies ApiErrorResponse);
    return;
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".");
      fields[path] = issue.message;
    }
    res.status(400).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: "Validation failed",
        fields,
      },
    } satisfies ApiErrorResponse);
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");

  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "An unexpected error occurred",
    },
  } satisfies ApiErrorResponse);
}
