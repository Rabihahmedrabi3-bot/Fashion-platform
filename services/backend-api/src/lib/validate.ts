import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

/**
 * Validates and replaces req.body. Failures are forwarded to errorHandler
 * via next(), which returns 422. A request with no body at all (no
 * Content-Type: application/json) leaves req.body undefined rather than
 * `{}`, which would otherwise fail schemas that are all-optional-fields -
 * treat "nothing sent" the same as "an empty object sent".
 */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
