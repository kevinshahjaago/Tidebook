import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ErrorCode } from "@tidebook/shared";

export function validate(schema: ZodSchema, source: "body" | "query" | "params" = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of (result.error as ZodError).issues) {
        const path = issue.path.join(".");
        fields[path] = issue.message;
      }
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          fields,
        },
      });
      return;
    }
    req[source] = result.data;
    next();
  };
}
