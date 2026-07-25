import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

// Express only treats a 4-arg function as error-handling middleware, so _req/_next must stay even if unused.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: "validation_failed",
      fields: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(422).json({ error: "upload_failed", message: err.message });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code ?? "error", message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "internal_server_error" });
}
