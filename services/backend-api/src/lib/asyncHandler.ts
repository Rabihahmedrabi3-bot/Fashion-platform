import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 doesn't await handlers, so a rejected promise would otherwise be silently dropped. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
